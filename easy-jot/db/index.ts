import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { EntryType } from '../services/classifier.js';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3') as typeof import('better-sqlite3');

export type Row = {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
  type: string;
  embedding: string | null;
  remind_at: string | null;
};

let db: InstanceType<typeof Database> | null = null;

function migrate(): void {
  if (!db) return;
  const info = db.prepare(`PRAGMA table_info(entries)`).all() as Array<{ name: string }>;
  const names = new Set(info.map((c) => c.name));
  if (!names.has('remind_at')) {
    db.exec(`ALTER TABLE entries ADD COLUMN remind_at DATETIME;`);
  }
}

export function initDb(dbFilePath: string): void {
  const dir = path.dirname(dbFilePath);
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(dbFilePath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      content TEXT,
      created_at DATETIME,
      updated_at DATETIME,
      type TEXT,
      embedding TEXT
    );
  `);
  migrate();
}

export function insertEntry(
  id: string,
  content: string,
  type: EntryType,
  now: string,
  remindAt: string | null,
): void {
  if (!db) throw new Error('DB not initialized');
  db.prepare(
    `INSERT INTO entries (id, content, created_at, updated_at, type, embedding, remind_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?)`,
  ).run(id, content, now, now, type, remindAt);
}

export function updateEntryMeta(
  id: string,
  type: EntryType,
  embeddingJson: string,
  updatedAt: string,
): void {
  if (!db) throw new Error('DB not initialized');
  db.prepare(
    `UPDATE entries SET type = ?, embedding = ?, updated_at = ? WHERE id = ?`,
  ).run(type, embeddingJson, updatedAt, id);
}

export function getAllEntries(): Row[] {
  if (!db) throw new Error('DB not initialized');
  return db
    .prepare(`SELECT id, content, created_at, updated_at, type, embedding, remind_at FROM entries`)
    .all() as Row[];
}

export function getDueReminders(nowIso: string): Row[] {
  if (!db) throw new Error('DB not initialized');
  return db
    .prepare(
      `SELECT id, content, created_at, updated_at, type, embedding, remind_at FROM entries
       WHERE remind_at IS NOT NULL AND remind_at <= ?`,
    )
    .all(nowIso) as Row[];
}

export function clearRemindAt(id: string): void {
  if (!db) throw new Error('DB not initialized');
  db.prepare(`UPDATE entries SET remind_at = NULL, updated_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    id,
  );
}
