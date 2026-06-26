// POST /api/practice/next
// Two modes:
//   · "followup" (default) — generate the next prompt as a natural tail
//     question to what the learner just said. The client passes a target
//     pattern (rotated round-robin) which we pin; with none, the LLM picks.
//   · "simplify" — rewrite the CURRENT topic into a concrete, self-explanatory
//     version (same subject, same pattern) for when a topic is too abstract.
// Either way, falls back to a fresh seed topic from the hardcoded bank when
// there's nothing to work from, the LLM is the mock provider, or generation
// fails — so practice never breaks.

import { NextRequest, NextResponse } from 'next/server'
import { getLLMProvider } from '@/lib/providers/llm'
import { getProgressReport } from '@/lib/db'
import { currentUserId } from '@/lib/currentUser'
import { makePrompt, pickSeedPrompt } from '@/lib/parsers/practice'
import { coercePattern } from '@/lib/feedback'
import type { PatternType } from '@/types'

const TEMPERATURE = 0.7
// Simplify must stay anchored to the original topic, so run it cooler — high
// temperature is what lets it wander off into a different question.
const SIMPLIFY_TEMPERATURE = 0.3

// What each pattern needs the follow-up to invite. The client rotates the
// target pattern round-robin, so instead of letting the LLM pick (it skews to
// PRE/SID/HO and rarely asks for CE/CC) we hand it the pattern and only ask it
// to phrase a topic that genuinely invites that structure.
const PATTERN_INVITE: Record<Exclude<PatternType, 'UNKNOWN'>, string> = {
  PRE: 'invites a point backed by a reason and grounded with an example',
  SID: 'invites signalling a stance, stating an idea, then supporting it with a detail',
  CE:  'invites explaining a cause and its effect',
  CC:  'invites contrasting two things (it must offer two sides to weigh)',
  HO:  'invites hedging first, then committing to a clear opinion',
}

function followupSystem(pattern: Exclude<PatternType, 'UNKNOWN'>): string {
  return `You are an English speaking coach. The learner just gave a short spoken answer.
Write ONE follow-up speaking prompt (a question or a "Talk about…" line, max 14 words) that:
- digs deeper into what they actually said — a natural tail question on the same thread, AND
- naturally ${PATTERN_INVITE[pattern]}.
The topic MUST genuinely invite the ${pattern} structure; if the thread can't, pivot to a nearby angle that does.
Return ONLY JSON, no prose: {"topic": "..."}`
}

// When the client doesn't specify a target pattern, fall back to letting the
// model choose (legacy behaviour).
const FREE_FOLLOWUP_SYSTEM = `You are an English speaking coach. The learner just gave a short spoken answer.
Write ONE follow-up speaking prompt (a question or a "Talk about…" line, max 14 words) that digs deeper into what they actually said — a natural tail question that keeps the same thread.
Then choose which speaking structure the follow-up most naturally invites:
- PRE: make a point, back it with a reason, ground it with an example
- SID: signal a stance, state an idea, support with a detail
- CE: explain a cause and its effect
- CC: contrast two things
- HO: hedge, then give a clear opinion
Return ONLY JSON, no prose: {"topic": "...", "pattern": "PRE|SID|CE|CC|HO"}`

function simplifySystem(pattern: Exclude<PatternType, 'UNKNOWN'>): string {
  return `You are an English speaking coach. A learner found a practice topic too abstract or confusing.
Rewrite the SAME topic so it is concrete, self-explanatory, and easy to start talking about.
Rules:
- Keep the same subject and the same core idea. Do NOT switch to a different topic — the learner must recognise it as the same prompt, only clearer. If you change the subject you have failed.
- The result must still be answerable with the ${pattern} structure, which ${PATTERN_INVITE[pattern]}.
- Add just enough everyday context that the learner immediately knows what to say. Avoid jargon. Max 16 words.
Return ONLY JSON, no prose: {"topic": "..."}`
}

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
    const userId = currentUserId()
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const mode: string = body.mode === 'simplify' ? 'simplify' : 'followup'

    const { patternStats } = getProgressReport(userId)
    const llm = getLLMProvider()
    const seed = () => NextResponse.json({ prompt: pickSeedPrompt(patternStats), source: 'seed' })

    // ── Simplify the current topic, keeping its pattern ──────────────
    if (mode === 'simplify') {
      const topic = typeof body.topic === 'string' ? body.topic.trim() : ''
      const pattern = coercePattern(body.pattern)
      // On any failure here, keep the ORIGINAL prompt rather than seeding a
      // brand-new one — simplifying should never swap the question out.
      const keepOriginal = () =>
        pattern !== 'UNKNOWN' && topic
          ? NextResponse.json({ prompt: makePrompt(topic, pattern, patternStats), source: 'simplify' })
          : seed()
      if (!topic || pattern === 'UNKNOWN' || llm.name === 'mock') return keepOriginal()

      const raw = await llm.complete(
        [{ role: 'user', content: `Pattern: ${pattern}\nTopic to simplify: "${topic}"` }],
        simplifySystem(pattern),
        { temperature: SIMPLIFY_TEMPERATURE },
      )
      const parsed = extractJson(raw)
      const newTopic = parsed && typeof parsed.topic === 'string' ? parsed.topic.trim() : ''
      if (!newTopic) return keepOriginal()
      return NextResponse.json({ prompt: makePrompt(newTopic, pattern, patternStats), source: 'simplify' })
    }

    // ── Follow-up to what the learner just said ──────────────────────
    const lastUtterance = typeof body.lastUtterance === 'string' ? body.lastUtterance.trim() : ''
    const lastTopic = typeof body.lastTopic === 'string' ? body.lastTopic.trim() : ''
    if (!lastUtterance || llm.name === 'mock') return seed()

    const user = lastTopic
      ? `Topic they were answering: "${lastTopic}"\nWhat they said: "${lastUtterance}"`
      : `What they said: "${lastUtterance}"`

    // The client rotates the target pattern round-robin so every pattern (incl.
    // CE/CC) gets its turn. When given, we pin the pattern and only the topic
    // comes from the LLM; otherwise the model picks the pattern too.
    const requested = coercePattern(body.targetPattern)
    const system = requested !== 'UNKNOWN' ? followupSystem(requested) : FREE_FOLLOWUP_SYSTEM

    const raw = await llm.complete(
      [{ role: 'user', content: user }],
      system,
      { temperature: TEMPERATURE },
    )
    const parsed = extractJson(raw)
    const topic = parsed && typeof parsed.topic === 'string' ? parsed.topic.trim() : ''
    const pattern = requested !== 'UNKNOWN' ? requested : coercePattern(parsed?.pattern)
    if (!topic || pattern === 'UNKNOWN') return seed()

    return NextResponse.json({ prompt: makePrompt(topic, pattern, patternStats), source: 'followup' })
  } catch (err) {
    console.error('[practice/next]', err)
    try {
      const userId = currentUserId()
      const { patternStats } = userId ? getProgressReport(userId) : { patternStats: [] }
      return NextResponse.json({ prompt: pickSeedPrompt(patternStats), source: 'seed' })
    } catch {
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
  }
}
