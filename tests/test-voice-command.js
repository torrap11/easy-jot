'use strict';
/**
 * test-voice-command.js
 * Tests: parseClassification logic for all 5 modes, markdown stripping,
 *        JSON extraction, invalid mode rejection.
 * Inlines parseClassification since it's not exported (same pattern as
 * test-scheduler-logic.js for isDue/isStale).
 */
const { test } = require('node:test');
const assert   = require('node:assert/strict');

// ── Inline parseClassification (mirrors voiceCommand.js exactly) ──────────

function tryParseObject(str) {
  try {
    const v = JSON.parse(str);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  } catch (_) {}
  return null;
}

function parseClassification(raw) {
  let parsed = tryParseObject(raw.trim());

  if (!parsed) {
    const cleaned = raw
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/\s*```\s*$/m, '')
      .trim();
    parsed = tryParseObject(cleaned);
  }

  if (!parsed) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) parsed = tryParseObject(match[0]);
  }

  if (!parsed) return null;

  const validModes = ['dictate', 'app_control', 'agent', 'scheduled', 'error'];
  if (!validModes.includes(parsed.mode)) return null;
  if (!parsed.payload || typeof parsed.payload !== 'object') return null;
  if (parsed.mode === 'error' && typeof parsed.payload.message !== 'string') return null;

  return parsed;
}

// ── MODE: dictate ─────────────────────────────────────────────────────────

test('parseClassification: dictate mode', () => {
  const raw = JSON.stringify({ mode: 'dictate', payload: { text: 'buy groceries' } });
  const result = parseClassification(raw);
  assert.ok(result);
  assert.equal(result.mode, 'dictate');
  assert.equal(result.payload.text, 'buy groceries');
});

// ── MODE: app_control ─────────────────────────────────────────────────────

test('parseClassification: app_control mode', () => {
  const raw = JSON.stringify({ mode: 'app_control', payload: { action: 'back' } });
  const result = parseClassification(raw);
  assert.ok(result);
  assert.equal(result.mode, 'app_control');
  assert.equal(result.payload.action, 'back');
});

test('parseClassification: app_control navigate with params', () => {
  const raw = JSON.stringify({
    mode: 'app_control',
    payload: { action: 'navigate', params: { direction: 'down', count: 3 } },
  });
  const result = parseClassification(raw);
  assert.ok(result);
  assert.equal(result.payload.params.direction, 'down');
  assert.equal(result.payload.params.count, 3);
});

// ── MODE: agent ───────────────────────────────────────────────────────────

test('parseClassification: agent mode', () => {
  const raw = JSON.stringify({ mode: 'agent', payload: { query: 'organize my notes into folders' } });
  const result = parseClassification(raw);
  assert.ok(result);
  assert.equal(result.mode, 'agent');
  assert.equal(result.payload.query, 'organize my notes into folders');
});

test('parseClassification: legacy trigger mode is rejected', () => {
  const raw = JSON.stringify({
    mode: 'trigger',
    payload: { trigger: 'spotify_open', content: 'x', category: 'entertainment' },
  });
  assert.equal(parseClassification(raw), null);
});

// ── MODE: scheduled ───────────────────────────────────────────────────────

test('parseClassification: scheduled mode — once', () => {
  const scheduledTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const raw = JSON.stringify({
    mode: 'scheduled',
    payload: { content: 'Take medication', scheduleType: 'once', scheduledTime },
  });
  const result = parseClassification(raw);
  assert.ok(result);
  assert.equal(result.mode, 'scheduled');
  assert.equal(result.payload.scheduleType, 'once');
  assert.ok(result.payload.scheduledTime);
});

test('parseClassification: scheduled mode — daily', () => {
  const raw = JSON.stringify({
    mode: 'scheduled',
    payload: { content: 'Drink water', scheduleType: 'daily', scheduledTime: '09:00' },
  });
  const result = parseClassification(raw);
  assert.ok(result);
  assert.equal(result.payload.scheduleType, 'daily');
  assert.equal(result.payload.scheduledTime, '09:00');
});

// ── Markdown fence stripping ───────────────────────────────────────────────

test('parseClassification: strips markdown fences', () => {
  const raw = '```json\n{"mode":"dictate","payload":{"text":"hello"}}\n```';
  const result = parseClassification(raw);
  assert.ok(result);
  assert.equal(result.mode, 'dictate');
});

test('parseClassification: extracts embedded JSON from prose', () => {
  const raw = 'Sure! Here is the result: {"mode":"agent","payload":{"query":"find notes"}} Hope that helps.';
  const result = parseClassification(raw);
  assert.ok(result);
  assert.equal(result.mode, 'agent');
});

// ── Invalid / fallback cases ───────────────────────────────────────────────

test('parseClassification: returns null for unknown mode', () => {
  const raw = JSON.stringify({ mode: 'unknown_mode', payload: { text: 'something' } });
  assert.equal(parseClassification(raw), null);
});

test('parseClassification: returns null for missing payload', () => {
  const raw = JSON.stringify({ mode: 'dictate' });
  assert.equal(parseClassification(raw), null);
});

test('parseClassification: returns null for non-object payload', () => {
  const raw = JSON.stringify({ mode: 'dictate', payload: 'just a string' });
  assert.equal(parseClassification(raw), null);
});

test('parseClassification: returns null for completely invalid JSON', () => {
  assert.equal(parseClassification('this is not json at all'), null);
});

test('parseClassification: returns null for empty string', () => {
  assert.equal(parseClassification(''), null);
});

// ── validModes exhaustive check ───────────────────────────────────────────

test('all standard modes except error use generic payload', () => {
  const modes = ['dictate', 'app_control', 'agent', 'scheduled'];
  for (const mode of modes) {
    const raw = JSON.stringify({ mode, payload: { test: true } });
    const result = parseClassification(raw);
    assert.ok(result, `Mode "${mode}" should be valid`);
    assert.equal(result.mode, mode);
  }
});

test('parseClassification: error mode requires message string', () => {
  const ok = JSON.stringify({ mode: 'error', payload: { message: 'LLM down' } });
  assert.equal(parseClassification(ok).mode, 'error');
  const bad = JSON.stringify({ mode: 'error', payload: { code: 1 } });
  assert.equal(parseClassification(bad), null);
});

test('Cmd+Shift+J mode is NOT a valid mode (removed)', () => {
  // Verify "voice_capture" or similar legacy modes are rejected
  const raw = JSON.stringify({ mode: 'voice_capture', payload: {} });
  assert.equal(parseClassification(raw), null);
});
