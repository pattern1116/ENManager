import { describe, it, expect } from 'vitest'
import { buildFeedback, coercePattern, coerceScore, coerceGaps } from '@/lib/feedback'
import type { UtteranceFeedback } from '@/types'

const FALLBACK: UtteranceFeedback = {
  patternDetected: 'PRE',
  patternConfidence: 'low',
  gapsFound: [{ component: 'reason', description: 'no reason' }],
  rewrite: 'fallback rewrite',
  explanation: 'fallback explanation',
  score: 50,
}

describe('coercePattern', () => {
  it('passes through valid patterns', () => {
    for (const p of ['PRE', 'SID', 'CE', 'CC', 'HO', 'UNKNOWN'] as const) {
      expect(coercePattern(p)).toBe(p)
    }
  })
  it('coerces invalid / compound / non-string values to UNKNOWN', () => {
    expect(coercePattern('PRE|SID')).toBe('UNKNOWN')
    expect(coercePattern('pre')).toBe('UNKNOWN')
    expect(coercePattern('')).toBe('UNKNOWN')
    expect(coercePattern(null)).toBe('UNKNOWN')
    expect(coercePattern(42)).toBe('UNKNOWN')
    expect(coercePattern(undefined)).toBe('UNKNOWN')
  })
})

describe('coerceScore', () => {
  it('clamps to 0..100 and rounds', () => {
    expect(coerceScore(50)).toBe(50)
    expect(coerceScore(150)).toBe(100)
    expect(coerceScore(-10)).toBe(0)
    expect(coerceScore(73.6)).toBe(74)
    expect(coerceScore('80')).toBe(80)
  })
  it('preserves a genuine 0', () => {
    expect(coerceScore(0)).toBe(0)
  })
  it('uses fallback for non-numeric / missing', () => {
    expect(coerceScore(undefined, 50)).toBe(50)
    expect(coerceScore('abc', 50)).toBe(50)
    expect(coerceScore(NaN, 50)).toBe(50)
    expect(coerceScore(null, 50)).toBe(50)
  })
})

describe('coerceGaps', () => {
  it('guarantees an array', () => {
    expect(coerceGaps(undefined)).toEqual([])
    expect(coerceGaps('nope')).toEqual([])
    expect(coerceGaps(null)).toEqual([])
  })
  it('keeps valid gap objects and drops junk', () => {
    const input = [
      { component: 'reason', description: 'd' },
      'garbage',
      { nope: true },
      { component: 'example', description: 'e' },
    ]
    expect(coerceGaps(input)).toEqual([
      { component: 'reason', description: 'd' },
      { component: 'example', description: 'e' },
    ])
  })
})

describe('buildFeedback', () => {
  it('parses clean JSON', () => {
    const raw = JSON.stringify({
      patternDetected: 'CE',
      patternConfidence: 'high',
      gapsFound: [{ component: 'cause', description: 'unclear cause' }],
      rewrite: 'better',
      explanation: 'why',
      score: 88,
    })
    expect(buildFeedback(raw, FALLBACK)).toEqual({
      patternDetected: 'CE',
      patternConfidence: 'high',
      gapsFound: [{ component: 'cause', description: 'unclear cause' }],
      rewrite: 'better',
      explanation: 'why',
      score: 88,
    })
  })

  it('strips markdown code fences', () => {
    const raw = '```json\n{"patternDetected":"HO","patternConfidence":"medium","gapsFound":[],"rewrite":"r","explanation":"e","score":60}\n```'
    expect(buildFeedback(raw, FALLBACK).patternDetected).toBe('HO')
  })

  it('coerces an invalid pattern instead of crashing downstream', () => {
    const raw = JSON.stringify({
      patternDetected: 'PRE|SID',
      patternConfidence: 'high',
      gapsFound: [],
      rewrite: 'r',
      explanation: 'e',
      score: 70,
    })
    expect(buildFeedback(raw, FALLBACK).patternDetected).toBe('UNKNOWN')
  })

  it('clamps out-of-range score and coerces bad confidence', () => {
    const raw = JSON.stringify({
      patternDetected: 'PRE',
      patternConfidence: 'super-high',
      gapsFound: [],
      rewrite: 'r',
      explanation: 'e',
      score: 999,
    })
    const fb = buildFeedback(raw, FALLBACK)
    expect(fb.score).toBe(100)
    expect(['high', 'medium', 'low']).toContain(fb.patternConfidence)
  })

  it('guarantees gapsFound is an array when LLM returns a non-array', () => {
    const raw = JSON.stringify({
      patternDetected: 'PRE',
      patternConfidence: 'low',
      gapsFound: 'oops',
      rewrite: 'r',
      explanation: 'e',
      score: 40,
    })
    expect(Array.isArray(buildFeedback(raw, FALLBACK).gapsFound)).toBe(true)
  })

  it('returns the fallback on unparseable output', () => {
    expect(buildFeedback('not json at all', FALLBACK)).toEqual(FALLBACK)
    expect(buildFeedback('', FALLBACK)).toEqual(FALLBACK)
    expect(buildFeedback('123', FALLBACK)).toEqual(FALLBACK)
  })
})
