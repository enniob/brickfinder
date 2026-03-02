import Database from 'better-sqlite3';
import path from 'path';
import { Session, Part, FoundPart } from './types';

const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, '..', 'data', 'legofinder.db');

// Ensure data directory exists
import fs from 'fs';
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id            TEXT PRIMARY KEY,
    set_num       TEXT NOT NULL,
    set_name      TEXT NOT NULL,
    set_parts     TEXT NOT NULL,
    found_parts   TEXT NOT NULL,
    missing_parts TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    last_scanned_at TEXT
  );

  CREATE TABLE IF NOT EXISTS set_cache (
    set_num  TEXT PRIMARY KEY,
    set_name TEXT NOT NULL,
    parts    TEXT NOT NULL
  );
`);

// Migrations — ADD COLUMN fails silently if already present
try { db.exec(`ALTER TABLE sessions ADD COLUMN set_img_url TEXT`); } catch {}
try { db.exec(`ALTER TABLE set_cache ADD COLUMN set_img_url TEXT`); } catch {}

// ── Sessions ──────────────────────────────────────────────────────────────────

function rowToSession(row: {
  id: string;
  set_num: string;
  set_name: string;
  set_img_url?: string | null;
  set_parts: string;
  found_parts: string;
  missing_parts: string;
  created_at: string;
  last_scanned_at: string | null;
}): Session {
  return {
    id: row.id,
    setNum: row.set_num,
    setName: row.set_name,
    setImgUrl: row.set_img_url ?? null,
    setParts: JSON.parse(row.set_parts) as Part[],
    foundParts: JSON.parse(row.found_parts) as FoundPart[],
    missingParts: JSON.parse(row.missing_parts) as Part[],
    createdAt: new Date(row.created_at),
    lastScannedAt: row.last_scanned_at ? new Date(row.last_scanned_at) : null,
  };
}

const stmts = {
  getSession: db.prepare('SELECT * FROM sessions WHERE id = ?'),
  listSessions: db.prepare('SELECT * FROM sessions ORDER BY last_scanned_at DESC, created_at DESC'),
  upsertSession: db.prepare(`
    INSERT INTO sessions (id, set_num, set_name, set_img_url, set_parts, found_parts, missing_parts, created_at, last_scanned_at)
    VALUES (@id, @setNum, @setName, @setImgUrl, @setParts, @foundParts, @missingParts, @createdAt, @lastScannedAt)
    ON CONFLICT(id) DO UPDATE SET
      found_parts    = excluded.found_parts,
      missing_parts  = excluded.missing_parts,
      last_scanned_at = excluded.last_scanned_at
  `),
  deleteSession: db.prepare('DELETE FROM sessions WHERE id = ?'),
  getCache: db.prepare('SELECT * FROM set_cache WHERE set_num = ?'),
  upsertCache: db.prepare(`
    INSERT INTO set_cache (set_num, set_name, set_img_url, parts) VALUES (@setNum, @setName, @setImgUrl, @parts)
    ON CONFLICT(set_num) DO NOTHING
  `),
};

export const sessionStore = {
  get(id: string): Session | undefined {
    const row = stmts.getSession.get(id) as Parameters<typeof rowToSession>[0] | undefined;
    return row ? rowToSession(row) : undefined;
  },

  list(): Session[] {
    const rows = stmts.listSessions.all() as Parameters<typeof rowToSession>[0][];
    return rows.map(rowToSession);
  },

  set(session: Session): void {
    stmts.upsertSession.run({
      id: session.id,
      setNum: session.setNum,
      setName: session.setName,
      setImgUrl: session.setImgUrl,
      setParts: JSON.stringify(session.setParts),
      foundParts: JSON.stringify(session.foundParts),
      missingParts: JSON.stringify(session.missingParts),
      createdAt: session.createdAt.toISOString(),
      lastScannedAt: session.lastScannedAt?.toISOString() ?? null,
    });
  },

  delete(id: string): boolean {
    const result = stmts.deleteSession.run(id);
    return result.changes > 0;
  },
};

export const setCache = {
  get(setNum: string): { setName: string; setImgUrl: string | null; parts: Part[] } | undefined {
    const row = stmts.getCache.get(setNum) as
      | { set_num: string; set_name: string; set_img_url?: string | null; parts: string }
      | undefined;
    if (!row) return undefined;
    return { setName: row.set_name, setImgUrl: row.set_img_url ?? null, parts: JSON.parse(row.parts) as Part[] };
  },

  set(setNum: string, data: { setName: string; setImgUrl: string | null; parts: Part[] }): void {
    stmts.upsertCache.run({
      setNum,
      setName: data.setName,
      setImgUrl: data.setImgUrl,
      parts: JSON.stringify(data.parts),
    });
  },
};
