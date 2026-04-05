'use strict';
/**
 * test-reminder-parser.js
 * Tests: NL time parsing for scheduled reminders.
 */
const { test } = require('node:test');
const assert   = require('node:assert/strict');

const { parseReminderNL, formatScheduleLabel } = require('../reminderParser');

// ── Helper: assert parsed fields ──────────────────────────────────────────

function assertParsed(result, { scheduleType, contentIncludes, timeParsed = true }) {
  assert.ok(result.parsed === timeParsed,
    `Expected parsed=${timeParsed}, got ${result.parsed} for: "${result.content}"`);
  if (scheduleType) assert.equal(result.scheduleType, scheduleType);
  if (contentIncludes) assert.ok(
    result.content.toLowerCase().includes(contentIncludes.toLowerCase()),
    `Expected content to include "${contentIncludes}", got: "${result.content}"`
  );
}

// ── "at X PM" patterns ───────────────────────────────────────────────────

test('parses "at 10 PM tell me I am loved"', () => {
  const r = parseReminderNL('at 10 PM tell me I am loved');
  assertParsed(r, { scheduleType: 'once', contentIncludes: 'loved' });
  assert.ok(r.scheduledTime, 'scheduledTime should be set');
  const d = new Date(r.scheduledTime);
  assert.equal(d.getHours(), 22);
  assert.equal(d.getMinutes(), 0);
});

test('parses "at 10:30 PM remind me to call mom"', () => {
  const r = parseReminderNL('at 10:30 PM remind me to call mom');
  assertParsed(r, { scheduleType: 'once', contentIncludes: 'call mom' });
  const d = new Date(r.scheduledTime);
  assert.equal(d.getHours(), 22);
  assert.equal(d.getMinutes(), 30);
});

test('parses "at 8 AM wake up"', () => {
  const r = parseReminderNL('at 8 AM wake up');
  assertParsed(r, { scheduleType: 'once', contentIncludes: 'wake up' });
  const d = new Date(r.scheduledTime);
  assert.equal(d.getHours(), 8);
});

// ── Daily patterns ────────────────────────────────────────────────────────

test('parses "every day at 10 PM wind down"', () => {
  const r = parseReminderNL('every day at 10 PM wind down');
  assertParsed(r, { scheduleType: 'daily', contentIncludes: 'wind down' });
  assert.equal(r.scheduledTime, '22:00');
});

test('parses "daily at 9 AM drink water"', () => {
  const r = parseReminderNL('daily at 9 AM drink water');
  assertParsed(r, { scheduleType: 'daily', contentIncludes: 'drink water' });
  assert.equal(r.scheduledTime, '09:00');
});

// ── Tomorrow pattern ──────────────────────────────────────────────────────

test('parses "tomorrow at 8 AM call the dentist"', () => {
  const r = parseReminderNL('tomorrow at 8 AM call the dentist');
  assertParsed(r, { scheduleType: 'once', contentIncludes: 'dentist' });
  const d = new Date(r.scheduledTime);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  assert.equal(d.getDate(), tomorrow.getDate());
  assert.equal(d.getHours(), 8);
});

// ── Relative patterns ─────────────────────────────────────────────────────

test('parses "in 30 minutes remind me to stretch"', () => {
  const before = Date.now();
  const r = parseReminderNL('in 30 minutes remind me to stretch');
  const after = Date.now();
  assertParsed(r, { scheduleType: 'once', contentIncludes: 'stretch' });
  const ms = new Date(r.scheduledTime).getTime();
  assert.ok(ms >= before + 29 * 60_000, 'should be ~30m in future');
  assert.ok(ms <= after  + 31 * 60_000, 'should be ~30m in future');
});

test('parses "in 2 hours take medication"', () => {
  const before = Date.now();
  const r = parseReminderNL('in 2 hours take medication');
  assertParsed(r, { scheduleType: 'once', contentIncludes: 'medication' });
  const ms = new Date(r.scheduledTime).getTime();
  assert.ok(ms >= before + 119 * 60_000);
  assert.ok(ms <= before + 121 * 60_000);
});

test('parses "remind me in 2 mins to stretch" (mins shorthand)', () => {
  const before = Date.now();
  const r = parseReminderNL('remind me in 2 mins to stretch');
  const after = Date.now();
  assertParsed(r, { scheduleType: 'once', contentIncludes: 'stretch' });
  const ms = new Date(r.scheduledTime).getTime();
  assert.ok(ms >= before + 90_000, 'should be ~2m in the future');
  assert.ok(ms <= after + 150_000, 'should be ~2m in the future');
});

// ── Fallback ──────────────────────────────────────────────────────────────

test('returns unparsed fallback when no time phrase', () => {
  const r = parseReminderNL('remember to be kind');
  assert.equal(r.parsed, false);
  assert.ok(r.content.includes('kind'));
});

test('handles empty string gracefully', () => {
  const r = parseReminderNL('');
  assert.equal(r.parsed, false);
});

// ── formatScheduleLabel ───────────────────────────────────────────────────

test('formatScheduleLabel: daily', () => {
  const label = formatScheduleLabel('daily', '22:00');
  assert.ok(label.toLowerCase().includes('daily'));
});

test('formatScheduleLabel: once (ISO string)', () => {
  const iso = new Date(Date.now() + 60_000).toISOString();
  const label = formatScheduleLabel('once', iso);
  assert.ok(typeof label === 'string' && label.length > 0);
});
