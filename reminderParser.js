/**
 * reminderParser.js — Deterministic NL time parser for scheduled reminders.
 * No LLM dependency; uses regex for clock-critical reliability.
 *
 * Supported patterns:
 *   "at 10 PM tell me I am loved"           → once, today/next at 22:00
 *   "at 10:30 PM remind me to call mom"     → once, today/next at 22:30
 *   "every day at 10 PM remind me ..."      → daily, 22:00
 *   "daily at 10 PM ..."                    → daily, 22:00
 *   "tomorrow at 8 AM ..."                  → once, next day at 08:00
 *   "in 30 minutes ..." / "in 5 mins ..."   → once, now + N min
 *   "in 2 hours ..."                        → once, now + 2h
 */

'use strict';

// ── Time string → 24h { hours, minutes } ─────────────────────────────────

function parseTimeString(timeStr) {
  // Supports: "10 PM", "10:30 PM", "10:30", "22:00", "10AM" etc.
  const m = timeStr.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return null;

  let hours = parseInt(m[1], 10);
  const minutes = m[2] ? parseInt(m[2], 10) : 0;
  const meridiem = m[3] ? m[3].toUpperCase() : null;

  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

// ── Build a Date for today at hh:mm; if already past, use tomorrow ────────

function todayOrTomorrowAt(hours, minutes) {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setHours(hours, minutes);
  if (d <= new Date()) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

// ── Strip scheduling phrases from text to extract reminder content ─────────

function extractContent(text, patternsToStrip) {
  let out = text;
  for (const pat of patternsToStrip) {
    out = out.replace(pat, '').trim();
  }
  // Remove leading connective words
  out = out.replace(/^(to\s+|that\s+|me\s+that\s+|me\s+to\s+)/i, '').trim();
  return out || text.trim();
}

// ── Main export ───────────────────────────────────────────────────────────

/**
 * Parse a natural-language reminder string.
 * @param {string} text
 * @returns {{ content: string, scheduleType: 'once'|'daily', scheduledTime: string|null, parsed: boolean }}
 */
function parseReminderNL(text) {
  if (!text || !text.trim()) {
    return { content: '', scheduleType: 'once', scheduledTime: null, parsed: false };
  }

  const input = text.trim();

  // ── Pattern: "in X minutes" / "in X hours" ──────────────────────────────
  const inRelMatch = input.match(
    /\bin\s+(\d+)\s+(minute|minutes|mins?|hour|hours|hr|hrs)\b/i,
  );
  if (inRelMatch) {
    const amount = parseInt(inRelMatch[1], 10);
    const unit = inRelMatch[2].toLowerCase();
    const d = new Date();
    if (unit.startsWith('h')) {
      d.setHours(d.getHours() + amount);
    } else {
      d.setMinutes(d.getMinutes() + amount);
    }
    const content = extractContent(input, [
      /\bin\s+\d+\s+(minute|minutes|mins?|hour|hours|hr|hrs)\b/i,
    ]);
    return { content, scheduleType: 'once', scheduledTime: d.toISOString(), parsed: true };
  }

  // ── Pattern: "every day at HH[:MM] [AM/PM]" / "daily at ..." ────────────
  const dailyMatch = input.match(/\b(?:every\s+day|daily)\s+at\s+([\d]{1,2}(?::\d{2})?\s*(?:AM|PM)?)\b/i);
  if (dailyMatch) {
    const parsed = parseTimeString(dailyMatch[1].trim());
    if (parsed) {
      const hhmm = `${String(parsed.hours).padStart(2, '0')}:${String(parsed.minutes).padStart(2, '0')}`;
      const content = extractContent(input, [
        /\bevery\s+day\s+at\s+[\d]{1,2}(?::\d{2})?\s*(?:AM|PM)?\b/i,
        /\bdaily\s+at\s+[\d]{1,2}(?::\d{2})?\s*(?:AM|PM)?\b/i,
      ]);
      return { content, scheduleType: 'daily', scheduledTime: hhmm, parsed: true };
    }
  }

  // ── Pattern: "tomorrow at HH[:MM] [AM/PM]" ──────────────────────────────
  const tomorrowMatch = input.match(/\btomorrow\s+at\s+([\d]{1,2}(?::\d{2})?\s*(?:AM|PM)?)\b/i);
  if (tomorrowMatch) {
    const parsed = parseTimeString(tomorrowMatch[1].trim());
    if (parsed) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(parsed.hours, parsed.minutes, 0, 0);
      const content = extractContent(input, [
        /\btomorrow\s+at\s+[\d]{1,2}(?::\d{2})?\s*(?:AM|PM)?\b/i,
      ]);
      return { content, scheduleType: 'once', scheduledTime: d.toISOString(), parsed: true };
    }
  }

  // ── Pattern: "at HH[:MM] [AM/PM]" ───────────────────────────────────────
  const atMatch = input.match(/\bat\s+([\d]{1,2}(?::\d{2})?\s*(?:AM|PM)?)\b/i);
  if (atMatch) {
    const parsed = parseTimeString(atMatch[1].trim());
    if (parsed) {
      const d = todayOrTomorrowAt(parsed.hours, parsed.minutes);
      const content = extractContent(input, [
        /\bat\s+[\d]{1,2}(?::\d{2})?\s*(?:AM|PM)?\b/i,
      ]);
      return { content, scheduleType: 'once', scheduledTime: d.toISOString(), parsed: true };
    }
  }

  // ── Fallback: no time parsed ─────────────────────────────────────────────
  return { content: input, scheduleType: 'once', scheduledTime: null, parsed: false };
}

/**
 * Format a scheduledTime for display.
 * @param {'once'|'daily'} scheduleType
 * @param {string} scheduledTime ISO string or 'HH:MM'
 */
function formatScheduleLabel(scheduleType, scheduledTime) {
  if (scheduleType === 'daily') {
    // scheduledTime is 'HH:MM'
    const [hh, mm] = scheduledTime.split(':').map(Number);
    const d = new Date();
    d.setHours(hh, mm, 0, 0);
    return 'Daily at ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  // scheduledTime is ISO string
  const d = new Date(scheduledTime);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

module.exports = { parseReminderNL, formatScheduleLabel };
