import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { searchAgentsByCapability } from '@/lib/db/queries/agents'

export async function POST(request: Request) {
  const auth = await resolveAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const {
    query,
    limit = 10,
    minTrust,
    requiredCapabilities,
  } = body

  if (!query) {
    return NextResponse.json(
      { error: 'query is required' },
      { status: 400 },
    )
  }

  try {
    let agents = await searchAgentsByCapability(query, limit * 2, minTrust)

    // Post-filter by required capabilities if specified
    if (requiredCapabilities && requiredCapabilities.length > 0) {
      const required = new Set(
        requiredCapabilities.map((c: string) => c.toLowerCase()),
      )
      agents = agents.filter(agent => {
        const agentCaps = new Set(
          (agent.capabilities || []).map(c => c.toLowerCase()),
        )
        return [...required].every(r => agentCaps.has(r as string))
      })
    }

    // Trim to requested limit
    agents = agents.slice(0, limit)

    // Strip embeddings from response
    const results = agents.map(({ capability_embedding: _, ...agent }) => agent)

    return NextResponse.json({ agents: results })
  } catch (err) {
    console.error('Agent matchmaking error:', err)
    return NextResponse.json(
      { error: 'Matchmaking failed' },
      { status: 500 },
    )
  }
}
