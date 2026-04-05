'use strict';
/**
 * test-keybinds.js
 * Tests: keybinds registry — Cmd+M present, Cmd+Shift+J absent,
 *        expected in-app shortcuts defined.
 */
const { test } = require('node:test');
const assert   = require('node:assert/strict');

const keybinds = require('../keybinds');

// ── Structure ─────────────────────────────────────────────────────────────

test('keybinds exports global and inApp arrays', () => {
  assert.ok(Array.isArray(keybinds.global), 'global should be an array');
  assert.ok(Array.isArray(keybinds.inApp),  'inApp should be an array');
});

// ── Global shortcuts ──────────────────────────────────────────────────────

test('Cmd+E is in global shortcuts (toggle window)', () => {
  assert.ok(keybinds.global.some(s => s.keys === 'Cmd+E'));
});

test('Cmd+M is in global shortcuts (universal voice command)', () => {
  const entry = keybinds.global.find(s => s.keys === 'Cmd+M');
  assert.ok(entry, 'Cmd+M must be registered');
  assert.ok(
    /\bspeak\b|\bjot\b|\bagent\b/i.test(entry.action),
    'Cmd+M action should describe speak / jot / agent',
  );
});

test('Cmd+Shift+N is NOT in any shortcut list (removed quick jot)', () => {
  const all = [...keybinds.global, ...keybinds.inApp];
  assert.ok(
    !all.some(s => s.keys === 'Cmd+Shift+N'),
    'Cmd+Shift+N should not be registered',
  );
});

test('Cmd+Shift+J is NOT in any shortcut list (removed)', () => {
  const all = [...keybinds.global, ...keybinds.inApp];
  assert.ok(
    !all.some(s => s.keys === 'Cmd+Shift+J'),
    'Cmd+Shift+J should have been removed',
  );
});

// ── In-app shortcuts ──────────────────────────────────────────────────────

test('Cmd+J is in inApp shortcuts (switch panel focus)', () => {
  assert.ok(keybinds.inApp.some(s => s.keys === 'Cmd+J'));
});

test('Cmd+N is in inApp shortcuts (new note)', () => {
  assert.ok(keybinds.inApp.some(s => s.keys === 'Cmd+N'));
});

test('Escape is in inApp shortcuts', () => {
  assert.ok(keybinds.inApp.some(s => s.keys === 'Escape'));
});

test('Cmd+Z is in inApp shortcuts (undo delete)', () => {
  assert.ok(keybinds.inApp.some(s => s.keys === 'Cmd+Z'));
});

// ── No duplicates ─────────────────────────────────────────────────────────

test('no duplicate keys within global shortcuts', () => {
  const keys = keybinds.global.map(s => s.keys);
  const unique = new Set(keys);
  assert.equal(unique.size, keys.length, 'duplicate global shortcut detected');
});

test('no duplicate keys within inApp shortcuts', () => {
  const keys = keybinds.inApp.map(s => s.keys);
  const unique = new Set(keys);
  assert.equal(unique.size, keys.length, 'duplicate inApp shortcut detected');
});

// ── Every entry has keys and action ──────────────────────────────────────

test('every shortcut entry has non-empty keys and action', () => {
  const all = [...keybinds.global, ...keybinds.inApp];
  for (const entry of all) {
    assert.ok(typeof entry.keys === 'string' && entry.keys.length > 0,
      `shortcut missing keys: ${JSON.stringify(entry)}`);
    assert.ok(typeof entry.action === 'string' && entry.action.length > 0,
      `shortcut missing action: ${JSON.stringify(entry)}`);
  }
});
