// ─────────────────────────────────────────────────────────────────
// Database Layer (better-sqlite3)
//
// Single SQLite file at DB_PATH, shared by all users. Every row carries a
// `user_id` (the login code) and every query is scoped to one user, so each
// account's sessions, utterances and analytics are fully isolated. The
// caller (an API route) passes the authenticated user id in as the first
// argument — there is no ambient "current user" at this layer.
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
  user_id     TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS utterances (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            TEXT    NOT NULL DEFAULT '',
  session_id         INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  text               TEXT    NOT NULL,
  structure_detected TEXT    NOT NULL DEFAULT 'UNKNOWN',
  gaps_found         TEXT    NOT NULL DEFAULT '[]',   -- JSON array
  rewrite_shown      TEXT    NOT NULL DEFAULT '',
  pattern_used       TEXT    NOT NULL DEFAULT 'UNKNOWN',
  score              INTEGER NOT NULL DEFAULT 0,       -- 0–100
  created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_utterances_session ON utterances(session_id);
CREATE INDEX IF NOT EXISTS idx_utterances_user ON utterances(user_id);
CREATE INDEX IF NOT EXISTS idx_utterances_pattern ON utterances(pattern_used);
`

// Bring a database created before per-user isolation up to the current
// schema: add the user_id columns if they're missing. Pre-existing rows keep
// the '' default owner — login codes are 4 digits, so '' is unreachable and
// that legacy data stays archived (never surfaced to a real account) rather
// than leaking into the first user who logs in.
function migrate(db: Database.Database): void {
  const hasColumn = (table: string, col: string) =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[])
      .some(c => c.name === col)

  if (!hasColumn('sessions', 'user_id')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN user_id TEXT NOT NULL DEFAULT ''`)
  }
  if (!hasColumn('utterances', 'user_id')) {
    db.exec(`ALTER TABLE utterances ADD COLUMN user_id TEXT NOT NULL DEFAULT ''`)
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_utterances_user ON utterances(user_id);
  `)
}

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
  migrate(db)
  globalForDB._scDb = db
  return db
}

// ── Sessions ──────────────────────────────────────────────────────

export function createSession(userId: string): Session {
  const db = getDB()
  const result = db.prepare('INSERT INTO sessions (user_id) VALUES (?)').run(userId)
  return getSession(userId, result.lastInsertRowid as number)!
}

export function getSession(userId: string, id: number): Session | null {
  const db = getDB()
  const row = db.prepare(`
    SELECT s.id, s.created_at,
           COUNT(u.id)      AS utterance_count,
           AVG(u.score)     AS avg_score
    FROM   sessions s
    LEFT JOIN utterances u ON u.session_id = s.id
    WHERE  s.id = ? AND s.user_id = ?
    GROUP  BY s.id
  `).get(id, userId) as any
  if (!row) return null
  return rowToSession(row)
}

export function listSessions(userId: string, limit = 20): Session[] {
  const db = getDB()
  const rows = db.prepare(`
    SELECT s.id, s.created_at,
           COUNT(u.id)   AS utterance_count,
           AVG(u.score)  AS avg_score
    FROM   sessions s
    LEFT JOIN utterances u ON u.session_id = s.id
    WHERE  s.user_id = ?
    GROUP  BY s.id
    ORDER  BY s.created_at DESC, s.id DESC
    LIMIT  ?
  `).all(userId, limit) as any[]
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
  userId: string,
  sessionId: number,
  text: string,
  feedback: UtteranceFeedback,
): Utterance {
  const db = getDB()
  // Guard against writing into a session that isn't this user's — a stale or
  // forged session id must never let one account append to another's history.
  const owns = db.prepare(
    'SELECT 1 FROM sessions WHERE id = ? AND user_id = ?'
  ).get(sessionId, userId)
  if (!owns) throw new Error(`session ${sessionId} not found for user`)

  const result = db.prepare(`
    INSERT INTO utterances
      (user_id, session_id, text, structure_detected, gaps_found, rewrite_shown, pattern_used, score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    sessionId,
    text,
    feedback.patternDetected,
    JSON.stringify(feedback.gapsFound),
    feedback.rewrite,
    feedback.patternDetected,
    feedback.score,
  )
  return getUtterance(userId, result.lastInsertRowid as number)!
}

