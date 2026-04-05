# Known Issues

Bugs are numbered for reference in commit messages and PRs. Severity: Critical / High / Medium / Low.

---

## Open Bugs

*No open bugs. See [Fixed Bugs](#fixed-bugs) below.*

---

## Design Limitations (not bugs, but worth tracking)

| Limitation | Notes |
|---|---|
| No undo for intent memories or scheduled reminders | Undo stack covers notes only |
| `embedding` column in `intent_memories` populated but unused | Reserved for semantic search (M5) |
| Trigger IDs are hardcoded | Adding a trigger requires code changes in 3 places |
| reminderParser logic duplicated in main and renderer | `reminderParser.js` and `parseReminderNLClient()` in renderer.js must be kept in sync manually |
| Partial test coverage | Tests cover executor, database, trigger-engine, scheduler logic, voice command, context map. renderer.js and main.js untested |
| macOS-only shortcuts | `Cmd+` shortcuts don't map for Windows/Linux |
| Single window | No multi-window support |
| No config encryption | `config.json` stores API keys in plain text |

---

## Fixed Bugs

### BUG-3 — Race condition in `showList()` during LLM call ✓ FIXED
**Severity**: Medium
**File**: `renderer/renderer.js` (`showList`)

`showList()` called `window.api.parseIntent()` which takes ~1-3s. If the user created a new note (clicked +) before the LLM responded, `currentNote` was set to the new note. When `showList()` resumed, it set `currentNote = null`, orphaning the new note reference and breaking autosave.

**Fix**: `savedNote` captures `currentNote` at the start of `showList()`. All operations use `savedNote`. The final `currentNote = null` only runs when `currentNote === savedNote` (i.e., the user has not started a new note during the async call).

---

### BUG-1 — Delete key called wrong IPC for trigger/scheduled jots ✓ FIXED
**Severity**: High
**File**: `renderer/renderer.js` (keydown handler)

Delete key in the note list dispatches to `deleteNote`, `deleteIntentMemory`, or `deleteScheduledReminder` based on `jot.jotType`.

---

### BUG-2 — Enter key opened trigger/scheduled jots in text editor ✓ FIXED
**Severity**: High
**File**: `renderer/renderer.js` (keydown handler)

Enter key now dispatches to `openNote` for `jotType === 'note'` and `openJotDetail` for trigger/scheduled jots.

---

### BUG-4 — Duplicate `formatScheduleLabel` function ✓ FIXED
**Severity**: Low
**File**: `renderer/renderer.js`

Duplicate removed; single definition kept.

---

### BUG-5 — Daily reminders could double-fire in non-UTC timezones ✓ FIXED
**Severity**: Medium
**File**: `scheduler.js`

`markReminderTriggered` stored `datetime('now')` (UTC). The "already fired today" check compared a UTC date substring against a local date string, causing a mismatch for users west of UTC.

**Fix**: `todayDateStr()` now returns UTC date so comparisons are consistent.

---

### BUG-6 — No size limit on image notes ✓ FIXED
**Severity**: Medium
**File**: `main.js` (`create-note-from-image` handler)

Images larger than 2 MB are rejected before base64 encoding. An error is returned to the renderer.

---

### BUG-7 — Back button not disabled during async `showList()` ✓ FIXED
**Severity**: Low
**File**: `renderer/renderer.js` (`showList`)

`backBtn.disabled = true` set at the start; restored in `finally` block. Prevents two concurrent `showList()` invocations from double-clicking Back.

---

### BUG-8 — `normalizeTrigger` partial match fired on common words ✓ FIXED
**Severity**: Medium
**File**: `triggerEngine.js`

Word-boundary regex (`\b${root}\b`) replaces `String.includes(root)`. "homework" no longer maps to `work_start`.

---

### BUG-9 — Agent request had no timeout ✓ FIXED
**Severity**: Low
**File**: `renderer/renderer.js` (`sendAgentMessage`)

30-second `AbortController`-style timeout via `Promise.race`. UI restores to ready state with an error message on timeout.

---

### BUG-10 — `app.dock.hide()` called before `app.ready` ✓ FIXED
**Severity**: Low
**File**: `main.js`

Moved into `app.whenReady().then(...)`.

---

### BUG-11 — `intelligence-query` IPC handler registered but never called ✓ FIXED
**Severity**: Low
**File**: `main.js`

Dead handler removed. Renderer uses `intelligence-query-structured` and `intelligence-query-help` exclusively.

---

### BUG-12 — `_cached` variable declared but never used in `config.js` ✓ FIXED
**Severity**: Low
**File**: `config.js`

Unused variable removed.
