import { describe, it, expect } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs'
import Database from 'better-sqlite3'

// Regression for adopting a database created before per-user isolation: the
// running app caches one connection, so the schema must be brought forward
// automatically when that connection first opens an old file — otherwise
// every user-scoped query throws "SQLITE_ERROR: no such column: user_id".
//
// We hand the db module a file that already has the OLD schema (no user_id)
// plus a legacy row, BEFORE it opens its connection (getDB reads DB_PATH
// lazily on first call), then assert migrate() patched it in.

const DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sc-migrate-')), 'old.db')
process.env.DB_PATH = DB_PATH

// ── Seed the pre-isolation database (runs before the db module is used) ──
const seed = new Database(DB_PATH)
seed.exec(`
  CREATE TABLE sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE utterances (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id         INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    text               TEXT    NOT NULL,
    structure_detected TEXT    NOT NULL DEFAULT 'UNKNOWN',
    gaps_found         TEXT    NOT NULL DEFAULT '[]',
    rewrite_shown      TEXT    NOT NULL DEFAULT '',
    pattern_used       TEXT    NOT NULL DEFAULT 'UNKNOWN',
    score              INTEGER NOT NULL DEFAULT 0,
    created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`)
const legacySession = seed.prepare('INSERT INTO sessions DEFAULT VALUES').run().lastInsertRowid as number
seed.prepare(
  `INSERT INTO utterances (session_id, text, pattern_used, score) VALUES (?, 'legacy', 'PRE', 70)`
).run(legacySession)
seed.close()

import { createSession, listSessions, getProgressReport } from '@/lib/db'

const U = '0711'

describe('schema migration — adopting a pre-user_id database', () => {
  it('adds the user_id columns automatically so user-scoped queries work', () => {
    // The first call into the db module opens the old file and runs migrate().
    // Before the fix this threw SQLITE_ERROR: no such column: user_id.
    const s = createSession(U)
    expect(s.id).toBeGreaterThan(0)
    expect(listSessions(U).map(x => x.id)).toEqual([s.id])
  })

  it('stamps legacy rows with the empty owner and keeps them (not dropped)', () => {
    const raw = new Database(DB_PATH)
    const cols = (raw.prepare('PRAGMA table_info(utterances)').all() as { name: string }[])
      .map(c => c.name)
    expect(cols).toContain('user_id')

    const legacy = raw.prepare("SELECT user_id FROM utterances WHERE text = 'legacy'").get() as any
    expect(legacy).toBeDefined()          // still there
    expect(legacy.user_id).toBe('')       // owned by '', unreachable to a 4-digit code
    raw.close()
  })

  it('never surfaces the legacy data to a real user', () => {
    // user_id '' can never equal a 4-digit login code, so the migrated rows
    // stay archived rather than leaking into the first account that logs in.
    const r = getProgressReport(U)
    expect(r.totalUtterances).toBe(0)
    expect(r.totalSessions).toBe(1)       // only the session this user just created
  })
})
