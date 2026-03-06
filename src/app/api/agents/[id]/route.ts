import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { getAgent, updateAgent, deactivateAgent } from '@/lib/db/queries/agents'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const agent = await getAgent(id)
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  // Strip embedding from public response (large vector)
  const { capability_embedding: _, ...agentPublic } = agent
  return NextResponse.json({ agent: agentPublic })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()

  const {
    name,
    description,
    capabilities,
    status,
    webhookUrl,
    mcpEndpoint,
    a2aEndpoint,
    modelProvider,
    modelId,
    ratePerCall,
    protocols,
    metadata,
  } = body

  // If status update is requested, validate
  if (status && !['active', 'inactive'].includes(status)) {
    return NextResponse.json(
      { error: 'status must be active or inactive' },
      { status: 400 },
    )
  }

  try {
    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (capabilities !== undefined) updates.capabilities = capabilities
    if (webhookUrl !== undefined) updates.webhookUrl = webhookUrl
    if (mcpEndpoint !== undefined) updates.mcpEndpoint = mcpEndpoint
    if (a2aEndpoint !== undefined) updates.a2aEndpoint = a2aEndpoint
    if (modelProvider !== undefined) updates.modelProvider = modelProvider
    if (modelId !== undefined) updates.modelId = modelId
    if (ratePerCall !== undefined) updates.ratePerCall = ratePerCall
    if (protocols !== undefined) updates.protocols = protocols
    if (metadata !== undefined) updates.metadata = metadata

    const agent = await updateAgent(id, auth.userId, updates)
    const { capability_embedding: _, ...agentPublic } = agent
    return NextResponse.json({ agent: agentPublic })
  } catch (err) {
    console.error('Agent update error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update agent' },
      { status: 500 },
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const success = await deactivateAgent(id, auth.userId)

  if (!success) {
    return NextResponse.json(
      { error: 'Agent not found or not owned by you' },
      { status: 404 },
    )
  }

  return NextResponse.json({ message: 'Agent deactivated' })
}
