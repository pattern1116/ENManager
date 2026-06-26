// GET  /api/sessions        → list sessions
// POST /api/sessions        → create session
// GET  /api/sessions/[id]   → session detail + utterances
//
// Every response is scoped to the authenticated user.

import { NextRequest, NextResponse } from 'next/server'
import { createSession, listSessions, getProgressReport } from '@/lib/db'
import { currentUserId } from '@/lib/currentUser'

export async function GET(_req: NextRequest) {
  try {
    const userId = currentUserId()
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const sessions = listSessions(userId, 20)
    const progress = getProgressReport(userId)
    return NextResponse.json({ sessions, progress })
  } catch (err) {
    console.error('[sessions GET]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(_req: NextRequest) {
  try {
    const userId = currentUserId()
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const session = createSession(userId)
    return NextResponse.json(session, { status: 201 })
  } catch (err) {
    console.error('[sessions POST]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
