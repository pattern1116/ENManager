import { describe, it, expect } from 'vitest'
import { generatePracticePrompts } from '@/lib/parsers/practice'
import type { WeakPoint, PatternStats } from '@/types'

const wp = (pattern: WeakPoint['pattern'], gapComponent: string): WeakPoint => ({
  pattern,
  gapComponent,
  occurrences: 3,
})

const stat = (pattern: PatternStats['pattern'], avgScore: number, trend: PatternStats['trend']): PatternStats => ({
  pattern,
  avgScore,
  trend,
  count: 10,
})

describe('generatePracticePrompts', () => {
  it('returns an empty list for no weak points', () => {
    expect(generatePracticePrompts([])).toEqual([])
  })

  it('defaults to beginner when there are no stats', () => {
    const [p] = generatePracticePrompts([wp('PRE', 'example')])
    expect(p.difficulty).toBe('beginner')
    expect(p.timerSeconds).toBe(45)
    expect(p.targetPattern).toBe('PRE')
    expect(p.topic).toBe('Why you prefer working from home')
    expect(p.hint).toContain('For example')
  })

  it('selects advanced when avgScore >= 75 and not declining', () => {
    const [p] = generatePracticePrompts([wp('PRE', 'example')], [stat('PRE', 80, 'stable')])
    expect(p.difficulty).toBe('advanced')
    expect(p.timerSeconds).toBe(20)
    // hints are suppressed at advanced
    expect(p.hint).toBeUndefined()
  })

  it('does not promote to advanced when the pattern is declining', () => {
    const [p] = generatePracticePrompts([wp('PRE', 'example')], [stat('PRE', 80, 'declining')])
    expect(p.difficulty).toBe('intermediate')
    expect(p.timerSeconds).toBe(30)
  })

  it('selects intermediate when trend is improving even at a low score', () => {
    const [p] = generatePracticePrompts([wp('PRE', 'example')], [stat('PRE', 40, 'improving')])
    expect(p.difficulty).toBe('intermediate')
  })

  it('rotates topics by index for repeated patterns', () => {
    const prompts = generatePracticePrompts([wp('PRE', 'example'), wp('PRE', 'reason')])
    expect(prompts[0].topic).not.toBe(prompts[1].topic)
  })

  it('falls back to the UNKNOWN topic bank for an unknown pattern', () => {
    const [p] = generatePracticePrompts([wp('UNKNOWN', 'clear subject')])
    expect(p.topic).toBe('Describe a recent challenge you overcame')
  })

  it('omits the hint when the gap component has no mapped hint', () => {
    const [p] = generatePracticePrompts([wp('PRE', 'clear subject')])
    expect(p.hint).toBeUndefined()
  })
})
