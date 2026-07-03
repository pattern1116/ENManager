// POST /api/small-talk/revise  { turnId }
// Lazily produces a level-preserving rewrite of one user turn, shown when the
// learner taps their own bubble in the review screen. Cached on the turn row
// so a second tap is free. Returns { revised }.

import { NextRequest, NextResponse } from 'next/server'
import { getLLMProvider } from '@/lib/providers/llm'
import {
  getSmallTalkSession,
  getSmallTalkTurn,
  setSmallTalkTurnRevised,
} from '@/lib/db'
import { currentUserId } from '@/lib/currentUser'
import { buildRevisePrompt, extractJsonObject, coerceText } from '@/lib/smalltalk/prompts'

const REVISE_TEMPERATURE = 0.3

export async function POST(req: NextRequest) {
  try {
    const userId = currentUserId()
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { turnId } = (await req.json()) as { turnId?: number }
    if (turnId == null) {
      return NextResponse.json({ error: 'turnId is required' }, { status: 400 })
    }

    const turn = getSmallTalkTurn(userId, turnId)
    if (!turn) return NextResponse.json({ error: 'turn not found' }, { status: 404 })
    if (turn.role !== 'user') {
      return NextResponse.json({ error: 'only user turns can be revised' }, { status: 400 })
    }
    if (turn.revised) {
      return NextResponse.json({ revised: turn.revised })
    }

    // Find the assistant line right before this turn for context.
    const session = getSmallTalkSession(userId, turn.sessionId)
    const preceding =
      session?.turns
        .filter(t => t.idx < turn.idx && t.role === 'assistant')
        .slice(-1)[0]?.text ?? null

    const llm = getLLMProvider()
    const { system, user } = buildRevisePrompt(turn.text, preceding)
    const raw = await llm.complete([{ role: 'user', content: user }], system, {
      temperature: REVISE_TEMPERATURE,
    })

    const parsed = extractJsonObject(raw)
    const revised = coerceText(parsed?.revised, turn.text)

    setSmallTalkTurnRevised(userId, turnId, revised)
    return NextResponse.json({ revised })
  } catch (err) {
    console.error('[small-talk/revise]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}
