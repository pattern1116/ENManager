#!/usr/bin/env node
// scripts/reset-db.js
// Run: node scripts/reset-db.js   (or: npm run db:reset)
// Wipes all data (utterances + sessions) and resets autoincrement
// counters, leaving an empty schema in place.

const path = require('path')
const fs   = require('fs')

// Load .env.local manually (dotenv not installed in scripts)
const envPath = path.resolve(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const [key, ...rest] = line.split('=')
    // Don't clobber vars already set in the real environment.
    if (key && rest.length && !(key.trim() in process.env)) {
      process.env[key.trim()] = rest.join('=').trim()
    }
  }
}

const dbPath = path.resolve(process.env.DB_PATH ?? './data/speaking-coach.db')

if (!fs.existsSync(dbPath)) {
  console.log(`Nothing to reset — no database at ${dbPath}. Run \`npm run db:init\` first.`)
  process.exit(0)
}

const Database = require('better-sqlite3')
const db = new Database(dbPath)

// Make sure the tables exist before deleting (no-op if the DB was init'd).
db.exec(`
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
    gaps_found         TEXT    NOT NULL DEFAULT '[]',
    rewrite_shown      TEXT    NOT NULL DEFAULT '',
    pattern_used       TEXT    NOT NULL DEFAULT 'UNKNOWN',
    score              INTEGER NOT NULL DEFAULT 0,
    created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`)

db.exec('DELETE FROM utterances; DELETE FROM sessions;')
// Reset AUTOINCREMENT counters if the sqlite_sequence table exists.
const hasSeq = db
  .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'`)
  .get()
if (hasSeq) db.exec(`DELETE FROM sqlite_sequence WHERE name IN ('sessions','utterances')`)

console.log(`✓ Database reset: ${dbPath}`)
db.close()
