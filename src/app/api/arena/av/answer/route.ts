// Sprint 8: WebRTC answer relay — browser sends SDP answer to Simli
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { sessionId, answer } = await request.json()

    if (!sessionId || !answer) {
      return NextResponse.json({ error: 'Missing sessionId or answer' }, { status: 400 })
    }

    // Forward the SDP answer to Simli's session
    const res = await fetch(`https://api.simli.ai/session/${sessionId}/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.SIMLI_API_KEY || '',
      },
      body: JSON.stringify({ answer }),
    })

    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json(
        { error: `Simli answer relay failed: ${errText}` },
        { status: res.status },
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('WebRTC answer relay error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
