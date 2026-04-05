'use strict';

/**
 * workflowWatcher.js — macOS frontmost app + active browser tab URL → triggers.
 *
 * Polls every 2s: reads process name + bundle id, and for known browsers reads
 * the active tab URL via AppleScript (fragile across browser versions).
 *
 * Requires Accessibility for System Events + browser automation.
 * Opt-in: "workflowWatcherEnabled": true in config.json
 */

const { execFile } = require('child_process');
const { resolveWorkflowTrigger, MAX_URL_LEN } = require('./contextMap');

const POLL_INTERVAL_MS    = 2_000;
const TRIGGER_COOLDOWN_MS = 30 * 60_000;

/** Process display name → canonical trigger id (non-browser apps) */
const APP_TRIGGER_MAP = {
  Netflix:            'netflix_open',
  Spotify:            'spotify_open',
  Slack:              'work_start',
  Code:               'work_start',
  'Visual Studio Code': 'work_start',
  Xcode:              'work_start',
  'Microsoft Teams':  'work_start',
  'Microsoft Teams (work or school)': 'work_start',
};

/**
 * Browser process names (System Events) → AppleScript application name.
 * AppleScript name must match the app bundle for `tell application "…"`.
 */
const BROWSER_APPLE_NAME = {
  'Google Chrome':   'Google Chrome',
  'Brave Browser':   'Brave Browser',
  'Microsoft Edge':  'Microsoft Edge',
  Arc:               'Arc',
  Safari:            'Safari',
  Chromium:          'Chromium',
  // OpenAI ChatGPT Atlas (Chromium-based; same active-tab URL script as Chrome)
  'ChatGPT Atlas':   'ChatGPT Atlas',
  /** If System Events reports a short process title, AppleScript still targets the full .app name */
  Atlas:             'ChatGPT Atlas',
};

let intervalId            = null;
let lastContextSignature  = '';
let permissionErrorLogged = false;

const lastTriggerFiredAt = new Map();

function runOsascript(source) {
  return new Promise((resolve) => {
    execFile('osascript', ['-e', source], { timeout: 2500 }, (err, stdout) => {
      if (err) resolve(null);
      else resolve((stdout || '').trim() || null);
    });
  });
}

/**
 * Frontmost app name and bundle identifier (may be empty if denied).
 */
async function getFrontmostProcess() {
  const script = `
tell application "System Events"
  set frontApp to first application process whose frontmost is true
  set appName to name of frontApp
  try
    set bid to bundle identifier of frontApp
  on error
    set bid to ""
  end try
end tell
return appName & "||||" & bid`;
  const out = await runOsascript(script);
  if (!out || !out.includes('||||')) return null;
  const [name, bundleId] = out.split('||||');
  return { appName: name.trim(), bundleId: (bundleId || '').trim() };
}

/**
 * Active tab URL for supported browsers (http(s) only, length-capped).
 */
async function getBrowserActiveUrl(processName) {
  const appleName = BROWSER_APPLE_NAME[processName];
  if (!appleName) return null;

  let script;
  if (appleName === 'Safari') {
    script = `tell application "Safari"
  if (count of windows) > 0 then
    try
      return URL of current tab of front window
    on error
      return ""
    end try
  else
    return ""
  end if
end tell`;
  } else {
    // Chrome/Chromium family (Brave, Edge, Arc, Chrome — AppleScript surface similar to Chrome)
    const safe = appleName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    script = `tell application "${safe}"
  if (count of windows) > 0 then
    try
      return URL of active tab of front window
    on error
      return ""
    end try
  else
    return ""
  end if
end tell`;
  }

  const url = await runOsascript(script);
  if (!url || url.length > MAX_URL_LEN) return null;
  const lower = url.toLowerCase();
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) return null;
  return url;
}

function contextSignature(proc, browserUrl) {
  const u = browserUrl || '';
  return `${proc.appName}|${proc.bundleId}|${u}`;
}

/**
 * @param {{ runTrigger: Function, getConfig: Function }} options
 *   runTrigger(triggerId, source, contextLabel)
 */
function startWatcher({ runTrigger, getConfig }) {
  if (process.platform !== 'darwin') {
    console.log('[workflow] Watcher only supported on macOS — skipping.');
    return;
  }

  intervalId = setInterval(async () => {
    const cfg = getConfig();
    if (!cfg.workflowWatcherEnabled) return;

    let proc;
    try {
      proc = await getFrontmostProcess();
    } catch {
      return;
    }

    if (!proc || !proc.appName) {
      if (!permissionErrorLogged) {
        console.warn('[workflow] Could not read frontmost app — check Accessibility permission.');
        permissionErrorLogged = true;
      }
      return;
    }

    permissionErrorLogged = false;

    let browserUrl = null;
    if (BROWSER_APPLE_NAME[proc.appName]) {
      browserUrl = await getBrowserActiveUrl(proc.appName);
    }

    const sig = contextSignature(proc, browserUrl);
    if (sig === lastContextSignature) return;
    lastContextSignature = sig;

    const resolved = resolveWorkflowTrigger({
      appName: proc.appName,
      bundleId: proc.bundleId,
      browserUrl,
      appNameToTrigger: APP_TRIGGER_MAP,
    });

    if (!resolved.triggerId) return;

    const lastFired = lastTriggerFiredAt.get(resolved.triggerId) || 0;
    if (Date.now() - lastFired < TRIGGER_COOLDOWN_MS) return;

    lastTriggerFiredAt.set(resolved.triggerId, Date.now());
    console.log(
      `[workflow] Context (${resolved.source}): "${resolved.contextLabel}" → trigger "${resolved.triggerId}"`,
    );

    try {
      await runTrigger(resolved.triggerId, 'auto', resolved.contextLabel);
    } catch (err) {
      console.warn('[workflow] runTrigger error:', err.message);
    }
  }, POLL_INTERVAL_MS);
}

function stopWatcher() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

module.exports = { startWatcher, stopWatcher };
