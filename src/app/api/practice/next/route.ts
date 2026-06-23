// POST /api/practice/next
// Two modes:
//   · "followup" (default) — generate the next prompt as a natural tail
//     question to what the learner just said. The LLM also picks the pattern.
//   · "simplify" — rewrite the CURRENT topic into a concrete, self-explanatory
//     version (same theme, same pattern) for when a topic is too abstract.
// Either way, falls back to a fresh seed topic from the hardcoded bank when
// there's nothing to work from, the LLM is the mock provider, or generation
// fails — so practice never breaks.

import { NextRequest, NextResponse } from 'next/server'
import { getLLMProvider } from '@/lib/providers/llm'
import { getProgressReport } from '@/lib/db'
import { makePrompt, pickSeedPrompt } from '@/lib/parsers/practice'
import { coercePattern } from '@/lib/feedback'
import type { PatternType } from '@/types'

const TEMPERATURE = 0.7

const FOLLOWUP_SYSTEM = `You are an English speaking coach. The learner just gave a short spoken answer.
Write ONE follow-up speaking prompt (a question or a "Talk about…" line, max 14 words) that digs deeper into what they actually said — a natural tail question that keeps the same thread.
Then choose which speaking structure the follow-up most naturally invites:
- PRE: make a point, back it with a reason, ground it with an example
- SID: signal a stance, state an idea, support with a detail
- CE: explain a cause and its effect
- CC: contrast two things
- HO: hedge, then give a clear opinion
Return ONLY JSON, no prose: {"topic": "...", "pattern": "PRE|SID|CE|CC|HO"}`

const SIMPLIFY_SYSTEM = `You are an English speaking coach. A learner found a practice topic too abstract or confusing.
Rewrite the topic so it is concrete, self-explanatory, and easy to start talking about. Keep the SAME theme, add just enough everyday context that the learner immediately knows what to say, and avoid jargon. Max 16 words.
Return ONLY JSON, no prose: {"topic": "..."}`

function extractJson(raw: string): { topic?: unknown; pattern?: unknown } | null {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const mode: string = body.mode === 'simplify' ? 'simplify' : 'followup'

    const { patternStats } = getProgressReport()
    const llm = getLLMProvider()
    const seed = () => NextResponse.json({ prompt: pickSeedPrompt(patternStats), source: 'seed' })

    // ── Simplify the current topic, keeping its pattern ──────────────
    if (mode === 'simplify') {
      const topic = typeof body.topic === 'string' ? body.topic.trim() : ''
      const pattern: PatternType = coercePattern(body.pattern)
      if (!topic || pattern === 'UNKNOWN' || llm.name === 'mock') return seed()

      const raw = await llm.complete(
        [{ role: 'user', content: `Pattern: ${pattern}\nTopic to simplify: "${topic}"` }],
        SIMPLIFY_SYSTEM,
        { temperature: TEMPERATURE },
      )
      const parsed = extractJson(raw)
      const newTopic = parsed && typeof parsed.topic === 'string' ? parsed.topic.trim() : ''
      if (!newTopic) return seed()
      return NextResponse.json({ prompt: makePrompt(newTopic, pattern, patternStats), source: 'simplify' })
    }

    // ── Follow-up to what the learner just said ──────────────────────
    const lastUtterance = typeof body.lastUtterance === 'string' ? body.lastUtterance.trim() : ''
    const lastTopic = typeof body.lastTopic === 'string' ? body.lastTopic.trim() : ''
    if (!lastUtterance || llm.name === 'mock') return seed()

    const user = lastTopic
      ? `Topic they were answering: "${lastTopic}"\nWhat they said: "${lastUtterance}"`
      : `What they said: "${lastUtterance}"`

    const raw = await llm.complete(
      [{ role: 'user', content: user }],
      FOLLOWUP_SYSTEM,
      { temperature: TEMPERATURE },
    )
    const parsed = extractJson(raw)
    const topic = parsed && typeof parsed.topic === 'string' ? parsed.topic.trim() : ''
    const pattern = coercePattern(parsed?.pattern)
    if (!topic || pattern === 'UNKNOWN') return seed()

    return NextResponse.json({ prompt: makePrompt(topic, pattern, patternStats), source: 'followup' })
  } catch (err) {
    console.error('[practice/next]', err)
    try {
      const { patternStats } = getProgressReport()
      return NextResponse.json({ prompt: pickSeedPrompt(patternStats), source: 'seed' })
    } catch {
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
  }
}
