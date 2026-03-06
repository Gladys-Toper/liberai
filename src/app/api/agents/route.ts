import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { createApiKey } from '@/lib/auth/api-key'
import {
  registerAgent,
  getAgentsByOwner,
  searchAgentsByCapability,
} from '@/lib/db/queries/agents'
import { createActivityEvent } from '@/lib/db/queries/social'

export async function POST(request: Request) {
  const auth = await resolveAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const {
    name,
    description,
    agentType,
    capabilities = [],
    webhookUrl,
    mcpEndpoint,
    a2aEndpoint,
    modelProvider,
    modelId,
    ratePerCall,
    protocols,
    metadata,
  } = body

  if (!name || !agentType) {
    return NextResponse.json(
      { error: 'name and agentType are required' },
      { status: 400 },
    )
  }

  const validTypes = [
    'reader', 'author_assistant', 'reviewer', 'researcher',
    'curator', 'translator', 'summarizer', 'custom',
  ]
  if (!validTypes.includes(agentType)) {
    return NextResponse.json(
      { error: `agentType must be one of: ${validTypes.join(', ')}` },
      { status: 400 },
    )
  }

  try {
    const agent = await registerAgent(auth.userId, {
      name,
      description,
      agentType,
      capabilities,
      webhookUrl,
      mcpEndpoint,
      a2aEndpoint,
      modelProvider,
      modelId,
      ratePerCall,
      protocols,
      metadata,
    })

    // Create an API key for this agent
    const { rawKey, id: keyId } = await createApiKey({
      ownerId: auth.userId,
      scope: 'agent',
      name: `Agent: ${name}`,
      agentId: agent.id,
    })

    // Create activity event
    await createActivityEvent({
      actorId: auth.userId,
      eventType: 'agent_registered',
      targetType: 'agent',
      targetId: agent.id,
      metadata: {
        agentName: agent.name,
        agentType: agent.agent_type,
        capabilities: agent.capabilities,
      },
    })

    return NextResponse.json({
      agent,
      apiKey: {
        id: keyId,
        key: rawKey,
        note: 'Store this key securely. It will not be shown again.',
      },
    }, { status: 201 })
  } catch (err) {
    console.error('Agent registration error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to register agent' },
      { status: 500 },
    )
  }
}

export async function GET(request: Request) {
  const auth = await resolveAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const search = url.searchParams.get('search')
  const limit = Number(url.searchParams.get('limit') || '10')
  const ownerId = url.searchParams.get('ownerId')

  try {
    if (search) {
      // Semantic search by capability
      const minTrust = Number(url.searchParams.get('minTrust') || '0')
      const agents = await searchAgentsByCapability(search, limit, minTrust)
      return NextResponse.json({ agents })
    }

    // List own agents (or specific owner's if admin)
    const targetOwner = ownerId && auth.role === 'admin' ? ownerId : auth.userId
    const agents = await getAgentsByOwner(targetOwner)
    return NextResponse.json({ agents })
  } catch (err) {
    console.error('Agent list error:', err)
    return NextResponse.json(
      { error: 'Failed to fetch agents' },
      { status: 500 },
    )
  }
}
