// ─────────────────────────────────────────────────────────────────
// Database Layer (better-sqlite3)
//
// Single SQLite file at DB_PATH. No user_id — single user app.
// ─────────────────────────────────────────────────────────────────

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import type {
  Session,
  Utterance,
  UtteranceFeedback,
  PatternType,
  PatternStats,
  WeakPoint,
  ProgressReport,
} from '@/types'

// ── Schema ────────────────────────────────────────────────────────

const SCHEMA = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS utterances (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id         INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  text               TEXT    NOT NULL,
  structure_detected TEXT    NOT NULL DEFAULT 'UNKNOWN',
  gaps_found         TEXT    NOT NULL DEFAULT '[]',   -- JSON array
  rewrite_shown      TEXT    NOT NULL DEFAULT '',
  pattern_used       TEXT    NOT NULL DEFAULT 'UNKNOWN',
  score              INTEGER NOT NULL DEFAULT 0,       -- 0–100
  created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_utterances_session ON utterances(session_id);
CREATE INDEX IF NOT EXISTS idx_utterances_pattern ON utterances(pattern_used);
`

// ── Connection singleton ──────────────────────────────────────────
//
// Cache the handle on globalThis so Next's dev hot-reload (which
// re-evaluates this module) reuses the existing connection instead of
// opening a new one every reload and leaking the old ones.

const globalForDB = globalThis as unknown as { _scDb?: Database.Database }

function getDB(): Database.Database {
  if (globalForDB._scDb) return globalForDB._scDb

  const dbPath = path.resolve(process.env.DB_PATH ?? './data/speaking-coach.db')
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const db = new Database(dbPath)
  db.exec(SCHEMA)
  globalForDB._scDb = db
  return db
}

// ── Sessions ──────────────────────────────────────────────────────

export function createSession(): Session {
  const db = getDB()
  const result = db.prepare('INSERT INTO sessions DEFAULT VALUES').run()
  return getSession(result.lastInsertRowid as number)!
}

export function getSession(id: number): Session | null {
  const db = getDB()
  const row = db.prepare(`
    SELECT s.id, s.created_at,
           COUNT(u.id)      AS utterance_count,
           AVG(u.score)     AS avg_score
    FROM   sessions s
    LEFT JOIN utterances u ON u.session_id = s.id
    WHERE  s.id = ?
    GROUP  BY s.id
  `).get(id) as any
  if (!row) return null
  return rowToSession(row)
}

export function listSessions(limit = 20): Session[] {
  const db = getDB()
  const rows = db.prepare(`
    SELECT s.id, s.created_at,
           COUNT(u.id)   AS utterance_count,
           AVG(u.score)  AS avg_score
    FROM   sessions s
    LEFT JOIN utterances u ON u.session_id = s.id
    GROUP  BY s.id
    ORDER  BY s.created_at DESC
    LIMIT  ?
  `).all(limit) as any[]
  return rows.map(rowToSession)
}

function rowToSession(row: any): Session {
  return {
    id: row.id,
    createdAt: row.created_at,
    utteranceCount: row.utterance_count ?? 0,
    avgScore: row.avg_score != null ? Math.round(row.avg_score) : undefined,
  }
}

// ── Utterances ────────────────────────────────────────────────────

export function saveUtterance(
  sessionId: number,
  text: string,
  feedback: UtteranceFeedback,
): Utterance {
  const db = getDB()
  const result = db.prepare(`
    INSERT INTO utterances
      (session_id, text, structure_detected, gaps_found, rewrite_shown, pattern_used, score)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    text,
    feedback.patternDetected,
    JSON.stringify(feedback.gapsFound),
    feedback.rewrite,
    feedback.patternDetected,
    feedback.score,
  )
  return getUtterance(result.lastInsertRowid as number)!
}

export function getUtterance(id: number): Utterance | null {
  const db = getDB()
  const row = db.prepare('SELECT * FROM utterances WHERE id = ?').get(id) as any
  if (!row) return null
  return rowToUtterance(row)
}

export function listUtterancesForSession(sessionId: number): Utterance[] {
  const db = getDB()
  const rows = db.prepare(
    'SELECT * FROM utterances WHERE session_id = ? ORDER BY created_at ASC'
  ).all(sessionId) as any[]
  return rows.map(rowToUtterance)
}

function rowToUtterance(row: any): Utterance {
  return {
    id: row.id,
    sessionId: row.session_id,
    text: row.text,
    structureDetected: row.structure_detected as PatternType,
    gapsFound: JSON.parse(row.gaps_found ?? '[]'),
    rewriteShown: row.rewrite_shown,
    patternUsed: row.pattern_used as PatternType,
    score: row.score,
    createdAt: row.created_at,
  }
}

// ── Progress & analytics ──────────────────────────────────────────

