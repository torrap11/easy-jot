/**
 * scheduler.js — 30-second polling loop for scheduled reminders.
 * Runs in the main process. Calls TTS and pushes 'reminder-due' to renderer.
 *
 * Options:
 *   getDb()  → database module (already imported in main.js)
 *   getTts() → tts module
 *   getWin() → current BrowserWindow or null
 */

'use strict';

const POLL_INTERVAL_MS = 30_000; // 30 seconds
const STALE_WINDOW_MS  = 60 * 60 * 1000; // 1 hour — once-reminders older than this are skipped

// ── Helpers ───────────────────────────────────────────────────────────────

/** Current local time as 'HH:MM' (zero-padded). */
function currentHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Today's date as 'YYYY-MM-DD' in UTC.
 * Must match the UTC date stored by SQLite's datetime('now') in markReminderTriggered.
 * BUG-5: using local time here caused double-fires for users west of UTC.
 */
function todayDateStr() {
  return new Date().toISOString().substring(0, 10);
}

/**
 * Should this reminder fire right now?
 */
function isDue(reminder) {
  const now = new Date();

  if (reminder.schedule_type === 'once') {
    const target = new Date(reminder.scheduled_time);
    if (isNaN(target.getTime())) return false;
    // Due if target time has passed and we haven't fired yet
    return now >= target && !reminder.last_triggered_at;
  }

  if (reminder.schedule_type === 'daily') {
    // scheduled_time is 'HH:MM'
    const hhmm = reminder.scheduled_time;
    if (!/^\d{2}:\d{2}$/.test(hhmm)) return false;

    // Only fire once per day
    if (reminder.last_triggered_at) {
      const lastDate = reminder.last_triggered_at.substring(0, 10); // 'YYYY-MM-DD'
      if (lastDate === todayDateStr()) return false; // already fired today
    }

    // Fire when the current HH:MM matches (within the polling window)
    return currentHHMM() === hhmm;
  }

  return false;
}

/**
 * Is a once-reminder stale (past due by more than 1h without firing)?
 * These reminders are deactivated silently to avoid spam after app restart.
 */
function isStale(reminder) {
  if (reminder.schedule_type !== 'once') return false;
  if (reminder.last_triggered_at) return false; // already fired
  const target = new Date(reminder.scheduled_time);
  if (isNaN(target.getTime())) return true;
  return Date.now() - target.getTime() > STALE_WINDOW_MS;
}

// ── Core fire logic ───────────────────────────────────────────────────────

async function fireReminder(reminder, db, tts, win) {
  // Mark triggered FIRST (idempotent — prevents double-fire even if TTS hangs)
  db.markReminderTriggered(reminder.id);

  // Deactivate once-reminders after firing
  if (reminder.schedule_type === 'once') {
    db.deactivateReminder(reminder.id);
  }

  // If reminder has note_content, create a note so the panel can show only that note
  let noteId = null;
  if (reminder.note_content) {
    try {
      const note = db.createNote(reminder.note_content);
      noteId = note.id;
    } catch (err) {
      console.warn('[scheduler] Failed to create note for reminder:', err.message);
    }
  }

  // Generate TTS audio
  let audioData = null;
  try {
    const wavBuf = await tts.synthesize(reminder.content);
    if (wavBuf) {
      audioData = wavBuf.buffer.slice(wavBuf.byteOffset, wavBuf.byteOffset + wavBuf.byteLength);
    }
  } catch (err) {
    console.warn('[scheduler] TTS failed for reminder:', err.message);
  }

  // Push to renderer (non-blocking — renderer may not be visible)
  if (win && !win.isDestroyed()) {
    const payload = {
      id:        reminder.id,
      content:   reminder.content,
      audioData,
    };
    if (noteId != null) {
      payload.noteId = noteId;
      payload.showOnlyThisNote = true;
    }
    win.webContents.send('reminder-due', payload);

    // Show window if hidden so user sees the notification
    if (!win.isVisible()) {
      win.show();
      win.focus();
    }
  }
}

// ── Poll loop ─────────────────────────────────────────────────────────────

function poll(getDb, getTts, getWin) {
  const db  = getDb();
  const tts = getTts();
  const win = getWin();

  let reminders;
  try {
    reminders = db.getActiveReminders();
  } catch (err) {
    console.warn('[scheduler] DB read failed:', err.message);
    return;
  }

  for (const reminder of reminders) {
    if (isStale(reminder)) {
      console.log(`[scheduler] Stale reminder deactivated: #${reminder.id}`);
      db.deactivateReminder(reminder.id);
      continue;
    }

    if (isDue(reminder)) {
      console.log(`[scheduler] Firing reminder #${reminder.id}: "${reminder.content}"`);
      fireReminder(reminder, db, tts, win).catch(err => {
        console.error('[scheduler] Fire error:', err.message);
      });
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Start the scheduler. Returns a stop function.
 * @param {{ getDb: Function, getTts: Function, getWin: Function }} options
 */
function startScheduler({ getDb, getTts, getWin }) {
  // Run once immediately on startup to catch any missed reminders from last session
  // (stale ones are silently deactivated; current ones fire)
  setTimeout(() => poll(getDb, getTts, getWin), 5000);

  const interval = setInterval(() => poll(getDb, getTts, getWin), POLL_INTERVAL_MS);

  return function stopScheduler() {
    clearInterval(interval);
  };
}

/**
 * Manually fire a reminder by id (for "Test ▶" button in UI).
 * Returns audioData ArrayBuffer or null.
 */
async function fireById(id, db, tts) {
  const reminder = db.getActiveReminders().find(r => r.id === id)
    || db.getAllScheduledReminders().find(r => r.id === id);
  if (!reminder) return null;

  let audioData = null;
  try {
    const wavBuf = await tts.synthesize(reminder.content);
    if (wavBuf) {
      audioData = wavBuf.buffer.slice(wavBuf.byteOffset, wavBuf.byteOffset + wavBuf.byteLength);
    }
  } catch (err) {
    console.warn('[scheduler] TTS failed for test fire:', err.message);
  }

  return audioData;
}

module.exports = { startScheduler, fireById };
