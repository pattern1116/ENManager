#!/usr/bin/env node
// scripts/init-db.js
// Run: node scripts/init-db.js
// Creates the DB and schema if it doesn't exist.

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
const dir    = path.dirname(dbPath)

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true })
  console.log(`Created directory: ${dir}`)
}

const Database = require('better-sqlite3')
const db = new Database(dbPath)

db.exec(`
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
    gaps_found         TEXT    NOT NULL DEFAULT '[]',
    rewrite_shown      TEXT    NOT NULL DEFAULT '',
    pattern_used       TEXT    NOT NULL DEFAULT 'UNKNOWN',
    score              INTEGER NOT NULL DEFAULT 0,
    created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_utterances_session ON utterances(session_id);
  CREATE INDEX IF NOT EXISTS idx_utterances_user ON utterances(user_id);
  CREATE INDEX IF NOT EXISTS idx_utterances_pattern ON utterances(pattern_used);
`)

console.log(`✓ Database initialised: ${dbPath}`)
db.close()
