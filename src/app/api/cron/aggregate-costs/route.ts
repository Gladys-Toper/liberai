import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calculateTokenCost, calculateStorageCost, calculateEmbeddingCost } from '@/lib/payments/pricing'
import { getCostProviders, getSplitProvider, getChainProvider } from '@/lib/providers'

export const maxDuration = 300 // 5 minutes for cron

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getDb()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const dateStr = yesterday.toISOString().split('T')[0]
  const nextDateStr = new Date().toISOString().split('T')[0]

  const results: string[] = []

  try {
    // ─── Step 1: AI costs per book (reader chat) ─────────────
    const { data: readerMessages } = await db
      .from('chat_messages')
      .select('conversation_id, model_used, input_tokens, output_tokens')
      .eq('role', 'assistant')
      .gte('created_at', dateStr)
      .lt('created_at', nextDateStr)

    // Map conversations to books
    const convIds = [...new Set((readerMessages || []).map(m => m.conversation_id))]
    let convToBook = new Map<string, string>()

    if (convIds.length > 0) {
      const { data: convos } = await db
        .from('chat_conversations')
        .select('id, book_id')
        .in('id', convIds)

      for (const c of convos || []) {
        convToBook.set(c.id, c.book_id)
      }
    }

    // Aggregate AI costs per book
    const bookAiCosts = new Map<string, { cost: number; tokens: number }>()
    for (const msg of readerMessages || []) {
      const bookId = convToBook.get(msg.conversation_id)
      if (!bookId) continue
      const cost = calculateTokenCost(
        msg.model_used || 'gemini',
        msg.input_tokens || 0,
        msg.output_tokens || 0,
      )
      const existing = bookAiCosts.get(bookId) || { cost: 0, tokens: 0 }
      existing.cost += cost
      existing.tokens += (msg.input_tokens || 0) + (msg.output_tokens || 0)
      bookAiCosts.set(bookId, existing)
    }

    // Upsert reader AI costs
    for (const [bookId, data] of bookAiCosts) {
      await db.from('book_costs').upsert({
        book_id: bookId,
        cost_date: dateStr,
        cost_type: 'ai_reader_chat',
        amount_usd: data.cost,
        units: data.tokens,
        unit_label: 'tokens',
      }, { onConflict: 'book_id,cost_date,cost_type' })
    }
    results.push(`AI reader costs: ${bookAiCosts.size} books`)

    // ─── Step 2: Storage costs per book ──────────────────────
    const { data: uploads } = await db
      .from('book_uploads')
      .select('book_id, file_size_bytes')
      .not('book_id', 'is', null)

    for (const upload of uploads || []) {
      if (!upload.book_id || !upload.file_size_bytes) continue
      const cost = calculateStorageCost(upload.file_size_bytes)
      await db.from('book_costs').upsert({
        book_id: upload.book_id,
        cost_date: dateStr,
        cost_type: 'storage',
        amount_usd: cost,
        units: upload.file_size_bytes,
        unit_label: 'bytes',
      }, { onConflict: 'book_id,cost_date,cost_type' })
    }
    results.push(`Storage costs: ${(uploads || []).length} books`)

    // ─── Step 3: Embedding costs per book ────────────────────
    const { data: chunkCounts } = await db
      .rpc('get_book_chunk_counts')
      .select('*')
      .then(res => res) // fallback if RPC doesn't exist

    // Fallback: count chunks manually
    if (!chunkCounts) {
      const { data: books } = await db
        .from('books')
        .select('id')

      for (const book of books || []) {
        const { count } = await db
          .from('book_chunks')
          .select('id', { count: 'exact', head: true })
          .eq('book_id', book.id)

        if (count && count > 0) {
          const cost = calculateEmbeddingCost(count)
          await db.from('book_costs').upsert({
            book_id: book.id,
            cost_date: dateStr,
            cost_type: 'embeddings',
            amount_usd: cost,
            units: count,
            unit_label: 'chunks',
          }, { onConflict: 'book_id,cost_date,cost_type' })
        }
      }
    }
    results.push('Embedding costs aggregated')

    // ─── Step 4: Platform infra costs ────────────────────────
    const costProviders = getCostProviders()
    const activeBooks = new Set<string>()

    // Determine active books (had a sale or chat in last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: recentOrders } = await db
      .from('orders')
      .select('book_id')
      .eq('status', 'completed')
      .gte('created_at', thirtyDaysAgo.toISOString())

    for (const o of recentOrders || []) activeBooks.add(o.book_id)

    const { data: recentConvos } = await db
      .from('chat_conversations')
      .select('book_id')
      .gte('created_at', thirtyDaysAgo.toISOString())

    for (const c of recentConvos || []) activeBooks.add(c.book_id)

    // If no active books, use all books
    if (activeBooks.size === 0) {
      const { data: allBooks } = await db.from('books').select('id')
      for (const b of allBooks || []) activeBooks.add(b.id)
    }

    const activeBookCount = activeBooks.size

    for (const provider of costProviders) {
      if (provider.source === 'ai') continue // AI costs handled per-book above

      const snapshot = await provider.getDailyCost(yesterday)

      // Save platform snapshot
      const category = provider.source === 'vercel' ? 'vercel' : 'supabase'
      await db.from('platform_cost_snapshots').upsert({
        snapshot_date: dateStr,
        cost_category: category,
        amount_usd: snapshot.amount,
        raw_data: snapshot.raw || {},
      }, { onConflict: 'snapshot_date,cost_category' })

      // Distribute equally among active books
      if (activeBookCount > 0) {
        const perBookCost = snapshot.amount / activeBookCount
        const costType = provider.source === 'vercel' ? 'infra_vercel' : 'infra_supabase'

        for (const bookId of activeBooks) {
          await db.from('book_costs').upsert({
            book_id: bookId,
            cost_date: dateStr,
            cost_type: costType,
            amount_usd: perBookCost,
            units: 1,
            unit_label: 'share',
          }, { onConflict: 'book_id,cost_date,cost_type' })
        }
      }
    }
    results.push(`Infra costs distributed across ${activeBookCount} active books`)

    // ─── Step 5: Compute author roll-ups ─────────────────────
    const { data: authors } = await db
      .from('authors')
      .select('id, split_contract_address')

    const profitBps = Number(process.env.LIBERAI_PROFIT_BPS) || 1000
    const profitRate = profitBps / 10000

    for (const author of authors || []) {
      // Get all book costs for this author (30-day window)
      const { data: authorBooks } = await db
        .from('books')
        .select('id')
        .eq('author_id', author.id)

      if (!authorBooks?.length) continue

      const bookIds = authorBooks.map(b => b.id)

      const { data: costs } = await db
        .from('book_costs')
        .select('cost_type, amount_usd')
        .in('book_id', bookIds)
        .gte('cost_date', thirtyDaysAgo.toISOString().split('T')[0])

      let aiCosts = 0, storageCosts = 0, infraCosts = 0
      for (const c of costs || []) {
        const amt = Number(c.amount_usd)
        if (c.cost_type.startsWith('ai_')) aiCosts += amt
        else if (c.cost_type === 'storage' || c.cost_type === 'embeddings') storageCosts += amt
        else infraCosts += amt
      }
      const totalBookCosts = aiCosts + storageCosts + infraCosts

      // Revenue from orders
      const { data: orders } = await db
        .from('orders')
        .select('amount')
        .in('book_id', bookIds)
        .eq('status', 'completed')
        .gte('created_at', thirtyDaysAgo.toISOString())

      const totalRevenue = (orders || []).reduce((s, o) => s + Number(o.amount), 0)
      const netProfit = Math.max(0, totalRevenue - totalBookCosts)
      const authorShare = netProfit * (1 - profitRate)
      const platformShare = totalBookCosts + netProfit * profitRate

      const splitLiberaiPct = totalRevenue > 0
        ? Math.min(50, Math.max(10, (platformShare / totalRevenue) * 100))
        : 10

      await db.from('author_cost_rollups').upsert({
        author_id: author.id,
        rollup_date: dateStr,
        total_book_costs: totalBookCosts,
        ai_costs: aiCosts,
        storage_costs: storageCosts,
        infra_costs: infraCosts,
        total_revenue: totalRevenue,
        net_profit: netProfit,
        author_share: authorShare,
        platform_share: platformShare,
        split_liberai_pct: splitLiberaiPct,
      }, { onConflict: 'author_id,rollup_date' })

      // ─── Step 6: Update on-chain splits if needed ──────────
      if (author.split_contract_address && process.env.SERVER_WALLET_PRIVATE_KEY) {
        try {
          // Check if split % changed significantly (>0.5%)
          const { data: prevRollup } = await db
            .from('author_cost_rollups')
            .select('split_liberai_pct')
            .eq('author_id', author.id)
            .lt('rollup_date', dateStr)
            .order('rollup_date', { ascending: false })
            .limit(1)
            .single()

          const prevPct = prevRollup ? Number(prevRollup.split_liberai_pct) : 0
          const pctDiff = Math.abs(splitLiberaiPct - prevPct)

          if (pctDiff > 0.5 || !prevRollup) {
            const splitProvider = getSplitProvider()
            const platformWallet = process.env.PLATFORM_WALLET_ADDRESS!
            const { data: authorData } = await db
              .from('authors')
              .select('wallet_address')
              .eq('id', author.id)
              .single()

            if (authorData?.wallet_address) {
              const liberaiAllocation = Math.round(splitLiberaiPct * 100) // to basis points
              const authorAllocation = 10000 - liberaiAllocation

              await splitProvider.updateSplit(author.split_contract_address, [
                { address: platformWallet, percentAllocation: liberaiAllocation },
                { address: authorData.wallet_address, percentAllocation: authorAllocation },
              ])
              results.push(`Updated split for author ${author.id}: LiberAi ${splitLiberaiPct.toFixed(2)}%`)
            }
          }
        } catch (e) {
          console.error(`Failed to update split for author ${author.id}:`, e)
        }
      }
    }
    results.push(`Author rollups: ${(authors || []).length} authors`)

    return NextResponse.json({ success: true, date: dateStr, results })
  } catch (error) {
    console.error('Cost aggregation failed:', error)
    return NextResponse.json(
      { error: 'Cost aggregation failed', details: String(error) },
      { status: 500 },
    )
  }
}
