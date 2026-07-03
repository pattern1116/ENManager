// POST /api/small-talk/reply  { sessionId, userText }
// Records the learner's spoken turn (already transcribed), asks the LLM for
// the next reply, and lets the LLM decide when to wrap the conversation up.
// Returns { text, done }. The reply text is for TTS only.

import { NextRequest, NextResponse } from 'next/server'
import { getLLMProvider } from '@/lib/providers/llm'
import {
  getSmallTalkSession,
  addSmallTalkTurn,
  endSmallTalkSession,
} from '@/lib/db'
import { currentUserId } from '@/lib/currentUser'
import {
  buildReplyPrompt,
  extractJsonObject,
  coerceText,
  wantsToEnd,
  MAX_USER_TURNS,
} from '@/lib/smalltalk/prompts'

const REPLY_TEMPERATURE = 0.7

export async function POST(req: NextRequest) {
  try {
    const userId = currentUserId()
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { sessionId, userText } = (await req.json()) as {
      sessionId?: number
      userText?: string
    }
    if (sessionId == null) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }
    if (!userText?.trim()) {
      return NextResponse.json({ error: 'userText is required' }, { status: 400 })
    }

    const session = getSmallTalkSession(userId, sessionId)
    if (!session) {
      return NextResponse.json({ error: 'session not found' }, { status: 404 })
    }
    if (session.status === 'done') {
      return NextResponse.json({ error: 'session already ended' }, { status: 409 })
    }

    // Persist the learner's turn first so it's part of the history the LLM sees.
    addSmallTalkTurn(userId, sessionId, 'user', userText.trim())
    const updated = getSmallTalkSession(userId, sessionId)!

    // This is the final exchange — close warmly and force `done` no matter what
    // the model decides — when either the learner signals they want to leave
    // ("I have to go", "bye", …) or the hard turn cap is hit. Guarantees a
    // conversation ends when asked and can never run on forever.
    const userTurnCount = updated.turns.filter(t => t.role === 'user').length
    const finalTurn = wantsToEnd(userText) || userTurnCount >= MAX_USER_TURNS

    const llm = getLLMProvider()
    const { system, user } = buildReplyPrompt(updated.topic, updated.turns, finalTurn)
    const raw = await llm.complete([{ role: 'user', content: user }], system, {
      temperature: REPLY_TEMPERATURE,
    })

    const parsed = extractJsonObject(raw)
    const text = coerceText(parsed?.text ?? parsed?.reply, 'That sounds great! Tell me more.')
    const done = finalTurn || parsed?.done === true

    addSmallTalkTurn(userId, sessionId, 'assistant', text)
    if (done) endSmallTalkSession(userId, sessionId)

    return NextResponse.json({ text, done })
  } catch (err) {
    console.error('[small-talk/reply]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}
