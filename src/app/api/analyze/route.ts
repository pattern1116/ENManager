// POST /api/analyze
// Accepts { text, sessionId? }
// Returns AnalyzeResponse

import { NextRequest, NextResponse } from 'next/server'
import { getLLMProvider } from '@/lib/providers/llm'
import { parseStructure, buildAnalysisPrompt } from '@/lib/parsers/structure'
import { createSession, saveUtterance } from '@/lib/db'
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

    // 3. Parse LLM response
    let feedback: UtteranceFeedback
    try {
      const cleaned = raw.replace(/```json|```/g, '').trim()
      feedback = JSON.parse(cleaned)
    } catch {
      // Fallback: use the pre-parse result with a generic rewrite
      feedback = {
        patternDetected: parseResult.patternDetected,
        patternConfidence: parseResult.confidence,
        gapsFound: parseResult.potentialGaps,
        rewrite: text,
        explanation: 'Could not parse LLM response. Raw output: ' + raw.slice(0, 200),
        score: 50,
      }
    }

    // 4. Persist to DB
    const sessionId = existingSessionId ?? createSession().id
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
