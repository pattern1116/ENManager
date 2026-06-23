import { describe, it, expect } from 'vitest'
import { generatePracticePrompts } from '@/lib/parsers/practice'
import type { PatternStats, PatternType } from '@/types'

const stat = (pattern: PatternType, avgScore: number, trend: PatternStats['trend']): PatternStats => ({
  pattern,
  avgScore,
  trend,
  count: 10,
})

const ALL_PATTERNS: PatternType[] = ['PRE', 'SID', 'CE', 'CC', 'HO']

describe('generatePracticePrompts — even rotation deck', () => {
  it('covers all five patterns', () => {
    const deck = generatePracticePrompts()
    const patterns = new Set(deck.map(p => p.targetPattern))
    for (const pat of ALL_PATTERNS) expect(patterns.has(pat)).toBe(true)
    expect(patterns.has('UNKNOWN')).toBe(false)
  })

  it('round-robins evenly: the first five prompts are the five distinct patterns', () => {
    const deck = generatePracticePrompts()
    const firstFive = deck.slice(0, 5).map(p => p.targetPattern)
    expect(new Set(firstFive).size).toBe(5)
    expect(firstFive).toEqual(ALL_PATTERNS) // ROTATION order, interleaved
  })

  it('offers a wide pool of distinct topics per pattern (>= 10)', () => {
    const deck = generatePracticePrompts()
    for (const pat of ALL_PATTERNS) {
      const topics = deck.filter(p => p.targetPattern === pat).map(p => p.topic)
      expect(new Set(topics).size).toBe(topics.length) // all distinct
      expect(topics.length).toBeGreaterThanOrEqual(10) // lots of variety
    }
  })

  it('attaches the matching structure hint to every prompt', () => {
    const deck = generatePracticePrompts()
    const HINT_PREFIX: Record<string, string> = {
      PRE: 'Lead with your point',
      SID: 'Signal your stance',
      CE: 'Name the cause',
      CC: 'State one side',
      HO: 'Soften first',
    }
    for (const p of deck) {
      expect(p.hint).toBeTruthy()
      expect(p.hint!).toContain(HINT_PREFIX[p.targetPattern])
    }
  })

  it('defaults every pattern to its beginner base time when there are no stats', () => {
    const deck = generatePracticePrompts()
    expect(deck.every(p => p.difficulty === 'beginner')).toBe(true)
    const base: Record<string, number> = { PRE: 30, SID: 35, CE: 30, CC: 40, HO: 35 }
    for (const p of deck) expect(p.timerSeconds).toBe(base[p.targetPattern])
  })

  it('timer = per-pattern base + per-tier bonus (0 / 25 / 50)', () => {
    const deck = generatePracticePrompts([
      stat('PRE', 80, 'stable'),   // advanced → 30 + 50
      stat('SID', 60, 'stable'),   // intermediate → 35 + 25
      stat('CE', 40, 'stable'),    // beginner → 30 + 0
    ])
    const pre = deck.find(p => p.targetPattern === 'PRE')!
    const sid = deck.find(p => p.targetPattern === 'SID')!
    const ce = deck.find(p => p.targetPattern === 'CE')!
    expect([pre.difficulty, pre.timerSeconds]).toEqual(['advanced', 80])
    expect([sid.difficulty, sid.timerSeconds]).toEqual(['intermediate', 60])
    expect([ce.difficulty, ce.timerSeconds]).toEqual(['beginner', 30])
  })

  it('promotes to advanced at avgScore >= 75 when not declining', () => {
    const deck = generatePracticePrompts([stat('PRE', 80, 'stable')])
    expect(deck.find(p => p.targetPattern === 'PRE')!.difficulty).toBe('advanced')
  })

  it('does not promote to advanced when the pattern is declining', () => {
    const deck = generatePracticePrompts([stat('PRE', 80, 'declining')])
    expect(deck.find(p => p.targetPattern === 'PRE')!.difficulty).toBe('intermediate')
  })

  it('selects intermediate when trend is improving even at a low score', () => {
    const deck = generatePracticePrompts([stat('PRE', 40, 'improving')])
    expect(deck.find(p => p.targetPattern === 'PRE')!.difficulty).toBe('intermediate')
  })
})
