import { NextResponse } from 'next/server'
import { getAgentEconomics } from '@/lib/agents/metering'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: agentId } = await params

  const url = new URL(request.url)
  const days = Number(url.searchParams.get('days') || '30')

  try {
    const economics = await getAgentEconomics(agentId, days)
    return NextResponse.json(economics)
  } catch (err) {
    console.error('Agent economics error:', err)
    return NextResponse.json({ error: 'Failed to fetch economics' }, { status: 500 })
  }
}
