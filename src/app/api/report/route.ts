// GET /api/report → WeeklyReportData (scoped to the current user)

import { NextResponse } from 'next/server'
import { getWeeklyReport } from '@/lib/db'
import { currentUserId } from '@/lib/currentUser'

export async function GET() {
  try {
    const userId = currentUserId()
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const report = getWeeklyReport(userId)
    return NextResponse.json(report)
  } catch (err) {
    console.error('[report GET]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
