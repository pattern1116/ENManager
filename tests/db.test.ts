import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs'
import Database from 'better-sqlite3'

// Point the db module at a throwaway file BEFORE it opens a connection.
// getDB() reads process.env.DB_PATH lazily (first call inside a test),
// so setting it here is enough.
const DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sc-db-')), 'test.db')
process.env.DB_PATH = DB_PATH

import {
  createSession,
  getSession,
  listSessions,
  saveUtterance,
  listUtterancesForSession,
  getProgressReport,
  getWeeklyReport,
  resetDB,
} from '@/lib/db'
import type { UtteranceFeedback } from '@/types'

let raw: Database.Database

// Build a feedback object with sensible defaults, overridable per field.
function fb(over: Partial<UtteranceFeedback> = {}): UtteranceFeedback {
  return {
    patternDetected: 'PRE',
    patternConfidence: 'high',
    gapsFound: [],
    rewrite: 'rewrite',
    explanation: 'explanation',
    score: 50,
    ...over,
  }
}

// Insert an utterance with an explicit created_at SQL expression.
// `createdAtSql` is interpolated as raw SQL (test-only, controlled input),
// so it can be either a quoted literal ("'2026-01-01 00:00:00'") or a
// datetime() call ("datetime('now', '-10 days')").
function insert(
  sessionId: number,
  pattern: string,
  score: number,
  createdAtSql: string,
) {
  raw.prepare(`
    INSERT INTO utterances
      (session_id, text, structure_detected, gaps_found, rewrite_shown, pattern_used, score, created_at)
    VALUES (?, 't', ?, '[]', '', ?, ?, ${createdAtSql})
  `).run(sessionId, pattern, pattern, score)
}

beforeAll(() => {
  // Ensure schema exists, then open a raw handle to the same file.
  createSession()
  raw = new Database(DB_PATH)
})

beforeEach(() => {
  resetDB()
})

describe('getProgressReport — trend (Bug 2)', () => {
  it('uses only the most recent 5 utterances for the recent average', () => {
    const s = createSession()
    // 30 PRE utterances, oldest → newest by created_at.
    // newest 5 = 100, the 5 before that = 50, oldest 20 = 0.
    // Correct: recent(100) vs older(50) → improving.
    // Buggy (recent avg collapses to overall mean = 25): 25 vs 50 → declining.
    for (let i = 0; i < 30; i++) {
      const score = i >= 25 ? 100 : i >= 20 ? 50 : 0
      const minutes = String(i).padStart(2, '0')
      insert(s.id, 'PRE', score, `'2026-01-01 00:${minutes}:00'`)
    }

    const report = getProgressReport()
    const pre = report.patternStats.find(p => p.pattern === 'PRE')
    expect(pre).toBeDefined()
    expect(pre!.trend).toBe('improving')
  })

  it('reports declining when the newest 5 drop below the prior 5', () => {
    const s = createSession()
    // newest 5 = 0, prior 5 = 100, rest 0 → recent(0) vs older(100) → declining.
    for (let i = 0; i < 15; i++) {
      const score = i >= 10 ? 0 : i >= 5 ? 100 : 0
      const minutes = String(i).padStart(2, '0')
      insert(s.id, 'CE', score, `'2026-02-01 00:${minutes}:00'`)
    }
    const ce = getProgressReport().patternStats.find(p => p.pattern === 'CE')
    expect(ce!.trend).toBe('declining')
  })
})

describe('getWeeklyReport — scoreDelta with genuine 0 scores (Bug 5)', () => {
  it('computes a real delta even when this week averages 0', () => {
    const s = createSession()
    // last week: avg 50, this week: avg 0 (genuine zeros, not "no data")
    insert(s.id, 'PRE', 50, "datetime('now', '-10 days')")
    insert(s.id, 'PRE', 50, "datetime('now', '-9 days')")
    insert(s.id, 'PRE', 0, "datetime('now', '-3 days')")
    insert(s.id, 'PRE', 0, "datetime('now', '-2 days')")

    const report = getWeeklyReport()
    expect(report.thisWeek.utteranceCount).toBe(2)
    expect(report.lastWeek.utteranceCount).toBe(2)
    expect(report.thisWeek.avgScore).toBe(0)
    expect(report.lastWeek.avgScore).toBe(50)
    // Buggy code treats thisWeek.avgScore (0) as falsy → scoreDelta 0.
    expect(report.scoreDelta).toBe(-50)
  })

  it('returns 0 delta when a week genuinely has no data', () => {
    const s = createSession()
    insert(s.id, 'PRE', 70, "datetime('now', '-3 days')")
    const report = getWeeklyReport()
    expect(report.lastWeek.utteranceCount).toBe(0)
    expect(report.scoreDelta).toBe(0)
  })
})

