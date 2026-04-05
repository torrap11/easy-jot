const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

let db;

function getDb() {
  if (db) return db;
  const dbPath = path.join(app.getPath('userData'), 'easy-jot.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  // Safe migration: add description to folders if it doesn't exist yet
  const folderCols = db.pragma('table_info(folders)').map(c => c.name);
  if (!folderCols.includes('description')) {
    db.exec('ALTER TABLE folders ADD COLUMN description TEXT');
  }
  // Safe migration: add folder_id to notes if it doesn't exist yet
  const cols = db.pragma('table_info(notes)').map(c => c.name);
  if (!cols.includes('folder_id')) {
    db.exec('ALTER TABLE notes ADD COLUMN folder_id INTEGER REFERENCES folders(id)');
  }
  if (!cols.includes('context_snoozed_until')) {
    db.exec('ALTER TABLE notes ADD COLUMN context_snoozed_until TEXT');
  }
  if (!cols.includes('context_no_auto_surface')) {
    db.exec('ALTER TABLE notes ADD COLUMN context_no_auto_surface INTEGER NOT NULL DEFAULT 0');
  }

  // Intent memories table for voice-triggered context memory
  db.exec(`
    CREATE TABLE IF NOT EXISTS intent_memories (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      content    TEXT NOT NULL,
      trigger    TEXT NOT NULL DEFAULT 'general',
      category   TEXT NOT NULL DEFAULT 'other',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      note_id    INTEGER,
      embedding  TEXT
    )
  `);
  // Safe migrations: add lifecycle columns for snooze/done/cooldown
  const memoryCols = db.pragma('table_info(intent_memories)').map(c => c.name);
  if (!memoryCols.includes('snoozed_until')) {
    db.exec('ALTER TABLE intent_memories ADD COLUMN snoozed_until TEXT');
  }
  if (!memoryCols.includes('done')) {
    db.exec('ALTER TABLE intent_memories ADD COLUMN done INTEGER NOT NULL DEFAULT 0');
  }
  if (!memoryCols.includes('last_auto_shown_at')) {
    db.exec('ALTER TABLE intent_memories ADD COLUMN last_auto_shown_at TEXT');
  }

  // Scheduled reminders table for time-based spoken reminders
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_reminders (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      content           TEXT NOT NULL,
      schedule_type     TEXT NOT NULL DEFAULT 'once',
      scheduled_time    TEXT NOT NULL,
      active            INTEGER NOT NULL DEFAULT 1,
      last_triggered_at TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  const reminderCols = db.pragma('table_info(scheduled_reminders)').map(c => c.name);
  if (!reminderCols.includes('note_content')) {
    db.exec('ALTER TABLE scheduled_reminders ADD COLUMN note_content TEXT');
  }

  return db;
}

function getAllNotes(folderId) {
  if (folderId === undefined) {
    return getDb().prepare('SELECT * FROM notes ORDER BY updated_at DESC').all();
  }
  if (folderId === null) {
    return getDb().prepare('SELECT * FROM notes WHERE folder_id IS NULL ORDER BY updated_at DESC').all();
  }
  return getDb().prepare('SELECT * FROM notes WHERE folder_id = ? ORDER BY updated_at DESC').all(folderId);
}

function createNote(content = '') {
  const stmt = getDb().prepare('INSERT INTO notes (content) VALUES (?)');
  const result = stmt.run(content);
  return getDb().prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid);
}

function updateNote(id, content) {
  getDb().prepare("UPDATE notes SET content = ?, updated_at = datetime('now') WHERE id = ?").run(content, id);
  return getDb().prepare('SELECT * FROM notes WHERE id = ?').get(id);
}

/** Snooze a note from workflow auto-surface (keyword matches) for N minutes. */
function snoozeNoteContextSurface(id, minutes = 30) {
  const until = new Date(Date.now() + Number(minutes) * 60_000).toISOString();
  getDb().prepare('UPDATE notes SET context_snoozed_until = ?, updated_at = datetime(\'now\') WHERE id = ?').run(until, id);
}

/** Stop auto-surfacing this note on context triggers (manual preview still shows it). */
function markNoteContextSurfaceDone(id) {
  getDb()
    .prepare(
      "UPDATE notes SET context_no_auto_surface = 1, context_snoozed_until = NULL, updated_at = datetime('now') WHERE id = ?",
    )
    .run(id);
}

/** True if this note may appear on automatic workflow triggers. */
function noteEligibleForAutoContextSurface(n) {
  if (n.context_no_auto_surface) return false;
  if (n.context_snoozed_until) {
    const until = new Date(n.context_snoozed_until);
    if (!Number.isNaN(until.getTime()) && until > new Date()) return false;
  }
  return true;
}

function deleteNote(id) {
  getDb().prepare('DELETE FROM notes WHERE id = ?').run(id);
}

function restoreNote(note) {
  getDb()
    .prepare(
      'INSERT INTO notes (id, content, folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    )
    .run(note.id, note.content, note.folder_id ?? null, note.created_at, note.updated_at);
}

function createFolder(name, description = '') {
  const stmt = getDb().prepare('INSERT INTO folders (name, description) VALUES (?, ?)');
  const result = stmt.run(name, description || null);
  return getDb().prepare('SELECT * FROM folders WHERE id = ?').get(result.lastInsertRowid);
}

function updateFolder(id, name, description) {
  getDb()
    .prepare('UPDATE folders SET name = ?, description = ? WHERE id = ?')
    .run(name, description || null, id);
  return getDb().prepare('SELECT * FROM folders WHERE id = ?').get(id);
}

function getAllFolders() {
  return getDb().prepare('SELECT * FROM folders ORDER BY name ASC').all();
}

function updateNoteFolder(noteId, folderId) {
  getDb()
    .prepare("UPDATE notes SET folder_id = ?, updated_at = datetime('now') WHERE id = ?")
    .run(folderId, noteId);
}

function getNotesByFolder(folderId) {
  return getAllNotes(folderId);
}

// ── Intent Memory helpers ──────────────────────────────────────────────────

/**
 * Persist a structured intent memory.
 * @param {{ content: string, trigger: string, category: string, note_id?: number }} data
 */
function createIntentMemory({ content, trigger = 'general', category = 'other', note_id = null }) {
  const stmt = getDb().prepare(
    'INSERT INTO intent_memories (content, trigger, category, note_id) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(content, trigger, category, note_id);
  return getDb().prepare('SELECT * FROM intent_memories WHERE id = ?').get(result.lastInsertRowid);
}

/**
 * Retrieve all memories that match a given trigger ID.
 * @param {string} trigger
 */
function getIntentMemoriesByTrigger(trigger) {
  return getDb()
    .prepare('SELECT * FROM intent_memories WHERE trigger = ? ORDER BY created_at DESC')
    .all(trigger);
}

/**
 * Full-text search across all memory content (case-insensitive).
 * @param {string} query
 */
function searchIntentMemories(query) {
  const q = `%${(query || '').toLowerCase()}%`;
  return getDb()
    .prepare('SELECT * FROM intent_memories WHERE lower(content) LIKE ? ORDER BY created_at DESC')
    .all(q);
}

/** Return all intent memories, newest first. */
function getAllIntentMemories() {
  return getDb().prepare('SELECT * FROM intent_memories ORDER BY created_at DESC').all();
}

/** Delete a single intent memory by id. */
function deleteIntentMemory(id) {
  getDb().prepare('DELETE FROM intent_memories WHERE id = ?').run(id);
}

/**
 * Return memories for a trigger filtered for auto-surface:
 * excludes done=1 and currently snoozed memories.
 */
function getIntentMemoriesByTriggerFiltered(trigger) {
  return getDb()
    .prepare(`SELECT * FROM intent_memories
              WHERE trigger = ?
                AND (done IS NULL OR done = 0)
                AND (snoozed_until IS NULL OR snoozed_until <= datetime('now'))
              ORDER BY created_at DESC`)
    .all(trigger);
}

/** Snooze a memory: set snoozed_until = now + N minutes. */
function snoozeMemory(id, minutes = 30) {
  getDb()
    .prepare(`UPDATE intent_memories SET snoozed_until = datetime('now', '+${Number(minutes)} minutes') WHERE id = ?`)
    .run(id);
}

/** Permanently suppress a memory from auto-surface. */
function markMemoryDone(id) {
  getDb().prepare('UPDATE intent_memories SET done = 1 WHERE id = ?').run(id);
}

/** Record that this memory was auto-surfaced (for cooldown tracking). */
function markMemoryAutoShown(id) {
  getDb().prepare("UPDATE intent_memories SET last_auto_shown_at = datetime('now') WHERE id = ?").run(id);
}

// ── Scheduled Reminder helpers ─────────────────────────────────────────────

/**
 * Create a new scheduled reminder.
 * @param {{ content: string, scheduleType: 'once'|'daily', scheduledTime: string, noteContent?: string }} data
 */
function createScheduledReminder({ content, scheduleType = 'once', scheduledTime, noteContent = null }) {
  const stmt = getDb().prepare(
    'INSERT INTO scheduled_reminders (content, schedule_type, scheduled_time, note_content) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(content, scheduleType, scheduledTime, noteContent || null);
  return getDb().prepare('SELECT * FROM scheduled_reminders WHERE id = ?').get(result.lastInsertRowid);
}

/** Return all active reminders (active = 1). */
function getActiveReminders() {
  return getDb().prepare('SELECT * FROM scheduled_reminders WHERE active = 1').all();
}

/** Return all reminders, newest first. */
function getAllScheduledReminders() {
  return getDb().prepare('SELECT * FROM scheduled_reminders ORDER BY created_at DESC').all();
}

/** Delete a scheduled reminder by id. */
function deleteScheduledReminder(id) {
  getDb().prepare('DELETE FROM scheduled_reminders WHERE id = ?').run(id);
}

/** Mark a reminder as triggered (set last_triggered_at to now). */
function markReminderTriggered(id) {
  getDb()
    .prepare("UPDATE scheduled_reminders SET last_triggered_at = datetime('now') WHERE id = ?")
    .run(id);
}

/** Deactivate a reminder (active = 0). Used for stale once-reminders. */
function deactivateReminder(id) {
  getDb().prepare('UPDATE scheduled_reminders SET active = 0 WHERE id = ?').run(id);
}

/** Reactivate a reminder (active = 1). */
function activateReminder(id) {
  getDb().prepare('UPDATE scheduled_reminders SET active = 1 WHERE id = ?').run(id);
}

module.exports = {
  getAllNotes, createNote, updateNote, deleteNote, restoreNote,
  snoozeNoteContextSurface, markNoteContextSurfaceDone, noteEligibleForAutoContextSurface,
  createFolder, updateFolder, getAllFolders, updateNoteFolder, getNotesByFolder,
  createIntentMemory, getIntentMemoriesByTrigger, getIntentMemoriesByTriggerFiltered,
  searchIntentMemories, getAllIntentMemories, deleteIntentMemory,
  snoozeMemory, markMemoryDone, markMemoryAutoShown,
  createScheduledReminder, getActiveReminders, getAllScheduledReminders,
  deleteScheduledReminder, markReminderTriggered, deactivateReminder, activateReminder,
};
