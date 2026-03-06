'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, Wallet, ExternalLink, Save, Info, Key, ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

interface AuthorSettings {
  id: string
  display_name: string
  bio: string | null
  avatar_url: string | null
  wallet_address: string | null
  split_contract_address: string | null
  split_explorer_url: string | null
}

interface BookPnL {
  bookId: string
  bookTitle: string
  price: number
  revenue: number
  orderCount: number
  costs: {
    aiCost: number
    storageCost: number
    infraCost: number
    embeddingCost: number
    total: number
  }
  netProfit: number
  authorShare: number
  platformShare: number
}

interface AuthorPnL {
  authorId: string
  books: BookPnL[]
  totals: {
    revenue: number
    totalCosts: number
    netProfit: number
    authorShare: number
    platformShare: number
  }
  splitLiberaiPct: number
}

export default function SettingsPage() {
  const [author, setAuthor] = useState<AuthorSettings | null>(null)
  const [pnl, setPnl] = useState<AuthorPnL | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form state
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [walletAddress, setWalletAddress] = useState('')

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/author/settings')
      if (res.ok) {
        const data = await res.json()
        setAuthor(data.author)
        setPnl(data.pnl)
        setDisplayName(data.author.display_name || '')
        setBio(data.author.bio || '')
        setWalletAddress(data.author.wallet_address || '')
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/author/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName,
          bio,
          wallet_address: walletAddress || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to save settings')
      } else {
        setSuccess('Settings saved successfully')
        if (data.split_contract_address && author) {
          setAuthor({
            ...author,
            wallet_address: walletAddress || null,
            split_contract_address: data.split_contract_address,
            split_explorer_url: data.split_explorer_url,
          })
        }
      }
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center bg-[#0a0a0a]">
        <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
      </div>
    )
  }

  if (!author) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center bg-[#0a0a0a]">
        <p className="text-zinc-500">Author profile not found</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/dashboard"
          className="mb-8 inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <h1 className="mb-2 text-3xl font-bold text-white">Settings</h1>
        <p className="mb-8 text-zinc-400">Manage your profile, wallet, and view earnings.</p>

        {/* Profile Section */}
        <Card className="mb-6 border-[#27272a] bg-[#141414] p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Profile</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-zinc-300">
                Display Name
              </label>
              <Input
                id="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="border-[#27272a] bg-[#0a0a0a] text-white focus:border-violet-500"
              />
            </div>
            <div>
              <label htmlFor="bio" className="mb-1.5 block text-sm font-medium text-zinc-300">
                Bio
              </label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-[#27272a] bg-[#0a0a0a] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
          </div>
        </Card>

        {/* Wallet Section */}
        <Card className="mb-6 border-[#27272a] bg-[#141414] p-6">
          <h2 className="mb-1 text-lg font-semibold text-white flex items-center gap-2">
            <Wallet className="h-5 w-5 text-violet-400" />
            Wallet Setup
          </h2>
          <p className="mb-4 text-sm text-zinc-500">
            Connect your Base wallet to receive earnings from book sales.
          </p>

          <div className="space-y-4">
            <div>
              <label htmlFor="wallet" className="mb-1.5 block text-sm font-medium text-zinc-300">
                Base Wallet Address
              </label>
              <Input
                id="wallet"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="0x..."
                className="border-[#27272a] bg-[#0a0a0a] text-white font-mono text-sm focus:border-violet-500"
              />
              <p className="mt-1 text-xs text-zinc-600">
                Your Ethereum/Base wallet address for receiving USDC payments.
              </p>
            </div>

            {author.split_contract_address && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                <p className="mb-1 text-sm font-medium text-emerald-400">Split Contract Active</p>
                <p className="mb-2 text-xs text-zinc-400">
                  Payments to your books are routed through this on-chain split contract.
                </p>
                <a
                  href={author.split_explorer_url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"
                >
                  View on BaseScan <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}

            {!walletAddress && (
              <div className="rounded-lg border border-[#27272a] bg-[#0e0e0e] p-4">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                  <div>
                    <p className="text-sm text-zinc-400">
                      Need a wallet?{' '}
                      <a
                        href="https://www.coinbase.com/wallet"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-violet-400 hover:text-violet-300"
                      >
                        Get Coinbase Smart Wallet
                      </a>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Save button */}
        <div className="mb-8">
          {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
          {success && <p className="mb-3 text-sm text-emerald-400">{success}</p>}
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-violet-500 hover:bg-violet-600 text-white"
          >
            {saving ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
            ) : (
              <><Save className="mr-2 h-4 w-4" /> Save Settings</>
            )}
          </Button>
        </div>

        {/* API Keys */}
        <Card className="mb-6 border-[#27272a] bg-[#141414] p-0 overflow-hidden">
          <Link
            href="/dashboard/settings/api-keys"
            className="flex items-center gap-4 p-6 transition-colors hover:bg-[#1a1a1a]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10">
              <Key className="h-5 w-5 text-violet-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">API Keys</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                Manage API keys for programmatic access to LiberAi.
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-zinc-600" />
          </Link>
        </Card>

        {/* Cost & Earnings Overview */}
        {pnl && (
          <Card className="mb-6 border-[#27272a] bg-[#141414] p-6">
            <h2 className="mb-1 text-lg font-semibold text-white">Cost & Earnings (30-Day)</h2>
            <p className="mb-6 text-sm text-zinc-500">
              Your split % is recalculated daily based on your books&apos; platform costs.
            </p>

            {/* Author Totals */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniStat label="Gross Revenue" value={`$${pnl.totals.revenue.toFixed(2)}`} accent="text-blue-400" />
              <MiniStat label="Total Costs" value={`-$${pnl.totals.totalCosts.toFixed(2)}`} accent="text-red-400" />
              <MiniStat label="Your Earnings" value={`$${pnl.totals.authorShare.toFixed(2)}`} accent="text-emerald-400" />
              <MiniStat label="LiberAi Split" value={`${pnl.splitLiberaiPct.toFixed(1)}%`} accent="text-violet-400" />
            </div>

            {/* Per-book table */}
            {pnl.books.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#27272a] text-left text-xs text-zinc-500">
                      <th className="pb-2 pr-4">Book</th>
                      <th className="pb-2 pr-4 text-right">Revenue</th>
                      <th className="pb-2 pr-4 text-right">AI Cost</th>
                      <th className="pb-2 pr-4 text-right">Storage</th>
                      <th className="pb-2 pr-4 text-right">Infra</th>
                      <th className="pb-2 pr-4 text-right">Net</th>
                      <th className="pb-2 text-right">Your Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pnl.books.map((b) => (
                      <tr key={b.bookId} className="border-b border-[#1e1e1e]">
                        <td className="py-2.5 pr-4 text-zinc-300 truncate max-w-[150px]">{b.bookTitle}</td>
                        <td className="py-2.5 pr-4 text-right text-zinc-400">${b.revenue.toFixed(2)}</td>
                        <td className="py-2.5 pr-4 text-right text-zinc-500">${b.costs.aiCost.toFixed(4)}</td>
                        <td className="py-2.5 pr-4 text-right text-zinc-500">${b.costs.storageCost.toFixed(4)}</td>
                        <td className="py-2.5 pr-4 text-right text-zinc-500">${b.costs.infraCost.toFixed(4)}</td>
                        <td className="py-2.5 pr-4 text-right text-zinc-300">${b.netProfit.toFixed(2)}</td>
                        <td className="py-2.5 text-right text-emerald-400">${b.authorShare.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {pnl.books.length === 0 && (
              <p className="text-sm text-zinc-600 text-center py-4">
                No sales data yet. Earnings will appear here after your first sale.
              </p>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-lg border border-[#1e1e1e] bg-[#0e0e0e] p-3">
      <p className="text-[11px] text-zinc-600 mb-1">{label}</p>
      <p className={`text-lg font-bold ${accent}`}>{value}</p>
    </div>
  )
}
