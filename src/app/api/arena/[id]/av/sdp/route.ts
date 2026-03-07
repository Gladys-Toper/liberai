// D-ID SDP Answer Relay — browser sends SDP answer → we relay to D-ID
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
  const { streamId, sessionId, answer } = await request.json()

  if (!streamId || !sessionId || !answer) {
    return NextResponse.json({ error: 'Missing streamId, sessionId, or answer' }, { status: 400 })
  }

  const did = new DIDAdapter()

  try {
    await did.sendSdpAnswer(streamId, sessionId, answer)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('D-ID SDP relay failed:', err)
    return NextResponse.json({ error: 'SDP relay failed' }, { status: 502 })
  }
}
