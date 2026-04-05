'use strict';
/**
 * test-database.js
 * Tests: notes CRUD, trigger memories, scheduled reminders — against a temp SQLite DB.
 * Mocks electron's app.getPath so database.js can run outside Electron.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os     = require('node:os');
const path   = require('node:path');
const fs     = require('node:fs');

// ── Mock electron before requiring database.js ────────────────────────────

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jot-test-'));

const Module = require('node:module');
const _origLoad = Module._load.bind(Module);
Module._load = function (request, parent, isMain) {
  if (request === 'electron') {
    return { app: { getPath: () => tmpDir } };
  }
  return _origLoad(request, parent, isMain);
};

const db = require('../database');

after(() => {
  // Clean up temp DB after tests
  try { fs.rmSync(tmpDir, { recursive: true }); } catch (_) {}
});

// ── Notes CRUD ────────────────────────────────────────────────────────────

test('createNote: creates a note and returns it', () => {
  const note = db.createNote('Hello world');
  assert.ok(note.id > 0);
  assert.equal(note.content, 'Hello world');
  assert.ok(note.created_at);
});

test('getAllNotes: returns created notes', () => {
  db.createNote('Note A');
  db.createNote('Note B');
  const notes = db.getAllNotes();
  assert.ok(notes.length >= 2);
});

test('updateNote: changes content', () => {
  const note = db.createNote('original');
  const updated = db.updateNote(note.id, 'updated');
  assert.equal(updated.content, 'updated');
});

test('deleteNote: removes the note', () => {
  const note = db.createNote('to delete');
  db.deleteNote(note.id);
  const all = db.getAllNotes();
  assert.ok(!all.find(n => n.id === note.id));
});

test('restoreNote: puts a deleted note back', () => {
  const note = db.createNote('restore me');
  db.deleteNote(note.id);
  db.restoreNote(note);
  const all = db.getAllNotes();
  assert.ok(all.find(n => n.id === note.id));
});

// ── Folders ───────────────────────────────────────────────────────────────

test('createFolder and getAllFolders', () => {
  const folder = db.createFolder('Work', 'Work related notes');
  assert.ok(folder.id > 0);
  assert.equal(folder.name, 'Work');
  const all = db.getAllFolders();
  assert.ok(all.find(f => f.id === folder.id));
});

test('updateNoteFolder: moves note into folder', () => {
  const note   = db.createNote('folder test');
  const folder = db.createFolder('Test Folder');
  db.updateNoteFolder(note.id, folder.id);
  const byFolder = db.getNotesByFolder(folder.id);
  assert.ok(byFolder.find(n => n.id === note.id));
});

// ── Intent memories (trigger jots) ───────────────────────────────────────

test('createIntentMemory: creates and returns a memory', () => {
  const mem = db.createIntentMemory({
    content:  "Listen to Kanye's new album",
    trigger:  'spotify_open',
    category: 'entertainment',
  });
  assert.ok(mem.id > 0);
  assert.equal(mem.trigger, 'spotify_open');
  assert.equal(mem.category, 'entertainment');
});

test('getIntentMemoriesByTrigger: returns only matching trigger', () => {
  db.createIntentMemory({ content: 'Spotify memory 1', trigger: 'spotify_open', category: 'entertainment' });
  db.createIntentMemory({ content: 'Netflix memory',   trigger: 'netflix_open', category: 'entertainment' });
  const spotify = db.getIntentMemoriesByTrigger('spotify_open');
  assert.ok(spotify.length >= 1);
  assert.ok(spotify.every(m => m.trigger === 'spotify_open'));
});

test('getIntentMemoriesByTrigger: returns empty array for unknown trigger', () => {
  const result = db.getIntentMemoriesByTrigger('nonexistent_trigger_xyz');
  assert.deepEqual(result, []);
});

test('getAllIntentMemories: returns all memories', () => {
  const before = db.getAllIntentMemories().length;
  db.createIntentMemory({ content: 'extra memory', trigger: 'general', category: 'other' });
  assert.equal(db.getAllIntentMemories().length, before + 1);
});

test('deleteIntentMemory: removes the memory', () => {
  const mem = db.createIntentMemory({ content: 'delete me', trigger: 'general', category: 'other' });
  db.deleteIntentMemory(mem.id);
  const all = db.getAllIntentMemories();
  assert.ok(!all.find(m => m.id === mem.id));
});

test('searchIntentMemories: finds by content substring', () => {
  db.createIntentMemory({ content: 'unique_xyz_search_term', trigger: 'general', category: 'other' });
  const results = db.searchIntentMemories('unique_xyz_search_term');
  assert.ok(results.length >= 1);
});

// ── Scheduled reminders ───────────────────────────────────────────────────

test('createScheduledReminder: creates and returns a reminder', () => {
  const rem = db.createScheduledReminder({
    content:       'Take medication',
    scheduleType:  'daily',
    scheduledTime: '09:00',
  });
  assert.ok(rem.id > 0);
  assert.equal(rem.schedule_type, 'daily');
  assert.equal(rem.scheduled_time, '09:00');
  assert.equal(rem.active, 1);
  assert.equal(rem.last_triggered_at, null);
});

test('getActiveReminders: only returns active reminders', () => {
  const rem = db.createScheduledReminder({
    content: 'active one', scheduleType: 'once',
    scheduledTime: new Date(Date.now() + 60_000).toISOString(),
  });
  db.deactivateReminder(rem.id);
  const active = db.getActiveReminders();
  assert.ok(!active.find(r => r.id === rem.id));
});

test('markReminderTriggered: sets last_triggered_at', () => {
  const rem = db.createScheduledReminder({
    content: 'trigger test', scheduleType: 'once',
    scheduledTime: new Date(Date.now() + 60_000).toISOString(),
  });
  db.markReminderTriggered(rem.id);
  const all = db.getAllScheduledReminders();
  const updated = all.find(r => r.id === rem.id);
  assert.ok(updated.last_triggered_at);
});

test('activateReminder: toggles reminder back to active', () => {
  const rem = db.createScheduledReminder({
    content: 'toggle test', scheduleType: 'daily', scheduledTime: '20:00',
  });
  db.deactivateReminder(rem.id);
  db.activateReminder(rem.id);
  const all = db.getActiveReminders();
  assert.ok(all.find(r => r.id === rem.id));
});

test('deleteScheduledReminder: removes it', () => {
  const rem = db.createScheduledReminder({
    content: 'delete me', scheduleType: 'daily', scheduledTime: '23:00',
  });
  db.deleteScheduledReminder(rem.id);
  const all = db.getAllScheduledReminders();
  assert.ok(!all.find(r => r.id === rem.id));
});

// ── Intent memory lifecycle (snooze / done / cooldown) ────────────────────

test('snoozeMemory: sets snoozed_until in the future', () => {
  const mem = db.createIntentMemory({ content: 'snooze test', trigger: 'general' });
  db.snoozeMemory(mem.id, 30);
  const all = db.getAllIntentMemories();
  const updated = all.find(m => m.id === mem.id);
  assert.ok(updated.snoozed_until, 'snoozed_until should be set');
  assert.ok(new Date(updated.snoozed_until) > new Date(), 'snoozed_until should be in the future');
});

test('markMemoryDone: sets done = 1', () => {
  const mem = db.createIntentMemory({ content: 'done test', trigger: 'general' });
  db.markMemoryDone(mem.id);
  const all = db.getAllIntentMemories();
  const updated = all.find(m => m.id === mem.id);
  assert.equal(updated.done, 1);
});

test('markMemoryAutoShown: sets last_auto_shown_at', () => {
  const mem = db.createIntentMemory({ content: 'shown test', trigger: 'general' });
  db.markMemoryAutoShown(mem.id);
  const all = db.getAllIntentMemories();
  const updated = all.find(m => m.id === mem.id);
  assert.ok(updated.last_auto_shown_at, 'last_auto_shown_at should be set');
});

test('getIntentMemoriesByTriggerFiltered: excludes done memories', () => {
  const mem = db.createIntentMemory({ content: 'filtered done', trigger: 'netflix_open' });
  db.markMemoryDone(mem.id);
  const filtered = db.getIntentMemoriesByTriggerFiltered('netflix_open');
  assert.ok(!filtered.find(m => m.id === mem.id), 'done memory should be excluded');
});

test('getIntentMemoriesByTriggerFiltered: excludes currently snoozed memories', () => {
  const mem = db.createIntentMemory({ content: 'filtered snooze', trigger: 'spotify_open' });
  db.snoozeMemory(mem.id, 60);
  const filtered = db.getIntentMemoriesByTriggerFiltered('spotify_open');
  assert.ok(!filtered.find(m => m.id === mem.id), 'snoozed memory should be excluded');
});

test('getIntentMemoriesByTriggerFiltered: includes non-done non-snoozed memories', () => {
  const mem = db.createIntentMemory({ content: 'visible memory', trigger: 'work_start' });
  const filtered = db.getIntentMemoriesByTriggerFiltered('work_start');
  assert.ok(filtered.find(m => m.id === mem.id), 'visible memory should be included');
});
