// GET /api/small-talk
// Lists the learner's past small-talk conversations (most recent first) as
// lightweight summaries for the "지난 대화" list. The full transcript is loaded
// on demand via GET /api/small-talk/[id] when a conversation is opened.

import { NextResponse } from 'next/server'
import { listSmallTalkSessions } from '@/lib/db'
import { currentUserId } from '@/lib/currentUser'

export async function GET() {
  const userId = currentUserId()
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const sessions = listSmallTalkSessions(userId).map(s => ({
    id: s.id,
    topic: s.topic,
    status: s.status,
    createdAt: s.createdAt,
    // Turn count and a short preview give the list a sense of each chat without
    // shipping every turn to the client.
    userTurns: s.turns.filter(t => t.role === 'user').length,
    preview: s.turns.find(t => t.role === 'user')?.text ?? '',
  }))

  return NextResponse.json({ sessions })
}
