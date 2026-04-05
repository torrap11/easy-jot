'use strict';

/**
 * voiceCommand.js — LLM classifier for the universal Cmd+M voice command.
 *
 * Returns { mode, payload } where mode is one of:
 *   'dictate' | 'app_control' | 'agent' | 'scheduled' | 'error'
 *
 * Deterministic keyword routing sends organizer/search phrases straight to `agent`
 * without the LLM. LLM failures or unparseable classifier output yield `mode: 'error'`
 * (no silent fallback to a new jot).
 */

const { callLLM, describeLLMError } = require('./llm');
const { getConfig } = require('./config');

/** High-confidence phrases → agent (skip LLM classifier). */
function deterministicAgentRoute(transcript) {
  const t = transcript.trim();
  if (!t) return null;
  const patterns = [
    /\borganize\s+(my\s+)?(notes|jots)\b/i,
    /\b(create|make|add)\s+(a\s+)?new\s+folder\b/i,
    /\b(create|make)\s+(a\s+)?folder\s+named\b/i,
    /\b(create|make)\s+(a\s+)?folder\b/i,
    /\blist\s+(all\s+)?(my\s+)?(scheduled\s+)?reminders\b/i,
    /\bsearch\s+(my\s+)?(notes|jots)\s+for\b/i,
    /\bsearch\s+(my\s+)?(notes|jots)\b/i,
    /\bfind\s+(all\s+)?(my\s+)?notes\b/i,
    /\bfind\s+.*\bin\s+(my\s+)?notes\b/i,
    /\bwhat\s+are\s+my\s+reminders\b/i,
    /\bdelete\s+reminder\b/i,
    /\bmove\s+(all\s+)?(my\s+)?notes\b/i,
    /\bsort\s+(my\s+)?notes\b/i,
    /\bput\s+these\s+notes\s+into\s+folders\b/i,
    /\bgroup\s+(my\s+)?notes\b/i,
  ];
  for (const re of patterns) {
    if (re.test(t)) return { mode: 'agent', payload: { query: t } };
  }
  return null;
}

