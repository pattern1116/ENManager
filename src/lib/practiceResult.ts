// ─────────────────────────────────────────────────────────────────
// Practice result loop
//
// When an utterance answers a practice prompt, we know the pattern the
// speaker was *aiming* for (targetPattern). This module compares that
// target against the pattern the analysis actually detected and produces
// a short verdict shown in the feedback panel and stored with progress.
// ─────────────────────────────────────────────────────────────────

import type { PatternType, UtteranceFeedback, PracticeResult } from '@/types'

const PATTERN_LABEL: Record<PatternType, string> = {
  PRE: 'PRE', SID: 'SID', CE: 'CE', CC: 'CC', HO: 'HO', UNKNOWN: 'no clear pattern',
}

export function evaluatePractice(
  targetPattern: PatternType,
  feedback: Pick<UtteranceFeedback, 'patternDetected' | 'score'>,
): PracticeResult {
  const detected = feedback.patternDetected
  const hit = detected === targetPattern

  let message: string
  if (hit) {
    message =
      feedback.score >= 75
        ? `Nailed the ${targetPattern} structure.`
        : `You used ${targetPattern}, but tighten the structure to score higher.`
  } else if (detected === 'UNKNOWN') {
    message = `Aim for ${targetPattern} — no clear structure came through this time.`
  } else {
    message = `That landed as ${PATTERN_LABEL[detected]}; the target was ${targetPattern}.`
  }

  return { targetPattern, detectedPattern: detected, hit, message }
}
