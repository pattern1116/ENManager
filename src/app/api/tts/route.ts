// POST /api/tts  { text, voice? }
// Server-side proxy to the TTS server (:8787 /tts/stream). The session token
// is attached here, never exposed to the browser. Streams the audio straight
// back to the client.
//
// When TTS_TOKEN / TTS_BASE_URL aren't configured, or the upstream rejects
// the call, we return 503 so the client can fall back to the browser's built-in
// speechSynthesis — that keeps the experience working in local dev before a
// real token is wired up.

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { currentUserId } from '@/lib/currentUser'

export const dynamic = 'force-dynamic'

// The TTS server (newsbot :8787) gates every call with an HMAC session token:
//   token = `${exp}.${hmac_sha256(SESSION_SECRET, String(exp))}`
// Browsers get one via Turnstile, but for server-to-server we just share the
// SESSION_SECRET and mint a short-lived token here — fresh per request, so it
// never expires mid-use and the same path works in prod (no Turnstile needed).
// Falls back to a static TTS_TOKEN if that's how it's configured instead.
function resolveToken(): string | null {
  const secret = process.env.TTS_SESSION_SECRET
  if (secret) {
    const exp = Math.floor(Date.now() / 1000) + 600 // 10 min
    const sig = crypto.createHmac('sha256', secret).update(String(exp)).digest('hex')
    return `${exp}.${sig}`
  }
  return process.env.TTS_TOKEN || null
}

export async function POST(req: NextRequest) {
  const userId = currentUserId()
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { text, voice, speed } = (await req.json().catch(() => ({}))) as {
    text?: string
    voice?: string
    speed?: number
  }
  if (!text?.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }
  // Pace multiplier (<1 = slower). Clamp here too; the TTS server clamps again.
  const pace = typeof speed === 'number' && Number.isFinite(speed)
    ? Math.min(1.5, Math.max(0.5, speed))
    : 1

  const baseUrl = process.env.TTS_BASE_URL
  const token = resolveToken()
  if (!baseUrl || !token) {
    // Not configured — signal the client to use its local fallback.
    return NextResponse.json({ error: 'tts_unconfigured', fallback: true }, { status: 503 })
  }

  try {
    const upstream = await fetch(`${baseUrl.replace(/\/$/, '')}/tts/stream`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-session-token': token,
      },
      body: JSON.stringify({
        text: text.trim(),
        voice: voice ?? process.env.TTS_VOICE ?? 'af_heart',
        speed: pace,
      }),
    })

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '')
      console.error('[tts] upstream error', upstream.status, detail.slice(0, 200))
      return NextResponse.json(
        { error: 'tts_upstream_error', status: upstream.status, fallback: true },
        { status: 503 },
      )
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'audio/mpeg',
        'cache-control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[tts] proxy failure', err)
    return NextResponse.json({ error: 'tts_proxy_failure', fallback: true }, { status: 503 })
  }
}
