// ─────────────────────────────────────────────────────────────────
// LLM feedback validation / coercion
//
// The LLM is asked for a strict JSON shape, but it can drift:
// invalid pattern enums ("PRE|SID"), out-of-range scores, a
// non-array `gapsFound`, etc. Downstream code (FeedbackPanel,
// DB writes) assumes the typed shape, so we coerce every field
// to a safe value here and fall back to the rule-parser result
// when the output can't be parsed at all.
// ─────────────────────────────────────────────────────────────────

import type { UtteranceFeedback, PatternType, StructureGap } from '@/types'

const VALID_PATTERNS: readonly PatternType[] = ['PRE', 'SID', 'CE', 'CC', 'HO', 'UNKNOWN']
const VALID_CONFIDENCE: readonly UtteranceFeedback['patternConfidence'][] = ['high', 'medium', 'low']

export function coercePattern(value: unknown): PatternType {
  return typeof value === 'string' && (VALID_PATTERNS as readonly string[]).includes(value)
    ? (value as PatternType)
    : 'UNKNOWN'
}

export function coerceConfidence(
  value: unknown,
  fallback: UtteranceFeedback['patternConfidence'] = 'low',
): UtteranceFeedback['patternConfidence'] {
  return typeof value === 'string' && (VALID_CONFIDENCE as readonly string[]).includes(value)
    ? (value as UtteranceFeedback['patternConfidence'])
    : fallback
}

export function coerceScore(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(100, Math.round(n)))
}

export function coerceGaps(value: unknown): StructureGap[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object')
    .map(g => ({
      component: typeof g.component === 'string' ? g.component : '',
      description: typeof g.description === 'string' ? g.description : '',
    }))
    .filter(g => g.component || g.description)
}

function coerceString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

// Parse + validate raw LLM output into a safe UtteranceFeedback.
// `fallback` is the rule-parser-derived feedback used when the
// output is not valid JSON (or not a JSON object).
export function buildFeedback(raw: string, fallback: UtteranceFeedback): UtteranceFeedback {
  let parsed: unknown
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    return fallback
  }
  if (!parsed || typeof parsed !== 'object') return fallback

  const p = parsed as Record<string, unknown>
  return {
    patternDetected: coercePattern(p.patternDetected),
    patternConfidence: coerceConfidence(p.patternConfidence, fallback.patternConfidence),
    gapsFound: coerceGaps(p.gapsFound),
    rewrite: coerceString(p.rewrite, fallback.rewrite),
    explanation: coerceString(p.explanation, fallback.explanation),
    score: coerceScore(p.score, fallback.score),
  }
}
