import { describe, it, expect } from 'vitest'
import { evaluatePractice } from '@/lib/practiceResult'
import type { PatternType } from '@/types'

// Minimal feedback shape evaluatePractice needs.
const fb = (patternDetected: PatternType, score: number) => ({ patternDetected, score })

describe('evaluatePractice — practice result loop', () => {
  it('marks a hit when detected pattern equals the target', () => {
    const r = evaluatePractice('PRE', fb('PRE', 90))
    expect(r.hit).toBe(true)
    expect(r.targetPattern).toBe('PRE')
    expect(r.detectedPattern).toBe('PRE')
  })

  it('praises a high-scoring hit', () => {
    const r = evaluatePractice('CE', fb('CE', 88))
    expect(r.hit).toBe(true)
    expect(r.message).toMatch(/Nailed/i)
  })

  it('hits but nudges to tighten when the score is low', () => {
    const r = evaluatePractice('CE', fb('CE', 55))
    expect(r.hit).toBe(true)
    expect(r.message).toMatch(/tighten/i)
  })

  it('marks a miss when a different pattern is detected', () => {
    const r = evaluatePractice('PRE', fb('CE', 70))
    expect(r.hit).toBe(false)
    expect(r.message).toContain('CE')
    expect(r.message).toContain('PRE')
  })

  it('handles UNKNOWN detection as a miss with a coaching nudge', () => {
    const r = evaluatePractice('SID', fb('UNKNOWN', 20))
    expect(r.hit).toBe(false)
    expect(r.detectedPattern).toBe('UNKNOWN')
    expect(r.message).toMatch(/Aim for SID/i)
  })
})
