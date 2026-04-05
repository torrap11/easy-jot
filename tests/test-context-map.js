'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const {
  hostnameToTrigger,
  urlToHostname,
  urlToTrigger,
  resolveWorkflowTrigger,
} = require('../contextMap');

test('urlToHostname parses https URL', () => {
  assert.equal(urlToHostname('https://www.netflix.com/browse'), 'www.netflix.com');
});

test('hostnameToTrigger maps netflix.com', () => {
  assert.equal(hostnameToTrigger('netflix.com'), 'netflix_open');
  assert.equal(hostnameToTrigger('WWW.NETFLIX.COM'), 'netflix_open');
});

test('hostnameToTrigger maps open.spotify.com', () => {
  assert.equal(hostnameToTrigger('open.spotify.com'), 'spotify_open');
});

test('urlToTrigger maps full Netflix URL', () => {
  assert.equal(
    urlToTrigger('https://www.netflix.com/title/123'),
    'netflix_open',
  );
});

test('resolveWorkflowTrigger prefers domain from browser URL', () => {
  const r = resolveWorkflowTrigger({
    appName: 'Google Chrome',
    bundleId: 'com.google.Chrome',
    browserUrl: 'https://mail.google.com/mail/u/0/',
    appNameToTrigger: {},
  });
  assert.equal(r.triggerId, 'gmail_open');
  assert.equal(r.source, 'domain');
  assert.ok(r.contextLabel.includes('mail.google.com'));
});

test('resolveWorkflowTrigger: ChatGPT Atlas + Netflix URL → netflix_open', () => {
  const r = resolveWorkflowTrigger({
    appName: 'ChatGPT Atlas',
    bundleId: 'com.openai.atlas',
    browserUrl: 'https://www.netflix.com/browse',
    appNameToTrigger: {},
  });
  assert.equal(r.triggerId, 'netflix_open');
  assert.equal(r.source, 'domain');
});

test('resolveWorkflowTrigger falls back to app name map', () => {
  const r = resolveWorkflowTrigger({
    appName: 'Netflix',
    bundleId: '',
    browserUrl: null,
    appNameToTrigger: { Netflix: 'netflix_open' },
  });
  assert.equal(r.triggerId, 'netflix_open');
  assert.equal(r.source, 'app');
});
