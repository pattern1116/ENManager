// GET /api/health
// Returns status of all providers (LLM, STT, DB)
// Used by the settings page to show what's connected

import { NextResponse } from 'next/server'
import { getLLMProvider } from '@/lib/providers/llm'
import { getSTTProvider } from '@/lib/providers/stt'

export async function GET() {
  const llm = getLLMProvider()
  const stt = getSTTProvider()

  // Quick ping to LLM
  let llmOk = false
  let llmError: string | null = null
  try {
    await llm.complete([{ role: 'user', content: 'ping' }], 'Reply with "pong" only.')
    llmOk = true
  } catch (e) {
    llmError = e instanceof Error ? e.message : String(e)
  }

  // STT is harder to ping without audio — just report the provider name
  return NextResponse.json({
    status: llmOk ? 'ok' : 'degraded',
    llm: {
      provider: llm.name,
      ok: llmOk,
      error: llmError,
      model: process.env.LLM_MODEL ?? null,
    },
    stt: {
      provider: stt.name,
      model: process.env.STT_MODEL ?? null,
    },
    db: {
      path: process.env.DB_PATH ?? './data/speaking-coach.db',
    },
  })
}
