'use strict';
/**
 * test-scheduler-logic.js
 * Tests: isDue / isStale logic isolated from the scheduler module.
 * These are pure time-comparison functions — no DB or TTS involved.
 */
const { test } = require('node:test');
const assert   = require('node:assert/strict');

// ── Inline the pure logic (mirrors scheduler.js exactly) ─────────────────

const STALE_WINDOW_MS = 60 * 60 * 1000;

function currentHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// BUG-5 fix: now uses UTC to match SQLite's datetime('now') storage
function todayDateStr() {
  return new Date().toISOString().substring(0, 10);
}

function isDue(reminder) {
  const now = new Date();
  if (reminder.schedule_type === 'once') {
    const target = new Date(reminder.scheduled_time);
    if (isNaN(target.getTime())) return false;
    return now >= target && !reminder.last_triggered_at;
  }
  if (reminder.schedule_type === 'daily') {
    const hhmm = reminder.scheduled_time;
    if (!/^\d{2}:\d{2}$/.test(hhmm)) return false;
    if (reminder.last_triggered_at) {
      const lastDate = reminder.last_triggered_at.substring(0, 10);
      if (lastDate === todayDateStr()) return false;
    }
    return currentHHMM() === hhmm;
  }
  return false;
}

function isStale(reminder) {
  if (reminder.schedule_type !== 'once') return false;
  if (reminder.last_triggered_at) return false;
  const target = new Date(reminder.scheduled_time);
  if (isNaN(target.getTime())) return true;
  return Date.now() - target.getTime() > STALE_WINDOW_MS;
}

// ── isDue: once ───────────────────────────────────────────────────────────

test('isDue: once reminder in the past, not yet fired → due', () => {
  const r = {
    schedule_type:    'once',
    scheduled_time:   new Date(Date.now() - 60_000).toISOString(),
    last_triggered_at: null,
  };
  assert.ok(isDue(r));
});

test('isDue: once reminder in the future → not due', () => {
  const r = {
    schedule_type:    'once',
    scheduled_time:   new Date(Date.now() + 60_000).toISOString(),
    last_triggered_at: null,
  };
  assert.equal(isDue(r), false);
});

test('isDue: once reminder already fired → not due', () => {
  const r = {
    schedule_type:    'once',
    scheduled_time:   new Date(Date.now() - 60_000).toISOString(),
    last_triggered_at: new Date().toISOString(),
  };
  assert.equal(isDue(r), false);
});

test('isDue: once reminder with invalid time → not due', () => {
  const r = { schedule_type: 'once', scheduled_time: 'not-a-date', last_triggered_at: null };
  assert.equal(isDue(r), false);
});

// ── isDue: daily ──────────────────────────────────────────────────────────

test('isDue: daily reminder at current HH:MM, not yet fired today → due', () => {
  const r = {
    schedule_type:    'daily',
    scheduled_time:   currentHHMM(), // fires right now
    last_triggered_at: null,
  };
  assert.ok(isDue(r));
});

test('isDue: daily reminder at current HH:MM but already fired today → not due', () => {
  const r = {
    schedule_type:    'daily',
    scheduled_time:   currentHHMM(),
    last_triggered_at: `${todayDateStr()} 10:00:00`,
  };
  assert.equal(isDue(r), false);
});

test('isDue: daily reminder at different HH:MM → not due', () => {
  // Pick a time 2 hours from now (very unlikely to match current minute)
  const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const hhmm = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  const r = {
    schedule_type:    'daily',
    scheduled_time:   hhmm,
    last_triggered_at: null,
  };
  // Only fails if we happen to run exactly at hhmm — acceptable for unit test
  if (hhmm !== currentHHMM()) assert.equal(isDue(r), false);
});

// ── isStale ───────────────────────────────────────────────────────────────

test('isStale: once reminder >1h past due, never fired → stale', () => {
  const r = {
    schedule_type:    'once',
    scheduled_time:   new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    last_triggered_at: null,
  };
  assert.ok(isStale(r));
});

test('isStale: once reminder <1h past due → not stale', () => {
  const r = {
    schedule_type:    'once',
    scheduled_time:   new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    last_triggered_at: null,
  };
  assert.equal(isStale(r), false);
});

test('isStale: daily reminder → never stale', () => {
  const r = {
    schedule_type:    'daily',
    scheduled_time:   '22:00',
    last_triggered_at: null,
  };
  assert.equal(isStale(r), false);
});

test('isStale: once already fired → not stale', () => {
  const r = {
    schedule_type:    'once',
    scheduled_time:   new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    last_triggered_at: new Date().toISOString(),
  };
  assert.equal(isStale(r), false);
});

test('isStale: invalid scheduled_time → stale', () => {
  const r = { schedule_type: 'once', scheduled_time: 'garbage', last_triggered_at: null };
  assert.ok(isStale(r));
});
