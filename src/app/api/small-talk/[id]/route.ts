// GET /api/small-talk/[id]
// Returns one small-talk session with all its turns, for the review screen.

import { NextRequest, NextResponse } from 'next/server'
import { getSmallTalkSession } from '@/lib/db'
import { currentUserId } from '@/lib/currentUser'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = currentUserId()
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const id = Number(params.id)
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  const session = getSmallTalkSession(userId, id)
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json({ session })
}
