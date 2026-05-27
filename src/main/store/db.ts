import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'node:path';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const file = path.join(app.getPath('userData'), 'papers.sqlite');
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS papers (
      external_id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      abstract TEXT,
      authors TEXT NOT NULL,         -- JSON array
      categories TEXT NOT NULL,      -- JSON array
      published_at TEXT NOT NULL,    -- ISO
      citations INTEGER,
      influential_citations INTEGER,
      hn_points INTEGER,
      cached_at TEXT NOT NULL        -- ISO
    );
    CREATE INDEX IF NOT EXISTS idx_papers_published_at
      ON papers(published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_papers_source
      ON papers(source);
  `);
}
