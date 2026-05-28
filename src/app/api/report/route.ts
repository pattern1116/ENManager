// GET /api/report → WeeklyReportData

import { NextResponse } from 'next/server'
import { getWeeklyReport } from '@/lib/db'

export async function GET() {
  try {
    const report = getWeeklyReport()
    return NextResponse.json(report)
  } catch (err) {
    console.error('[report GET]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
