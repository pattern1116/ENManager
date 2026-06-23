// GET /api/practice
// Returns a PracticePrompt[] deck that rotates evenly across all five
// patterns. Difficulty (and timer) per pattern adapts to the user's stats;
// with no history yet, every pattern starts at the beginner tier.

import { NextResponse } from 'next/server'
import { getProgressReport } from '@/lib/db'
import { generatePracticePrompts } from '@/lib/parsers/practice'

export async function GET() {
  try {
    const { patternStats } = getProgressReport()
    const prompts = generatePracticePrompts(patternStats)
    return NextResponse.json({ prompts })
  } catch (err) {
    console.error('[practice GET]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
