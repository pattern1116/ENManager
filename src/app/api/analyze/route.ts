// POST /api/analyze
// Accepts { text, sessionId? }
// Returns AnalyzeResponse

import { NextRequest, NextResponse } from 'next/server'
import { getLLMProvider } from '@/lib/providers/llm'
import { parseStructure, buildAnalysisPrompt } from '@/lib/parsers/structure'
import { buildFeedback } from '@/lib/feedback'
import { createSession, saveUtterance, getSession } from '@/lib/db'
import type { AnalyzeRequest, AnalyzeResponse, UtteranceFeedback } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body: AnalyzeRequest = await req.json()
    const { text, sessionId: existingSessionId } = body

    if (!text?.trim()) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }

    // 1. Rule-based pre-parse
    const parseResult = parseStructure(text)

    // 2. LLM analysis
    const llm = getLLMProvider()
    const systemPrompt = buildAnalysisPrompt(text, parseResult)
    const raw = await llm.complete([{ role: 'user', content: text }], systemPrompt)

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

    // 4. Persist to DB. Reuse the client's session when it still exists,
    //    otherwise open a fresh one (guards against a stale localStorage id).
    const sessionId =
      existingSessionId != null && getSession(existingSessionId)
        ? existingSessionId
        : createSession().id
    const utterance = saveUtterance(sessionId, text, feedback)

    const response: AnalyzeResponse = {
      utteranceId: utterance.id,
      sessionId,
      transcript: text,
      feedback,
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
