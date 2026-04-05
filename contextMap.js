'use strict';

/**
 * contextMap.js — Map browser hostnames and app bundle IDs to canonical trigger IDs.
 * Single place for workflow context → trigger normalization.
 */

const { normalizeTrigger } = require('./triggerEngine');

/** Max URL length from AppleScript / external input */
const MAX_URL_LEN = 2048;

/**
 * Hostname (lowercase, no port) → trigger id. Most specific hosts first where needed.
 */
const HOSTNAME_TO_TRIGGER = {
  'netflix.com':       'netflix_open',
  'www.netflix.com':   'netflix_open',
  'spotify.com':       'spotify_open',
  'open.spotify.com':  'spotify_open',
  'www.spotify.com':   'spotify_open',
  'linkedin.com':      'linkedin_open',
  'www.linkedin.com':  'linkedin_open',
  'mail.google.com':   'gmail_open',
  'gmail.com':         'gmail_open',
  'www.gmail.com':     'gmail_open',
  'slack.com':         'work_start',
  'app.slack.com':     'work_start',
  'github.com':        'work_start',
  'www.github.com':    'work_start',
  'notion.so':         'work_start',
  'www.notion.so':     'work_start',
};

/** macOS bundle id → trigger (when no browser URL match) */
const BUNDLE_ID_TO_TRIGGER = {
  'com.netflix.Netflix':                    'netflix_open',
  'com.netflix.mediaclient':                'netflix_open',
  'com.spotify.client':                     'spotify_open',
  'com.tinyspeck.slackmacgap':              'work_start',
  'com.microsoft.VSCode':                   'work_start',
  'com.apple.dt.Xcode':                     'work_start',
  'com.microsoft.teams':                    'work_start',
  'com.microsoft.teams2':                   'work_start',
  'com.brave.Browser':                      null, // use URL
  'com.google.Chrome':                      null,
  'com.apple.Safari':                       null,
  'company.thebrowser.Browser':             null, // Arc
  'com.microsoft.edgemac':                null,
  'com.openai.atlas':                       null, // ChatGPT Atlas — use active tab URL
};

/**
 * Strip leading www. for lookup; try exact key then parent domain (one level).
 * @param {string} hostname
 * @returns {string | null} trigger id
 */
function hostnameToTrigger(hostname) {
  if (!hostname || typeof hostname !== 'string') return null;
  let h = hostname.toLowerCase().trim().split(':')[0];
  if (!h) return null;

  if (HOSTNAME_TO_TRIGGER[h]) return HOSTNAME_TO_TRIGGER[h];

  const noWww = h.startsWith('www.') ? h.slice(4) : h;
  if (HOSTNAME_TO_TRIGGER[noWww]) return HOSTNAME_TO_TRIGGER[noWww];

  // One-level parent: foo.bar.netflix.com → try netflix.com style (best-effort)
  const parts = noWww.split('.');
  if (parts.length >= 2) {
    const root = parts.slice(-2).join('.');
    if (HOSTNAME_TO_TRIGGER[root]) return HOSTNAME_TO_TRIGGER[root];
    if (HOSTNAME_TO_TRIGGER[`www.${root}`]) return HOSTNAME_TO_TRIGGER[`www.${root}`];
  }

  return null;
}

/**
 * Parse http(s) URL safely; return hostname or null.
 * @param {string} urlStr
 * @returns {string | null}
 */
function urlToHostname(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return null;
  const s = urlStr.trim();
  if (s.length > MAX_URL_LEN) return null;
  if (!/^https?:\/\//i.test(s)) {
    try {
      return new URL(`https://${s}`).hostname || null;
    } catch {
      return null;
    }
  }
  try {
    return new URL(s).hostname || null;
  } catch {
    return null;
  }
}

/**
 * Map a tab URL string to trigger id (or null).
 * @param {string} urlStr
 * @returns {string | null}
 */
function urlToTrigger(urlStr) {
  const host = urlToHostname(urlStr);
  if (!host) return null;
  return hostnameToTrigger(host);
}

/**
 * Resolve trigger from optional browser URL, bundle id, then fall back to display name map.
 * @param {{ appName: string, bundleId?: string, browserUrl?: string | null, appNameToTrigger?: Record<string, string> }} ctx
 * @returns {{ triggerId: string | null, contextLabel: string, source: 'domain' | 'bundle' | 'app' }}
 */
function resolveWorkflowTrigger(ctx) {
  const { appName, bundleId = '', browserUrl = null, appNameToTrigger = {} } = ctx;
  const name = appName || '';

  if (browserUrl) {
    const tid = urlToTrigger(browserUrl);
    if (tid) {
      const host = urlToHostname(browserUrl) || 'site';
      return {
        triggerId: tid,
        contextLabel: `${name} (${host})`,
        source: 'domain',
      };
    }
  }

  if (bundleId && Object.prototype.hasOwnProperty.call(BUNDLE_ID_TO_TRIGGER, bundleId)) {
    const tid = BUNDLE_ID_TO_TRIGGER[bundleId];
    if (tid) {
      return { triggerId: tid, contextLabel: `${name} [${bundleId}]`, source: 'bundle' };
    }
  }

  const fromName = appNameToTrigger[name];
  if (fromName) {
    return { triggerId: normalizeTrigger(fromName), contextLabel: name, source: 'app' };
  }

  return { triggerId: null, contextLabel: name, source: 'app' };
}

module.exports = {
  MAX_URL_LEN,
  HOSTNAME_TO_TRIGGER,
  BUNDLE_ID_TO_TRIGGER,
  hostnameToTrigger,
  urlToHostname,
  urlToTrigger,
  resolveWorkflowTrigger,
  normalizeTrigger,
};