export function getUtterance(userId: string, id: number): Utterance | null {
  const db = getDB()
  const row = db.prepare('SELECT * FROM utterances WHERE id = ? AND user_id = ?').get(id, userId) as any
  if (!row) return null
  return rowToUtterance(row)
}

export function listUtterancesForSession(userId: string, sessionId: number): Utterance[] {
  const db = getDB()
  const rows = db.prepare(
    'SELECT * FROM utterances WHERE session_id = ? AND user_id = ? ORDER BY created_at ASC'
  ).all(sessionId, userId) as any[]
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

export function getProgressReport(userId: string): ProgressReport {
  const db = getDB()

  const totals = db.prepare(`
    SELECT COUNT(DISTINCT s.id) AS total_sessions,
           COUNT(u.id)          AS total_utterances,
           AVG(u.score)         AS overall_avg
    FROM   sessions s
    LEFT JOIN utterances u ON u.session_id = s.id
    WHERE  s.user_id = ?
  `).get(userId) as any

  const patternRows = db.prepare(`
    SELECT pattern_used,
           COUNT(*)   AS cnt,
           AVG(score) AS avg_score
    FROM   utterances
    WHERE  user_id = ? AND pattern_used != 'UNKNOWN'
    GROUP  BY pattern_used
    ORDER  BY cnt DESC
  `).all(userId) as any[]

  // Trend: compare avg score of last 5 vs previous 5 per pattern
  const patternStats: PatternStats[] = patternRows.map(r => {
    const recent = db.prepare(`
      SELECT AVG(score) AS avg FROM (
        SELECT score FROM utterances
        WHERE user_id = ? AND pattern_used = ?
        ORDER BY created_at DESC
        LIMIT 5
      )
    `).get(userId, r.pattern_used) as any
    const older = db.prepare(`
      SELECT AVG(score) AS avg FROM (
        SELECT score FROM utterances
        WHERE user_id = ? AND pattern_used = ?
        ORDER BY created_at DESC
        LIMIT 5 OFFSET 5
      )
    `).get(userId, r.pattern_used) as any

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
  // Only count gaps tied to a recognised pattern — gaps on UNKNOWN utterances
  // (no detectable structure) aren't actionable and show up as confusing
  // "UNKNOWN · …" rows in the report.
  const gapRows = db.prepare(`
    SELECT pattern_used, gaps_found FROM utterances
    WHERE user_id = ?
    AND   gaps_found != '[]'
    AND   pattern_used != 'UNKNOWN'
    ORDER BY created_at DESC
    LIMIT 100
  `).all(userId) as any[]

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
    WHERE user_id = ? AND created_at >= datetime('now', '-7 days')
  `).get(userId) as any
  const olderAvg = db.prepare(`
    SELECT AVG(score) AS avg FROM utterances
    WHERE user_id = ?
    AND   created_at < datetime('now', '-7 days')
    AND   created_at >= datetime('now', '-14 days')
  `).get(userId) as any

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

// One aggregated point on the score trend. `date` is the bucket's start date
// (YYYY-MM-DD): the day itself, the week's start, or the month's first day.
export interface ScoreBucket {
  date: string
  avgScore: number
  count: number
}

export interface ScoreTrends {
  daily: ScoreBucket[]    // last ~30 days
  weekly: ScoreBucket[]   // last ~12 weeks (bucket = week start)
  monthly: ScoreBucket[]  // last ~12 months (bucket = month start)
}

export interface WeeklyReportData {
  thisWeek: WeekSummary
  lastWeek: WeekSummary
  scoreDelta: number
  dailyScores: DayScore[]   // last 14 days, one row per day that has data
  trends: ScoreTrends       // selectable day/week/month score trend
  patternStats: PatternStats[]
  top3WeakPoints: WeakPoint[]
  focusPattern: PatternType | null
}

function weekSummary(db: Database.Database, userId: string, start: string, end: string): WeekSummary {
  const row = db.prepare(`
    SELECT AVG(u.score) AS avg_score,
           COUNT(u.id)  AS utterance_count,
           COUNT(DISTINCT u.session_id) AS session_count
    FROM utterances u
    WHERE u.user_id = ? AND u.created_at >= ? AND u.created_at < ?
  `).get(userId, start, end) as any
  return {
    avgScore:       row?.avg_score       != null ? Math.round(row.avg_score) : 0,
    utteranceCount: row?.utterance_count ?? 0,
    sessionCount:   row?.session_count   ?? 0,
  }
}

export function getWeeklyReport(userId: string): WeeklyReportData {
  const db = getDB()

  const now      = "datetime('now')"
  const minus7   = "datetime('now', '-7 days')"
  const minus14  = "datetime('now', '-14 days')"

  const thisWeek = weekSummary(db, userId, db.prepare(`SELECT ${minus7}`).pluck().get() as string,
                                           db.prepare(`SELECT ${now}`).pluck().get() as string)
  const lastWeek = weekSummary(db, userId, db.prepare(`SELECT ${minus14}`).pluck().get() as string,
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
    WHERE user_id = ? AND created_at >= datetime('now', '-14 days')
    GROUP BY date(created_at)
    ORDER BY date ASC
  `).all(userId) as any[]

  const dailyScores: DayScore[] = dailyRows.map(r => ({
    date:     r.date,
    avgScore: r.avg_score ?? 0,
    count:    r.count,
  }))

  // Selectable score trend, bucketed by day / week / month. Each bucket keys
  // off a start date so the client can format axis labels and the user can
  // toggle granularity (a day view reacts fast; month view shows the long arc).
  const bucketSeries = (bucketExpr: string, sinceDays: number): ScoreBucket[] =>
    (db.prepare(`
      SELECT ${bucketExpr} AS bucket,
             ROUND(AVG(score)) AS avg_score,
             COUNT(*) AS count
      FROM utterances
      WHERE user_id = ? AND created_at >= datetime('now', ?)
      GROUP BY bucket
      ORDER BY bucket ASC
    `).all(userId, `-${sinceDays} days`) as any[])
      .map(r => ({ date: r.bucket as string, avgScore: r.avg_score ?? 0, count: r.count }))

  const trends: ScoreTrends = {
    // Week starts on Sunday: subtract the weekday index (0=Sun) in days.
    daily:   bucketSeries(`date(created_at)`, 30),
    weekly:  bucketSeries(`date(created_at, '-' || strftime('%w', created_at) || ' days')`, 84),
    monthly: bucketSeries(`strftime('%Y-%m-01', created_at)`, 365),
  }

  const { patternStats, top3WeakPoints } = getProgressReport(userId)

  // Focus = declining pattern first, then lowest-scoring, then null
  const declining = patternStats.find(p => p.trend === 'declining')
  const lowest    = [...patternStats].sort((a, b) => a.avgScore - b.avgScore)[0]
  const focusPattern: PatternType | null = declining?.pattern ?? lowest?.pattern ?? null

  return { thisWeek, lastWeek, scoreDelta, dailyScores, trends, patternStats, top3WeakPoints, focusPattern }
}

// Wipe data. With a userId, only that account's rows are removed (utterances
// cascade from their sessions, but we delete both explicitly so an utterance
// can't be orphaned). With no userId, the whole DB is cleared (test / admin).
export function resetDB(userId?: string): void {
  const db = getDB()
  if (userId === undefined) {
    db.exec('DELETE FROM utterances; DELETE FROM sessions;')
    return
  }
  db.prepare('DELETE FROM utterances WHERE user_id = ?').run(userId)
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
}
