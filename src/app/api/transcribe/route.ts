// POST /api/transcribe
// Accepts multipart/form-data with 'audio' field (Blob)
// Returns { transcript, durationMs }

import { NextRequest, NextResponse } from 'next/server'
import { getSTTProvider } from '@/lib/providers/stt'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audioFile = formData.get('audio') as File | null

    if (!audioFile) {
      return NextResponse.json({ error: 'audio field is required' }, { status: 400 })
    }

    const t0 = Date.now()
    const stt = getSTTProvider()
    const transcript = await stt.transcribe(audioFile)
    const durationMs = Date.now() - t0

    return NextResponse.json({ transcript, durationMs })
  } catch (err) {
    console.error('[transcribe]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}
