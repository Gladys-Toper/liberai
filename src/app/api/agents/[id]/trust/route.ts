import { NextResponse } from 'next/server'
import { getTrustHistory } from '@/lib/agents/trust'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: agentId } = await params

  const url = new URL(request.url)
  const days = Number(url.searchParams.get('days') || '30')

  try {
    const trust = await getTrustHistory(agentId, days)
    return NextResponse.json(trust)
  } catch (err) {
    console.error('Trust history error:', err)
    return NextResponse.json({ error: 'Failed to fetch trust history' }, { status: 500 })
  }
}
