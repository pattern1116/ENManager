// GET /api/sessions/[id] → session + utterances

import { NextRequest, NextResponse } from 'next/server'
import { getSession, listUtterancesForSession } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const id = parseInt(params.id, 10)
    if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const session = getSession(id)
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const utterances = listUtterancesForSession(id)
    return NextResponse.json({ session, utterances })
  } catch (err) {
    console.error('[sessions/[id] GET]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
