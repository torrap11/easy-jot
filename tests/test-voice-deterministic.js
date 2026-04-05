'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const { routeVoiceIntentDeterministic, routeContextPhraseToDictate } = require('../voiceCommand');

test('deterministic route: organize my notes → agent', () => {
  const r = routeVoiceIntentDeterministic('please organize my notes');
  assert.ok(r);
  assert.equal(r.mode, 'agent');
  assert.ok(r.payload.query.toLowerCase().includes('organize'));
});

test('deterministic route: create folder → agent', () => {
  const r = routeVoiceIntentDeterministic('create a new folder named work');
  assert.ok(r);
  assert.equal(r.mode, 'agent');
});

test('deterministic route: plain jot phrase → null (LLM decides)', () => {
  const r = routeVoiceIntentDeterministic('buy milk and eggs');
  assert.equal(r, null);
});

test('context phrase route: when I open → dictate (full line)', () => {
  const line = 'When I open Netflix switch subtitles';
  const r = routeContextPhraseToDictate(line);
  assert.ok(r);
  assert.equal(r.mode, 'dictate');
  assert.equal(r.payload.text, line);
});

test('context phrase route: next time I open → dictate', () => {
  const r = routeContextPhraseToDictate('next time I open Spotify play jazz');
  assert.ok(r);
  assert.equal(r.mode, 'dictate');
});
