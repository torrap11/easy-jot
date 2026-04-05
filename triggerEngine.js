'use strict';

/**
 * triggerEngine.js – Trigger metadata and normalization helpers.
 *
 * For the hackathon MVP, triggers are simulated manually via the UI.
 * This module owns the canonical trigger IDs, their display labels,
 * and the normalization logic that maps user-facing names to IDs.
 */

/** Canonical trigger IDs → human-readable labels */
const TRIGGER_LABELS = {
  netflix_open:  'Netflix',
  spotify_open:  'Spotify',
  work_start:    'Work',
  linkedin_open: 'LinkedIn',
  gmail_open:    'Gmail',
  general:       'General',
};

/** Trigger IDs → emoji icons for UI display */
const TRIGGER_ICONS = {
  netflix_open:  '📺',
  spotify_open:  '🎵',
  work_start:    '🖥️',
  linkedin_open: '💼',
  gmail_open:    '📧',
  general:       '💡',
};

/**
 * Return the human-readable label for a trigger ID.
 * Falls back to the raw trigger string if unknown.
 */
function getTriggerLabel(trigger) {
  return TRIGGER_LABELS[trigger] || trigger;
}

/**
 * Return the emoji icon for a trigger ID.
 */
function getTriggerIcon(trigger) {
  return TRIGGER_ICONS[trigger] || '💡';
}

/**
 * Normalize an arbitrary user input string to a canonical trigger ID.
 * Accepts both internal IDs (netflix_open) and display names (Netflix).
 */
function normalizeTrigger(input) {
  const s = (input || '').toLowerCase().trim();

  // Direct match on ID
  if (TRIGGER_LABELS[s]) return s;

  // Match on display label (case-insensitive)
  for (const [id, label] of Object.entries(TRIGGER_LABELS)) {
    if (label.toLowerCase() === s) return id;
  }

  // Partial match on root word with word boundaries (e.g. "netflix" → "netflix_open")
  // BUG-8: use regex word boundary so "homework" doesn't match "work_start"
  for (const id of Object.keys(TRIGGER_LABELS)) {
    const root = id.split('_')[0];
    if (new RegExp(`\\b${root}\\b`, 'i').test(s)) return id;
  }

  // Unknown trigger — return as-is for forward compatibility
  return s;
}

/**
 * Semantic keywords for each trigger.
 * Used to surface jots even when they don't contain the trigger's name.
 * e.g. "listen to spanish music" should match spotify_open via 'music'/'listen'.
 */
const TRIGGER_KEYWORDS = {
  spotify_open:  ['spotify', 'music', 'song', 'playlist', 'listen', 'album', 'track', 'podcast', 'audio'],
  netflix_open:  ['netflix', 'watch', 'movie', 'show', 'episode', 'film', 'series', 'stream'],
  work_start:    ['work', 'slack', 'vscode', 'xcode', 'teams', 'meeting', 'office', 'email'],
  linkedin_open: ['linkedin', 'networking', 'recruiter', 'job', 'profile'],
  gmail_open:    ['gmail', 'email', 'inbox', 'mail', 'message'],
  general:       [],
};

/**
 * Return all semantic search keywords for a trigger.
 * Falls back to just the lowercase label for unknown triggers.
 */
function getTriggerKeywords(triggerId) {
  return TRIGGER_KEYWORDS[triggerId] || [TRIGGER_LABELS[triggerId]?.toLowerCase()].filter(Boolean);
}

/** All defined trigger IDs as an array, for UI iteration. */
const ALL_TRIGGERS = Object.keys(TRIGGER_LABELS);

module.exports = {
  TRIGGER_LABELS, TRIGGER_ICONS, TRIGGER_KEYWORDS,
  getTriggerLabel, getTriggerIcon, getTriggerKeywords, normalizeTrigger, ALL_TRIGGERS,
};
