'use strict';
/**
 * test-executor.js
 * Tests: executeActions — valid/invalid types, search, create_note,
 *        create_folder, move_note_to_folder, organize_into_folders,
 *        web_search (mocked fetch), reminders.
 *
 * Uses a lightweight in-memory mock db (no SQLite, no electron required).
 */
const { test, before } = require('node:test');
const assert = require('node:assert/strict');

const { executeActions } = require('../intelligence/executor');

// ── In-memory mock db ─────────────────────────────────────────────────────

let _notes     = [];
let _folders   = [];
let _reminders = [];
let _noteId    = 0;
let _folderId  = 0;
let _remId     = 0;

const mockDb = {
  getAllNotes:      () => [..._notes],
  createNote:      (content) => { const n = { id: ++_noteId, content }; _notes.push(n); return n; },
  getAllFolders:    () => [..._folders],
  createFolder:    (name) => { const f = { id: ++_folderId, name }; _folders.push(f); return f; },
  updateNoteFolder:(noteId, folderId) => {
    const n = _notes.find(n => n.id === noteId);
    if (n) n.folder_id = folderId;
  },
  // Reminders — deep-copy rows so snapshots aren't mutated by activate/deactivate
  getAllScheduledReminders: () => _reminders.map(r => ({ ...r })),
  deleteScheduledReminder:  (id) => { _reminders = _reminders.filter(r => r.id !== id); },
  activateReminder:  (id) => { const r = _reminders.find(r => r.id === id); if (r) r.active = 1; },
  deactivateReminder:(id) => { const r = _reminders.find(r => r.id === id); if (r) r.active = 0; },
  // Test helpers (not on real db interface)
  _addReminder:(content, active = 1) => { const r = { id: ++_remId, content, active, schedule_type: 'once', scheduled_time: '2099-01-01T10:00:00.000Z' }; _reminders.push(r); return r; },
};

before(() => {
  _notes     = [];
  _folders   = [];
  _reminders = [];
  _noteId    = 0;
  _folderId  = 0;
  _remId     = 0;
});

// ── Empty / no-op ─────────────────────────────────────────────────────────

test('executeActions: empty array → success with no results', async () => {
  const r = await executeActions([], mockDb);
  assert.equal(r.success, true);
  assert.deepEqual(r.results, []);
  assert.deepEqual(r.errors,  []);
});

test('executeActions: null → success with no results', async () => {
  const r = await executeActions(null, mockDb);
  assert.equal(r.success, true);
});

// ── Unknown action type ───────────────────────────────────────────────────

test('executeActions: unknown type → error, success=false', async () => {
  const r = await executeActions([{ type: 'fly_spaceship', payload: {} }], mockDb);
  assert.equal(r.success, false);
  assert.equal(r.errors.length, 1);
  assert.ok(r.errors[0].error.includes('Unknown action type'));
});

// ── create_note ───────────────────────────────────────────────────────────

test('create_note: creates a note and returns it', async () => {
  const r = await executeActions([
    { type: 'create_note', payload: { content: 'executor test note' } },
  ], mockDb);
  assert.equal(r.success, true);
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].result.content, 'executor test note');
  assert.ok(r.results[0].result.id > 0);
});

// ── search ────────────────────────────────────────────────────────────────

test('search: finds matching notes by substring', async () => {
  // Seed some notes
  mockDb.createNote('meeting agenda for Monday');
  mockDb.createNote('grocery list for weekend');
  mockDb.createNote('meeting prep for Tuesday');

  const r = await executeActions([
    { type: 'search', payload: { query: 'meeting' } },
  ], mockDb);
  assert.equal(r.success, true);
  assert.ok(r.results[0].result.count >= 2);
});

test('search: returns empty for no match', async () => {
  const r = await executeActions([
    { type: 'search', payload: { query: 'zzz_no_match_zzz' } },
  ], mockDb);
  assert.equal(r.success, true);
  assert.equal(r.results[0].result.count, 0);
});

test('search: skips image data URIs', async () => {
  mockDb.createNote('data:image/png;base64,abc123');
  const r = await executeActions([
    { type: 'search', payload: { query: 'abc123' } },
  ], mockDb);
  assert.equal(r.results[0].result.count, 0, 'images should be excluded from search');
});

// ── create_folder ─────────────────────────────────────────────────────────

test('create_folder: creates a folder', async () => {
  const r = await executeActions([
    { type: 'create_folder', payload: { name: 'Work' } },
  ], mockDb);
  assert.equal(r.success, true);
  assert.equal(r.results[0].result.name, 'Work');
});

// ── move_note_to_folder ───────────────────────────────────────────────────

test('move_note_to_folder: assigns folder to note', async () => {
  const note   = mockDb.createNote('movable note');
  const folder = mockDb.createFolder('Inbox');
  const r = await executeActions([
    { type: 'move_note_to_folder', payload: { noteId: note.id, folderId: folder.id } },
  ], mockDb);
  assert.equal(r.success, true);
  const updated = mockDb.getAllNotes().find(n => n.id === note.id);
  assert.equal(updated.folder_id, folder.id);
});

test('move_note_to_folder: null folderId removes from folder', async () => {
  const note = mockDb.createNote('unassigned note');
  note.folder_id = 99;
  const r = await executeActions([
    { type: 'move_note_to_folder', payload: { noteId: note.id, folderId: null } },
  ], mockDb);
  assert.equal(r.success, true);
  const updated = mockDb.getAllNotes().find(n => n.id === note.id);
  assert.equal(updated.folder_id, null);
});

