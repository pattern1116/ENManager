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

// Every test runs as this user unless it's specifically about isolation.
const U = '1234'
const U2 = '5678'

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
  userId: string = U,
) {
  raw.prepare(`
    INSERT INTO utterances
      (user_id, session_id, text, structure_detected, gaps_found, rewrite_shown, pattern_used, score, created_at)
    VALUES (?, ?, 't', ?, '[]', '', ?, ?, ${createdAtSql})
  `).run(userId, sessionId, pattern, pattern, score)
}

beforeAll(() => {
  // Ensure schema exists, then open a raw handle to the same file.
  createSession(U)
  raw = new Database(DB_PATH)
})

beforeEach(() => {
  resetDB()
})

describe('getProgressReport — trend (Bug 2)', () => {
  it('uses only the most recent 5 utterances for the recent average', () => {
    const s = createSession(U)
    // 30 PRE utterances, oldest → newest by created_at.
    // newest 5 = 100, the 5 before that = 50, oldest 20 = 0.
    // Correct: recent(100) vs older(50) → improving.
    // Buggy (recent avg collapses to overall mean = 25): 25 vs 50 → declining.
    for (let i = 0; i < 30; i++) {
      const score = i >= 25 ? 100 : i >= 20 ? 50 : 0
      const minutes = String(i).padStart(2, '0')
      insert(s.id, 'PRE', score, `'2026-01-01 00:${minutes}:00'`)
    }

    const report = getProgressReport(U)
    const pre = report.patternStats.find(p => p.pattern === 'PRE')
    expect(pre).toBeDefined()
    expect(pre!.trend).toBe('improving')
  })

  it('reports declining when the newest 5 drop below the prior 5', () => {
    const s = createSession(U)
    // newest 5 = 0, prior 5 = 100, rest 0 → recent(0) vs older(100) → declining.
    for (let i = 0; i < 15; i++) {
      const score = i >= 10 ? 0 : i >= 5 ? 100 : 0
      const minutes = String(i).padStart(2, '0')
      insert(s.id, 'CE', score, `'2026-02-01 00:${minutes}:00'`)
    }
    const ce = getProgressReport(U).patternStats.find(p => p.pattern === 'CE')
    expect(ce!.trend).toBe('declining')
  })
})

describe('getWeeklyReport — scoreDelta with genuine 0 scores (Bug 5)', () => {
  it('computes a real delta even when this week averages 0', () => {
    const s = createSession(U)
    // last week: avg 50, this week: avg 0 (genuine zeros, not "no data")
    insert(s.id, 'PRE', 50, "datetime('now', '-10 days')")
    insert(s.id, 'PRE', 50, "datetime('now', '-9 days')")
    insert(s.id, 'PRE', 0, "datetime('now', '-3 days')")
    insert(s.id, 'PRE', 0, "datetime('now', '-2 days')")

    const report = getWeeklyReport(U)
    expect(report.thisWeek.utteranceCount).toBe(2)
    expect(report.lastWeek.utteranceCount).toBe(2)
    expect(report.thisWeek.avgScore).toBe(0)
    expect(report.lastWeek.avgScore).toBe(50)
    // Buggy code treats thisWeek.avgScore (0) as falsy → scoreDelta 0.
    expect(report.scoreDelta).toBe(-50)
  })

  it('returns 0 delta when a week genuinely has no data', () => {
    const s = createSession(U)
    insert(s.id, 'PRE', 70, "datetime('now', '-3 days')")
    const report = getWeeklyReport(U)
    expect(report.lastWeek.utteranceCount).toBe(0)
    expect(report.scoreDelta).toBe(0)
  })
})

