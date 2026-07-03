// POST /api/small-talk/start
// Opens a new small-talk session: the LLM invents a fresh everyday topic and
// a spoken opening line. The opening text is returned ONLY so the client can
// speak it via TTS — it is never shown on screen during the live chat.
// Returns { sessionId, topic, text }.

import { NextRequest, NextResponse } from 'next/server'
import { getLLMProvider } from '@/lib/providers/llm'
import { createSmallTalkSession, addSmallTalkTurn } from '@/lib/db'
import { currentUserId } from '@/lib/currentUser'
import { buildOpenerPrompt, extractJsonObject, coerceText } from '@/lib/smalltalk/prompts'

const OPENER_TEMPERATURE = 0.9

export async function POST() {
  try {
    const userId = currentUserId()
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const llm = getLLMProvider()
    const { system, user } = buildOpenerPrompt()
    const raw = await llm.complete([{ role: 'user', content: user }], system, {
      temperature: OPENER_TEMPERATURE,
    })

    const parsed = extractJsonObject(raw)
    const topic = coerceText(parsed?.topic, 'small talk')
    const opening = coerceText(
      parsed?.opening,
      "Hi there! It's nice to chat with you. How has your day been so far?",
    )

    const session = createSmallTalkSession(userId, topic)
    const turn = addSmallTalkTurn(userId, session.id, 'assistant', opening)

    return NextResponse.json({ sessionId: session.id, topic, text: opening, turnId: turn.id })
  } catch (err) {
    console.error('[small-talk/start]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}
