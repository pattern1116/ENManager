// POST /api/analyze
// Accepts { text, sessionId? }
// Returns AnalyzeResponse

import { NextRequest, NextResponse } from 'next/server'
import { getLLMProvider } from '@/lib/providers/llm'
import { parseStructure, buildAnalysisPrompt } from '@/lib/parsers/structure'
import { buildFeedback, coercePattern } from '@/lib/feedback'
import { evaluatePractice } from '@/lib/practiceResult'
import { createSession, saveUtterance, getSession } from '@/lib/db'
import { currentUserId } from '@/lib/currentUser'
import type { AnalyzeRequest, AnalyzeResponse, UtteranceFeedback } from '@/types'

// Low but non-zero temperature: keeps the same utterance scoring consistently
// across calls without the degenerate, jittery output seen at temperature 0.
const ANALYZE_TEMPERATURE = 0.2

export async function POST(req: NextRequest) {
  try {
    const userId = currentUserId()
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const body: AnalyzeRequest = await req.json()
    const { text, sessionId: existingSessionId } = body

    if (!text?.trim()) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }

    // A practice utterance carries the pattern the speaker was aiming for.
    // coercePattern maps anything invalid → UNKNOWN, which we treat as "no target".
    const target = body.targetPattern != null ? coercePattern(body.targetPattern) : 'UNKNOWN'
    const hasTarget = target !== 'UNKNOWN'

    // 1. Rule-based pre-parse
    const parseResult = parseStructure(text)

    // 2. LLM analysis
    const llm = getLLMProvider()
    const systemPrompt = buildAnalysisPrompt(text, parseResult, hasTarget ? target : undefined)
    const raw = await llm.complete(
      [{ role: 'user', content: text }],
      systemPrompt,
      { temperature: ANALYZE_TEMPERATURE },
    )

    // 3. Parse + validate LLM response. buildFeedback coerces every field
    //    to a safe value (invalid pattern → UNKNOWN, score clamped to 0–100,
    //    gapsFound guaranteed to be an array) and falls back to the
    //    rule-parser result when the output isn't valid JSON.
    const fallback: UtteranceFeedback = {
      patternDetected: parseResult.patternDetected,
      patternConfidence: parseResult.confidence,
      gapsFound: parseResult.potentialGaps,
      rewrite: text,
      explanation: 'Could not parse LLM response. Raw output: ' + raw.slice(0, 200),
      score: 50,
    }
    const feedback = buildFeedback(raw, fallback)

    // 4. Persist to DB. Reuse the client's session when it still exists AND
    //    belongs to this user, otherwise open a fresh one (guards against a
    //    stale localStorage id or one borrowed from another account).
    const sessionId =
      existingSessionId != null && getSession(userId, existingSessionId)
        ? existingSessionId
        : createSession(userId).id
    const utterance = saveUtterance(userId, sessionId, text, feedback)

    // 5. Practice loop: when a target pattern was given, report whether the
    //    speaker actually hit it.
    const practiceResult = hasTarget ? evaluatePractice(target, feedback) : null

    const response: AnalyzeResponse = {
      utteranceId: utterance.id,
      sessionId,
      transcript: text,
      feedback,
      practiceResult,
    }

    return NextResponse.json(response)
  } catch (err) {
    console.error('[analyze]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}