describe('saveUtterance / getUtterance round-trip', () => {
  it('persists score, pattern and gaps_found JSON intact', () => {
    const s = createSession()
    const saved = saveUtterance(
      s.id,
      'hello world',
      fb({
        patternDetected: 'CE',
        score: 82,
        gapsFound: [{ component: 'example', description: 'add one' }],
      }),
    )
    expect(saved.patternUsed).toBe('CE')
    expect(saved.structureDetected).toBe('CE')
    expect(saved.score).toBe(82)
    expect(saved.gapsFound).toEqual([{ component: 'example', description: 'add one' }])

    const list = listUtterancesForSession(s.id)
    expect(list).toHaveLength(1)
    expect(list[0].text).toBe('hello world')
    expect(list[0].gapsFound).toEqual([{ component: 'example', description: 'add one' }])
  })
})

describe('session aggregates', () => {
  it('reports utteranceCount and rounded avgScore', () => {
    const s = createSession()
    saveUtterance(s.id, 'a', fb({ score: 60 }))
    saveUtterance(s.id, 'b', fb({ score: 81 }))
    const got = getSession(s.id)!
    expect(got.utteranceCount).toBe(2)
    expect(got.avgScore).toBe(71) // round((60+81)/2) = 70.5 → 71
  })

  it('leaves avgScore undefined for an empty session', () => {
    const s = createSession()
    const got = getSession(s.id)!
    expect(got.utteranceCount).toBe(0)
    expect(got.avgScore).toBeUndefined()
  })

  it('getSession returns null for a missing id', () => {
    expect(getSession(999999)).toBeNull()
  })

  it('listSessions returns newest first (by created_at)', () => {
    // Use explicit timestamps — createSession() uses datetime('now') at
    // 1-second resolution, so two quick inserts would tie.
    const older = raw.prepare(`INSERT INTO sessions (created_at) VALUES ('2026-01-01 00:00:00')`).run()
      .lastInsertRowid as number
    const newer = raw.prepare(`INSERT INTO sessions (created_at) VALUES ('2026-01-02 00:00:00')`).run()
      .lastInsertRowid as number
    const ids = listSessions().map(s => s.id)
    expect(ids.indexOf(newer)).toBeLessThan(ids.indexOf(older))
  })
})

describe('getProgressReport — totals and weak points', () => {
  it('aggregates totals and ranks the most frequent gap', () => {
    const s = createSession()
    saveUtterance(s.id, 'a', fb({ patternDetected: 'PRE', score: 40, gapsFound: [{ component: 'example', description: 'd' }] }))
    saveUtterance(s.id, 'b', fb({ patternDetected: 'PRE', score: 60, gapsFound: [{ component: 'example', description: 'd' }] }))
    saveUtterance(s.id, 'c', fb({ patternDetected: 'CE', score: 50, gapsFound: [{ component: 'cause', description: 'd' }] }))

    const r = getProgressReport()
    expect(r.totalSessions).toBe(1)
    expect(r.totalUtterances).toBe(3)
    expect(r.overallAvgScore).toBe(50)

    const pre = r.patternStats.find(p => p.pattern === 'PRE')!
    expect(pre.count).toBe(2)
    expect(pre.avgScore).toBe(50)

    expect(r.top3WeakPoints[0]).toEqual({ pattern: 'PRE', gapComponent: 'example', occurrences: 2 })
  })

  it('excludes UNKNOWN from pattern stats', () => {
    const s = createSession()
    saveUtterance(s.id, 'a', fb({ patternDetected: 'UNKNOWN', score: 10 }))
    const r = getProgressReport()
    expect(r.patternStats.find(p => p.pattern === 'UNKNOWN')).toBeUndefined()
  })
})

describe('getWeeklyReport — dailyScores and focusPattern', () => {
  it('groups utterances per day within the last 14 days', () => {
    const s = createSession()
    insert(s.id, 'PRE', 40, "datetime('now', '-1 days')")
    insert(s.id, 'PRE', 60, "datetime('now', '-1 days')")
    insert(s.id, 'PRE', 80, "datetime('now', '-2 days')")

    const r = getWeeklyReport()
    expect(r.dailyScores).toHaveLength(2)
    const counts = r.dailyScores.map(d => d.count).sort()
    expect(counts).toEqual([1, 2])
  })

  it('picks the lowest-scoring pattern as focus when none is declining', () => {
    const s = createSession()
    saveUtterance(s.id, 'a', fb({ patternDetected: 'PRE', score: 80 }))
    saveUtterance(s.id, 'b', fb({ patternDetected: 'CE', score: 30 }))
    const r = getWeeklyReport()
    expect(r.focusPattern).toBe('CE')
  })
})
