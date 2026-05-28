// GET /api/practice
// Returns PracticePrompt[] derived from the user's top 3 weak points.
// Falls back to a default set when there's no history yet.

import { NextResponse } from 'next/server'
import { getProgressReport } from '@/lib/db'
import { generatePracticePrompts } from '@/lib/parsers/practice'
import type { WeakPoint } from '@/types'

const DEFAULT_WEAK_POINTS: WeakPoint[] = [
  { pattern: 'PRE', gapComponent: 'example', occurrences: 1 },
  { pattern: 'SID', gapComponent: 'signpost', occurrences: 1 },
  { pattern: 'CE',  gapComponent: 'effect',  occurrences: 1 },
]

export async function GET() {
  try {
    const { top3WeakPoints, patternStats } = getProgressReport()
    const weakPoints = top3WeakPoints.length > 0 ? top3WeakPoints : DEFAULT_WEAK_POINTS
    const prompts = generatePracticePrompts(weakPoints, patternStats)
    return NextResponse.json({ prompts })
  } catch (err) {
    console.error('[practice GET]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
