'use strict';
/**
 * test-trigger-engine.js
 * Tests: trigger normalization, label/icon lookup, spotify_open support,
 *        trigger → memory retrieval accuracy.
 */
const { test } = require('node:test');
const assert   = require('node:assert/strict');

const {
  TRIGGER_LABELS, TRIGGER_ICONS,
  normalizeTrigger, getTriggerLabel, getTriggerIcon, ALL_TRIGGERS,
} = require('../triggerEngine');

// ── Trigger registry ──────────────────────────────────────────────────────

test('all expected triggers are defined', () => {
  const expected = ['netflix_open', 'spotify_open', 'work_start', 'linkedin_open', 'gmail_open', 'general'];
  for (const id of expected) {
    assert.ok(TRIGGER_LABELS[id], `Missing label for ${id}`);
    assert.ok(TRIGGER_ICONS[id],  `Missing icon for ${id}`);
  }
});

test('work_start label is Work', () => {
  assert.equal(getTriggerLabel('work_start'), 'Work');
});

test('linkedin_open and gmail_open are in ALL_TRIGGERS', () => {
  assert.ok(ALL_TRIGGERS.includes('linkedin_open'));
  assert.ok(ALL_TRIGGERS.includes('gmail_open'));
  assert.ok(ALL_TRIGGERS.includes('work_start'));
});

test('spotify_open label is Spotify', () => {
  assert.equal(getTriggerLabel('spotify_open'), 'Spotify');
});

test('spotify_open icon is 🎵', () => {
  assert.equal(getTriggerIcon('spotify_open'), '🎵');
});

test('ALL_TRIGGERS includes spotify_open', () => {
  assert.ok(ALL_TRIGGERS.includes('spotify_open'));
});

// ── normalizeTrigger ──────────────────────────────────────────────────────

test('normalizeTrigger: exact ID passthrough', () => {
  assert.equal(normalizeTrigger('netflix_open'), 'netflix_open');
  assert.equal(normalizeTrigger('spotify_open'), 'spotify_open');
});

test('normalizeTrigger: display label (case-insensitive)', () => {
  assert.equal(normalizeTrigger('Netflix'), 'netflix_open');
  assert.equal(normalizeTrigger('spotify'), 'spotify_open');
});

test('normalizeTrigger: root word partial match', () => {
  assert.equal(normalizeTrigger('netflix'), 'netflix_open');
});

test('normalizeTrigger: unknown trigger returns as-is', () => {
  assert.equal(normalizeTrigger('unknown_app'), 'unknown_app');
});

test('normalizeTrigger: empty string', () => {
  assert.equal(normalizeTrigger(''), '');
});

// ── getTriggerLabel / getTriggerIcon fallbacks ────────────────────────────

test('getTriggerLabel falls back to raw ID for unknown triggers', () => {
  assert.equal(getTriggerLabel('some_unknown'), 'some_unknown');
});

test('getTriggerIcon falls back to 💡 for unknown triggers', () => {
  assert.equal(getTriggerIcon('some_unknown'), '💡');
});

// ── BUG-8: word boundary fix ──────────────────────────────────────────────

test('BUG-8: "homework" should NOT match work_start', () => {
  // Before the fix, "homework".includes("work") → true → returned work_start
  assert.notEqual(normalizeTrigger('homework'), 'work_start');
});

test('BUG-8: "working" should NOT match work_start', () => {
  assert.notEqual(normalizeTrigger('working on netflix'), 'work_start');
});

test('BUG-8: "work" (exact word) SHOULD match work_start', () => {
  assert.equal(normalizeTrigger('work'), 'work_start');
});

test('BUG-8: "networks" should NOT match netflix_open', () => {
  assert.notEqual(normalizeTrigger('social networks'), 'netflix_open');
});
