// GET /api/sessions/[id] → session + utterances (scoped to the current user)

import { NextRequest, NextResponse } from 'next/server'
import { getSession, listUtterancesForSession } from '@/lib/db'
import { currentUserId } from '@/lib/currentUser'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const userId = currentUserId()
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const id = parseInt(params.id, 10)
    if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    // getSession is user-scoped, so another user's id reads as Not found.
    const session = getSession(userId, id)
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const utterances = listUtterancesForSession(userId, id)
    return NextResponse.json({ session, utterances })
  } catch (err) {
    console.error('[sessions/[id] GET]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
