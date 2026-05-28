// GET  /api/sessions        → list sessions
// POST /api/sessions        → create session
// GET  /api/sessions/[id]   → session detail + utterances

import { NextRequest, NextResponse } from 'next/server'
import { createSession, listSessions, getProgressReport } from '@/lib/db'

export async function GET(_req: NextRequest) {
  try {
    const sessions = listSessions(20)
    const progress = getProgressReport()
    return NextResponse.json({ sessions, progress })
  } catch (err) {
    console.error('[sessions GET]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(_req: NextRequest) {
  try {
    const session = createSession()
    return NextResponse.json(session, { status: 201 })
  } catch (err) {
    console.error('[sessions POST]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