/** "When I'm on Netflix…" style lines are saved as plain notes; keyword matching surfaces them on the right screen. */
function deterministicDictateRoute(transcript) {
  const t = transcript.trim();
  if (!t) return null;
  if (/\bwhen\s+(I\s+open|I'?m\s+on|I\s+visit|I\s+go\s+to)\b/i.test(t)) {
    return { mode: 'dictate', payload: { text: t } };
  }
  if (/\b(next\s+time|remind\s+me\s+when|whenever)\s+I\s+open\b/i.test(t)) {
    return { mode: 'dictate', payload: { text: t } };
  }
  return null;
}

const CLASSIFIER_SYSTEM_PROMPT = `You are a voice command classifier for a sticky-note app called Jot.
Given a spoken command transcript, classify it into EXACTLY ONE mode and extract a structured payload.

Respond with ONLY a valid JSON object — no prose, no markdown fences:
{
  "mode": "<mode>",
  "payload": { ... }
}

━━━ MODE: scheduled ━━━
User is setting a time-based reminder — something to be spoken aloud at a specific time or on a recurring schedule.
Trigger patterns: "at X o'clock", "at X AM/PM", "every day at", "daily at", "tomorrow at", "in X minutes/hours", "remind me at"
payload: { "content": "<what to say/remind>", "scheduleType": "once"|"daily", "scheduledTime": "<ISO datetime for once, HH:MM for daily>" }
For "once": scheduledTime is ISO 8601 string for the nearest future occurrence of that time today/tomorrow.
For "daily": scheduledTime is "HH:MM" in 24h format.
Current time for reference: ${new Date().toISOString()}
Examples:
  "At 10 PM tell me I am loved" → { "content": "You are loved", "scheduleType": "once", "scheduledTime": "<today or tomorrow at 22:00 ISO>" }
  "Every day at 9 AM remind me to drink water" → { "content": "Drink water", "scheduleType": "daily", "scheduledTime": "09:00" }
  "Daily at 10 PM wind down" → { "content": "Wind down", "scheduleType": "daily", "scheduledTime": "22:00" }
  "Tomorrow at 8 AM call mom" → { "content": "Call mom", "scheduleType": "once", "scheduledTime": "<tomorrow at 08:00 ISO>" }
  "In 30 minutes remind me to take a break" → { "content": "Take a break", "scheduleType": "once", "scheduledTime": "<now + 30 min ISO>" }
  "Remind me at 3 PM to take my medication" → { "content": "Take my medication", "scheduleType": "once", "scheduledTime": "<3 PM ISO>" }

━━━ MODE: dictate ━━━
User is speaking text to be saved as a plain note or inserted at the cursor.
Also use dictate for context-style reminders the app will surface later when keywords match the screen (e.g. Netflix, Spotify): keep the full spoken line including app names so notes can match.
Trigger words/patterns: "write", "add", "note that", "jot down", "note:"
Or any plain statement with no app-control, scheduled, or agent intent.
payload: { "text": "<the content, cleaned of meta-words like 'write' or 'note that' unless it's a 'when I open…' line — then keep the full line>" }
Examples:
  "Write meeting notes for tomorrow" → { "text": "meeting notes for tomorrow" }
  "Add buy groceries" → { "text": "buy groceries" }
  "Note: call dentist at noon" → { "text": "call dentist at noon" }
  "Make a note saying watching Breaking Bad" → { "text": "watching Breaking Bad" }
  "Create a note that says pick up dry cleaning" → { "text": "pick up dry cleaning" }
  "Jot down remember to call mom" → { "text": "remember to call mom" }
  "When I open Netflix remember to switch audio to Spanish" → { "text": "When I open Netflix remember to switch audio to Spanish" }
  "Next time I open Spotify listen to the new album" → { "text": "Next time I open Spotify listen to the new album" }

━━━ MODE: app_control ━━━
User is commanding the app to perform a navigation or UI action.
Trigger words/patterns: "go back", "new note", "delete", "undo", "show agent", "navigate", "move", "folder".
payload: { "action": "<action_id>", "params": { ... } }

Available action_ids (use ONLY these):
  "back"                — go back to list view
  "new_note"            — create a new blank note
  "delete"              — delete the currently selected item
  "undo"                — undo the last delete
  "focus_agent"         — open/focus the Jot Agent panel
  "open_folder_view"    — open the folder organize view
  "close_view"          — close current panel
  "navigate"            — move selection; params: { "direction": "up"|"down", "count": <number> }

Examples:
  "Go back" → { "action": "back" }
  "Show agent" → { "action": "focus_agent" }
  "Move down 3" → { "action": "navigate", "params": { "direction": "down", "count": 3 } }

━━━ MODE: agent ━━━
User wants to query or instruct the AI agent. Implies search, organization, analysis, or multi-note operations.
Trigger words/patterns: "find", "search", "organize", "show me", "what", "how many", "compile", "summarize", "move all", "list all".
payload: { "query": "<the full instruction, verbatim>" }
Examples:
  "Find all my notes about Netflix" → { "query": "Find all my notes about Netflix" }
  "Organize my notes into folders" → { "query": "Organize my notes into folders" }

━━━ PRIORITY RULES ━━━
- "when I open X" / "next time I open X" / "remind me when I'm on X" → ALWAYS dictate (plain note; keywords surface it on the right screen)
- Time phrases ("at X PM", "every day at", "in X minutes") → ALWAYS scheduled (not dictate)
- Navigation/UI app commands → app_control
- Multi-note search/organize → agent
- Plain statements with no other pattern → dictate
- Return ONLY the raw JSON object.`;

function tryParseObject(str) {
  try {
    const v = JSON.parse(str);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  } catch (_) {}
  return null;
}

function parseClassification(raw) {
  let parsed = tryParseObject(raw.trim());

  // Strip markdown fences and retry
  if (!parsed) {
    const cleaned = raw
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/\s*```\s*$/m, '')
      .trim();
    parsed = tryParseObject(cleaned);
  }

  // Extract embedded JSON object
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

/**
 * Classify a voice transcript into mode + payload.
 *
 * @param {string} transcript
 * @returns {Promise<{ mode: string, payload: object, fallback?: boolean }>}
 */
async function classifyVoiceCommand(transcript) {
  if (!transcript || !transcript.trim()) {
    return {
      mode: 'error',
      payload: {
        message: 'No text to classify. Speak again or check the microphone.',
      },
    };
  }

  const trimmed = transcript.trim();
  const routed = deterministicAgentRoute(trimmed);
  if (routed) return routed;

  const dictateCtx = deterministicDictateRoute(trimmed);
  if (dictateCtx) return dictateCtx;

  let raw;
  try {
    raw = await callLLM(CLASSIFIER_SYSTEM_PROMPT, trimmed, []);
  } catch (err) {
    console.warn('[voiceCommand] LLM unavailable:', err.message);
    return {
      mode: 'error',
      payload: {
        message: `${describeLLMError(err, getConfig())} Voice commands need the LLM; fix config or type in the agent panel.`,
      },
    };
  }

  const parsed = parseClassification(raw);
  if (!parsed) {
    console.warn('[voiceCommand] Unparseable LLM response:', String(raw).slice(0, 120));
    return {
      mode: 'error',
      payload: {
        message:
          'Could not interpret that voice command. Rephrase, or open the agent panel and type your request.',
      },
    };
  }

  return { mode: parsed.mode, payload: parsed.payload };
}

module.exports = {
  classifyVoiceCommand,
  routeVoiceIntentDeterministic: deterministicAgentRoute,
  routeContextPhraseToDictate: deterministicDictateRoute,
};