describe('saveUtterance / getUtterance round-trip', () => {
  it('persists score, pattern and gaps_found JSON intact', () => {
    const s = createSession(U)
    const saved = saveUtterance(
      U,
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

    const list = listUtterancesForSession(U, s.id)
    expect(list).toHaveLength(1)
    expect(list[0].text).toBe('hello world')
    expect(list[0].gapsFound).toEqual([{ component: 'example', description: 'add one' }])
  })
})

describe('session aggregates', () => {
  it('reports utteranceCount and rounded avgScore', () => {
    const s = createSession(U)
    saveUtterance(U, s.id, 'a', fb({ score: 60 }))
    saveUtterance(U, s.id, 'b', fb({ score: 81 }))
    const got = getSession(U, s.id)!
    expect(got.utteranceCount).toBe(2)
    expect(got.avgScore).toBe(71) // round((60+81)/2) = 70.5 → 71
  })

  it('leaves avgScore undefined for an empty session', () => {
    const s = createSession(U)
    const got = getSession(U, s.id)!
    expect(got.utteranceCount).toBe(0)
    expect(got.avgScore).toBeUndefined()
  })

  it('getSession returns null for a missing id', () => {
    expect(getSession(U, 999999)).toBeNull()
  })

  it('listSessions returns newest first (by created_at)', () => {
    // Use explicit timestamps — createSession() uses datetime('now') at
    // 1-second resolution, so two quick inserts would tie.
    const older = raw.prepare(`INSERT INTO sessions (user_id, created_at) VALUES ('${U}', '2026-01-01 00:00:00')`).run()
      .lastInsertRowid as number
    const newer = raw.prepare(`INSERT INTO sessions (user_id, created_at) VALUES ('${U}', '2026-01-02 00:00:00')`).run()
      .lastInsertRowid as number
    const ids = listSessions(U).map(s => s.id)
    expect(ids.indexOf(newer)).toBeLessThan(ids.indexOf(older))
  })

  it('breaks created_at ties deterministically by id DESC (Bug 4)', () => {
    // Three sessions sharing the same second — without the id tie-break the
    // order is non-deterministic. Newest-inserted (highest id) must come first.
    const ts = '2026-03-01 12:00:00'
    const ids = [0, 1, 2].map(
      () => raw.prepare(`INSERT INTO sessions (user_id, created_at) VALUES ('${U}', '${ts}')`).run().lastInsertRowid as number,
    )
    const listed = listSessions(U).map(s => s.id)
    expect(listed).toEqual([...ids].reverse())
  })
})

describe('getProgressReport — totals and weak points', () => {
  it('aggregates totals and ranks the most frequent gap', () => {
    const s = createSession(U)
    saveUtterance(U, s.id, 'a', fb({ patternDetected: 'PRE', score: 40, gapsFound: [{ component: 'example', description: 'd' }] }))
    saveUtterance(U, s.id, 'b', fb({ patternDetected: 'PRE', score: 60, gapsFound: [{ component: 'example', description: 'd' }] }))
    saveUtterance(U, s.id, 'c', fb({ patternDetected: 'CE', score: 50, gapsFound: [{ component: 'cause', description: 'd' }] }))

    const r = getProgressReport(U)
    expect(r.totalSessions).toBe(1)
    expect(r.totalUtterances).toBe(3)
    expect(r.overallAvgScore).toBe(50)

    const pre = r.patternStats.find(p => p.pattern === 'PRE')!
    expect(pre.count).toBe(2)
    expect(pre.avgScore).toBe(50)

    expect(r.top3WeakPoints[0]).toEqual({ pattern: 'PRE', gapComponent: 'example', occurrences: 2 })
  })

  it('excludes UNKNOWN from pattern stats', () => {
    const s = createSession(U)
    saveUtterance(U, s.id, 'a', fb({ patternDetected: 'UNKNOWN', score: 10 }))
    const r = getProgressReport(U)
    expect(r.patternStats.find(p => p.pattern === 'UNKNOWN')).toBeUndefined()
  })
})

describe('getWeeklyReport — dailyScores and focusPattern', () => {
  it('groups utterances per day within the last 14 days', () => {
    const s = createSession(U)
    insert(s.id, 'PRE', 40, "datetime('now', '-1 days')")
    insert(s.id, 'PRE', 60, "datetime('now', '-1 days')")
    insert(s.id, 'PRE', 80, "datetime('now', '-2 days')")

    const r = getWeeklyReport(U)
    expect(r.dailyScores).toHaveLength(2)
    const counts = r.dailyScores.map(d => d.count).sort()
    expect(counts).toEqual([1, 2])
  })

  it('picks the lowest-scoring pattern as focus when none is declining', () => {
    const s = createSession(U)
    saveUtterance(U, s.id, 'a', fb({ patternDetected: 'PRE', score: 80 }))
    saveUtterance(U, s.id, 'b', fb({ patternDetected: 'CE', score: 30 }))
    const r = getWeeklyReport(U)
    expect(r.focusPattern).toBe('CE')
  })
})

// ── Per-user isolation ────────────────────────────────────────────
// Every read must be scoped to its owner: one user must never see, count,
// or aggregate another user's sessions or utterances.

describe('per-user isolation', () => {
  it('listSessions only returns the calling user\'s sessions', () => {
    const mine = createSession(U)
    createSession(U2)
    const ids = listSessions(U).map(s => s.id)
    expect(ids).toEqual([mine.id])
  })

  it('getSession does not leak another user\'s session', () => {
    const theirs = createSession(U2)
    expect(getSession(U, theirs.id)).toBeNull()
    expect(getSession(U2, theirs.id)).not.toBeNull()
  })

  it('listUtterancesForSession will not read across users', () => {
    const theirs = createSession(U2)
    saveUtterance(U2, theirs.id, 'secret', fb())
    // Even with the right session id, a different user reads nothing.
    expect(listUtterancesForSession(U, theirs.id)).toHaveLength(0)
    expect(listUtterancesForSession(U2, theirs.id)).toHaveLength(1)
  })

  it('saveUtterance rejects writing into another user\'s session', () => {
    const theirs = createSession(U2)
    expect(() => saveUtterance(U, theirs.id, 'x', fb())).toThrow()
  })

  it('getProgressReport aggregates only the caller\'s data', () => {
    const mine = createSession(U)
    saveUtterance(U, mine.id, 'a', fb({ patternDetected: 'PRE', score: 80 }))
    const theirs = createSession(U2)
    saveUtterance(U2, theirs.id, 'b', fb({ patternDetected: 'PRE', score: 0 }))
    saveUtterance(U2, theirs.id, 'c', fb({ patternDetected: 'CE', score: 0 }))

    const r = getProgressReport(U)
    expect(r.totalSessions).toBe(1)
    expect(r.totalUtterances).toBe(1)
    expect(r.overallAvgScore).toBe(80)
  })

  it('getWeeklyReport counts only the caller\'s utterances', () => {
    const mine = createSession(U)
    insert(mine.id, 'PRE', 70, "datetime('now', '-1 days')", U)
    const theirs = createSession(U2)
    insert(theirs.id, 'PRE', 10, "datetime('now', '-1 days')", U2)

    const r = getWeeklyReport(U)
    expect(r.thisWeek.utteranceCount).toBe(1)
    expect(r.thisWeek.avgScore).toBe(70)
  })

  it('resetDB(user) wipes only that user\'s data', () => {
    const mine = createSession(U)
    saveUtterance(U, mine.id, 'a', fb())
    const theirs = createSession(U2)
    saveUtterance(U2, theirs.id, 'b', fb())

    resetDB(U)
    expect(listSessions(U)).toHaveLength(0)
    expect(listSessions(U2)).toHaveLength(1)
  })
})