export function getProgressReport(): ProgressReport {
  const db = getDB()

  const totals = db.prepare(`
    SELECT COUNT(DISTINCT s.id) AS total_sessions,
           COUNT(u.id)          AS total_utterances,
           AVG(u.score)         AS overall_avg
    FROM   sessions s
    LEFT JOIN utterances u ON u.session_id = s.id
  `).get() as any

  const patternRows = db.prepare(`
    SELECT pattern_used,
           COUNT(*)   AS cnt,
           AVG(score) AS avg_score
    FROM   utterances
    WHERE  pattern_used != 'UNKNOWN'
    GROUP  BY pattern_used
    ORDER  BY cnt DESC
  `).all() as any[]

  // Trend: compare avg score of last 5 vs previous 5 per pattern
  const patternStats: PatternStats[] = patternRows.map(r => {
    const recent = db.prepare(`
      SELECT AVG(score) AS avg FROM (
        SELECT score FROM utterances
        WHERE pattern_used = ?
        ORDER BY created_at DESC
        LIMIT 5
      )
    `).get(r.pattern_used) as any
    const older = db.prepare(`
      SELECT AVG(score) AS avg FROM (
        SELECT score FROM utterances
        WHERE pattern_used = ?
        ORDER BY created_at DESC
        LIMIT 5 OFFSET 5
      )
    `).get(r.pattern_used) as any

    let trend: PatternStats['trend'] = 'stable'
    if (recent?.avg != null && older?.avg != null) {
      if (recent.avg > older.avg + 3) trend = 'improving'
      else if (recent.avg < older.avg - 3) trend = 'declining'
    }

    return {
      pattern: r.pattern_used as PatternType,
      count: r.cnt,
      avgScore: Math.round(r.avg_score),
      trend,
    }
  })

  // Top 3 weak points: most frequent gaps
  const gapRows = db.prepare(`
    SELECT pattern_used, gaps_found FROM utterances
    WHERE gaps_found != '[]'
    ORDER BY created_at DESC
    LIMIT 100
  `).all() as any[]

  const gapMap = new Map<string, WeakPoint>()
  for (const row of gapRows) {
    const gaps = JSON.parse(row.gaps_found ?? '[]') as { component: string }[]
    for (const gap of gaps) {
      const key = `${row.pattern_used}::${gap.component}`
      const existing = gapMap.get(key)
      if (existing) {
        existing.occurrences++
      } else {
        gapMap.set(key, {
          pattern: row.pattern_used,
          gapComponent: gap.component,
          occurrences: 1,
        })
      }
    }
  }
  const top3WeakPoints = [...gapMap.values()]
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 3)

  // 7-day improvement
  const recentAvg = db.prepare(`
    SELECT AVG(score) AS avg FROM utterances
    WHERE created_at >= datetime('now', '-7 days')
  `).get() as any
  const olderAvg = db.prepare(`
    SELECT AVG(score) AS avg FROM utterances
    WHERE created_at < datetime('now', '-7 days')
    AND   created_at >= datetime('now', '-14 days')
  `).get() as any

  const recentImprovement =
    recentAvg?.avg != null && olderAvg?.avg != null
      ? Math.round(recentAvg.avg - olderAvg.avg)
      : 0

  return {
    totalSessions: totals.total_sessions ?? 0,
    totalUtterances: totals.total_utterances ?? 0,
    overallAvgScore: totals.overall_avg != null ? Math.round(totals.overall_avg) : 0,
    patternStats,
    top3WeakPoints,
    recentImprovement,
  }
}

// ── Weekly report ─────────────────────────────────────────────────

export interface DayScore {
  date: string       // YYYY-MM-DD
  avgScore: number
  count: number
}

export interface WeekSummary {
  avgScore: number
  utteranceCount: number
  sessionCount: number
}

export interface WeeklyReportData {
  thisWeek: WeekSummary
  lastWeek: WeekSummary
  scoreDelta: number
  dailyScores: DayScore[]   // last 14 days, one row per day that has data
  patternStats: PatternStats[]
  top3WeakPoints: WeakPoint[]
  focusPattern: PatternType | null
}

function weekSummary(db: Database.Database, start: string, end: string): WeekSummary {
  const row = db.prepare(`
    SELECT AVG(u.score) AS avg_score,
           COUNT(u.id)  AS utterance_count,
           COUNT(DISTINCT u.session_id) AS session_count
    FROM utterances u
    WHERE u.created_at >= ? AND u.created_at < ?
  `).get(start, end) as any
  return {
    avgScore:       row?.avg_score       != null ? Math.round(row.avg_score) : 0,
    utteranceCount: row?.utterance_count ?? 0,
    sessionCount:   row?.session_count   ?? 0,
  }
}

export function getWeeklyReport(): WeeklyReportData {
  const db = getDB()

  const now      = "datetime('now')"
  const minus7   = "datetime('now', '-7 days')"
  const minus14  = "datetime('now', '-14 days')"

  const thisWeek = weekSummary(db, db.prepare(`SELECT ${minus7}`).pluck().get() as string,
                                   db.prepare(`SELECT ${now}`).pluck().get() as string)
  const lastWeek = weekSummary(db, db.prepare(`SELECT ${minus14}`).pluck().get() as string,
                                   db.prepare(`SELECT ${minus7}`).pluck().get() as string)

  // Use utteranceCount (not avgScore truthiness) to decide whether a week
  // has data — otherwise a genuine average of 0 is mistaken for "no data".
  const scoreDelta = thisWeek.utteranceCount > 0 && lastWeek.utteranceCount > 0
    ? thisWeek.avgScore - lastWeek.avgScore
    : 0

  const dailyRows = db.prepare(`
    SELECT date(created_at) AS date,
           ROUND(AVG(score)) AS avg_score,
           COUNT(*) AS count
    FROM utterances
    WHERE created_at >= datetime('now', '-14 days')
    GROUP BY date(created_at)
    ORDER BY date ASC
  `).all() as any[]

  const dailyScores: DayScore[] = dailyRows.map(r => ({
    date:     r.date,
    avgScore: r.avg_score ?? 0,
    count:    r.count,
  }))

  const { patternStats, top3WeakPoints } = getProgressReport()

  // Focus = declining pattern first, then lowest-scoring, then null
  const declining = patternStats.find(p => p.trend === 'declining')
  const lowest    = [...patternStats].sort((a, b) => a.avgScore - b.avgScore)[0]
  const focusPattern: PatternType | null = declining?.pattern ?? lowest?.pattern ?? null

  return { thisWeek, lastWeek, scoreDelta, dailyScores, patternStats, top3WeakPoints, focusPattern }
}

export function resetDB(): void {
  const db = getDB()
  db.exec('DELETE FROM utterances; DELETE FROM sessions;')
}
