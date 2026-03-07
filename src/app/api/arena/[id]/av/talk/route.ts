// D-ID Talk Text Relay — send text to D-ID for lip-synced speech generation
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
  const { streamId, sessionId, text, voiceId } = await request.json()

  if (!streamId || !sessionId || !text) {
    return NextResponse.json({ error: 'Missing streamId, sessionId, or text' }, { status: 400 })
  }

  const did = new DIDAdapter()

  try {
    await did.sendTalkText(
      streamId,
      sessionId,
      text,
      voiceId || 'en-GB-RyanNeural',
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('D-ID talk failed:', err)
    return NextResponse.json({ error: 'Talk text failed' }, { status: 502 })
  }
}