// ── organize_into_folders ─────────────────────────────────────────────────

test('organize_into_folders: creates folders and moves notes', async () => {
  const n1 = mockDb.createNote('work project A');
  const n2 = mockDb.createNote('personal diary');

  const r = await executeActions([{
    type: 'organize_into_folders',
    payload: [
      { folderName: 'Work',     noteIds: [n1.id] },
      { folderName: 'Personal', noteIds: [n2.id] },
    ],
  }], mockDb);
  assert.equal(r.success, true);
  assert.equal(r.results[0].result.length, 2);

  const updated1 = mockDb.getAllNotes().find(n => n.id === n1.id);
  const updated2 = mockDb.getAllNotes().find(n => n.id === n2.id);
  assert.ok(updated1.folder_id > 0);
  assert.ok(updated2.folder_id > 0);
  assert.notEqual(updated1.folder_id, updated2.folder_id);
});

test('organize_into_folders: reuses existing folder (case-insensitive)', async () => {
  const existing = mockDb.createFolder('Archive');
  const note = mockDb.createNote('old note');
  const foldersBefore = mockDb.getAllFolders().length;

  await executeActions([{
    type: 'organize_into_folders',
    payload: [{ folderName: 'archive', noteIds: [note.id] }],
  }], mockDb);

  // Should NOT have created a new folder
  assert.equal(mockDb.getAllFolders().length, foldersBefore);
  const updated = mockDb.getAllNotes().find(n => n.id === note.id);
  assert.equal(updated.folder_id, existing.id);
});

// ── web_search ────────────────────────────────────────────────────────────

test('web_search: returns query in result', async () => {
  // Override global fetch to return a mock response
  const originalFetch = global.fetch;
  global.fetch = async (url) => ({
    json: async () => ({
      Abstract: 'Node.js is a JavaScript runtime built on Chrome\'s V8 engine.',
    }),
  });

  try {
    const r = await executeActions([
      { type: 'web_search', payload: { query: 'what is nodejs' } },
    ], mockDb);
    assert.equal(r.success, true);
    assert.equal(r.results[0].result.query, 'what is nodejs');
    assert.ok(r.results[0].result.snippet.includes('Node'));
  } finally {
    global.fetch = originalFetch;
  }
});

test('web_search: empty query returns no-query message', async () => {
  const r = await executeActions([
    { type: 'web_search', payload: { query: '' } },
  ], mockDb);
  assert.equal(r.success, true);
  assert.ok(r.results[0].result.snippet.includes('No query'));
});

test('web_search: handles fetch error gracefully', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('network timeout'); };

  try {
    const r = await executeActions([
      { type: 'web_search', payload: { query: 'fail test' } },
    ], mockDb);
    assert.equal(r.success, true); // web_search errors go into snippet, not errors[]
    assert.ok(r.results[0].result.snippet.includes('Search failed'));
  } finally {
    global.fetch = originalFetch;
  }
});

// ── Multiple actions in one call ──────────────────────────────────────────

test('multiple actions: mixed success and failure', async () => {
  const r = await executeActions([
    { type: 'create_note',   payload: { content: 'batch note' } },
    { type: 'bad_action',    payload: {} },
    { type: 'create_folder', payload: { name: 'Batch Folder' } },
  ], mockDb);

  assert.equal(r.success, false);          // one error
  assert.equal(r.results.length, 2);       // two successes
  assert.equal(r.errors.length,  1);       // one failure
  assert.equal(r.errors[0].type, 'bad_action');
});

// ── Scheduled reminder actions ────────────────────────────────────────────

test('list_reminders: returns all reminders', async () => {
  mockDb._addReminder('daily standup');
  const r = await executeActions([
    { type: 'list_reminders', payload: {} },
  ], mockDb);
  assert.equal(r.success, true);
  assert.ok(r.results[0].result.count >= 1);
});

test('search_reminders: filters by content', async () => {
  mockDb._addReminder('call the dentist at 3pm');
  const r = await executeActions([
    { type: 'search_reminders', payload: { query: 'dentist' } },
  ], mockDb);
  assert.equal(r.success, true);
  assert.ok(r.results[0].result.reminders.some(r => r.content.includes('dentist')));
});

test('toggle_reminder: deactivates active reminder', async () => {
  const rem = mockDb._addReminder('active reminder', 1);
  const r = await executeActions([
    { type: 'toggle_reminder', payload: { id: rem.id } },
  ], mockDb);
  assert.equal(r.success, true);
  assert.equal(r.results[0].result.active, false);
  const updated = mockDb.getAllScheduledReminders().find(r => r.id === rem.id);
  assert.equal(updated.active, 0);
});

test('toggle_reminder: activates inactive reminder', async () => {
  const rem = mockDb._addReminder('paused reminder', 0);
  const r = await executeActions([
    { type: 'toggle_reminder', payload: { id: rem.id } },
  ], mockDb);
  assert.equal(r.success, true);
  assert.equal(r.results[0].result.active, true);
});

test('delete_reminder: removes by id', async () => {
  const rem = mockDb._addReminder('reminder to delete');
  const countBefore = mockDb.getAllScheduledReminders().length;
  const r = await executeActions([
    { type: 'delete_reminder', payload: { id: rem.id } },
  ], mockDb);
  assert.equal(r.success, true);
  assert.equal(mockDb.getAllScheduledReminders().length, countBefore - 1);
});
