// D-ID ICE Candidate Relay — browser sends ICE candidate → we relay to D-ID
import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { DIDAdapter } from '@/lib/arena/avatar-service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await params
  const { streamId, sessionId, candidate } = await request.json()

  if (!streamId || !sessionId || !candidate) {
    return NextResponse.json({ error: 'Missing streamId, sessionId, or candidate' }, { status: 400 })
  }

  const did = new DIDAdapter()

  try {
    await did.sendIceCandidate(streamId, sessionId, candidate)
    return NextResponse.json({ ok: true })
  } catch (err) {
    // ICE candidate delivery is best-effort
    console.warn('D-ID ICE relay failed:', err)
    return NextResponse.json({ ok: false })
  }
}
