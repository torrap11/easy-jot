# Architecture

## Runtime Model

Jot uses the standard Electron security model: a Node.js main process and a sandboxed Chromium renderer with no direct Node access.

```
┌─────────────────────────────────────────────────────────────────┐
│ MAIN PROCESS (Node.js)                                          │
│                                                                 │
│  main.js                                                        │
│  ├── BrowserWindow (320×260, frameless, always-on-top)         │
│  ├── globalShortcut: Cmd+E (toggle), Cmd+M (voice)            │
│  ├── 28 ipcMain.handle() handlers                              │
│  ├── startScheduler() → 30s reminder poll                      │
│  ├── startWatcher() → 2s osascript poll (if enabled)           │
│  └── systemPreferences.askForMediaAccess (macOS)               │
│                                                                 │
│  Supporting modules (all main-process only):                    │
│  database.js · llm.js · config.js · voice.js · tts.js          │
│  intentParser.js · triggerEngine.js · scheduler.js             │
│  reminderParser.js · keybinds.js · intelligence/executor.js    │
│  contextMap.js · workflowWatcher.js                             │
└──────────────────────┬──────────────────────────────────────────┘
                       │ IPC (contextIsolation: true)
                       │ preload.js — contextBridge → window.api
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ RENDERER (Chromium, sandboxed)                                  │
│  renderer/index.html + renderer.js + style.css                  │
│  — All UI, voice recording, audio playback, state management    │
│  — No direct Node.js or DB access                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Module Responsibilities

| Module | Responsibility |
|---|---|
| `main.js` | Window lifecycle, global shortcuts, all IPC handler registration, scheduler startup |
| `preload.js` | Context bridge — exposes `window.api` with typed wrappers for every IPC channel |
| `database.js` | SQLite singleton (better-sqlite3, WAL mode). All CRUD. Lazy `getDb()` init with safe migrations |
| `config.js` | Re-reads `userData/config.json` + env vars on every call. Single source for all settings |
| `llm.js` | OpenAI SDK client. `callLLM()`, `callLLMWithStructuredOutput()`, `describeLLMError()` for user-facing agent errors |
| `voice.js` | `transcribeAudio(Buffer)` — Smallest AI Pulse only. Returns `{ transcript, words, provider: 'pulse' }` |
| `tts.js` | `synthesize(text)` — Lightning TTS → WAV Buffer. `speakSaveConfirmation()`, `speakTriggerReadout()` phrase builders |
| `intentParser.js` | `parseIntent(transcript)` — LLM call → `{ trigger, content, category }`. Falls back to raw transcript if LLM unavailable |
| `triggerEngine.js` | Canonical trigger IDs, labels, icons, keyword lists. `normalizeTrigger(input)` maps free-text to trigger ID |
| `contextMap.js` | Maps browser hostnames and bundle IDs to the same trigger IDs; `resolveWorkflowTrigger()` picks domain → bundle → app-name map |
| `scheduler.js` | 30s `setInterval` poll. `isDue()`, `isStale()`. Fires TTS + sends `reminder-due` IPC to renderer. Initial poll after 5s |
| `reminderParser.js` | Deterministic regex parser: "in X min/hours", "every day at HH:MM", "tomorrow at HH:MM", "at HH:MM". No LLM |
| `keybinds.js` | Exports `{ global, inApp }` arrays. Data only — no logic. Used by agent help handler |
| `intelligence/executor.js` | `executeActions(actions, db)` — dispatches `search`, `create_note`, `create_folder`, `move_note_to_folder`, `organize_into_folders`, `web_search`, `search_memories`, `list_memories`, `delete_memory`, `list_reminders`, `search_reminders`, `toggle_reminder`, `delete_reminder` |
| `workflowWatcher.js` | Polls every 2s: frontmost process name + bundle id; for supported browsers, AppleScript reads active tab URL. Uses `contextMap.resolveWorkflowTrigger()` then `runTrigger(id, 'auto', contextLabel)`. 30-min per-trigger cooldown. Opt-in `workflowWatcherEnabled` |
| `renderer/renderer.js` | All UI: note list, editor, voice flow, trigger notifications, reminder notifications, agent panel, folder management, audio playback |

---

## IPC Channel Reference

| Channel | Direction | Handler | Description |
|---|---|---|---|
| `get-notes` | R→M | `db.getAllNotes()` | All notes, ordered by updated_at DESC |
| `create-note` | R→M | `db.createNote(content)` | Returns new note row |
| `update-note` | R→M | `db.updateNote(id, content)` | Returns updated row |
| `delete-note` | R→M | `db.deleteNote(id)` | Hard delete |
| `restore-note` | R→M | `db.restoreNote(note)` | Re-inserts with original id (undo) |
| `create-folder` | R→M | `db.createFolder(name, desc)` | |
| `update-folder` | R→M | `db.updateFolder(id, name, desc)` | |
| `get-folders` | R→M | `db.getAllFolders()` | |
| `update-note-folder` | R→M | `db.updateNoteFolder(noteId, folderId)` | |
| `get-notes-by-folder` | R→M | `db.getNotesByFolder(folderId)` | `null` = unfiled |
| `create-note-from-image` | R→M | `dialog.showOpenDialog` + base64 encode | Returns new note row |
| `transcribe-audio` | R→M | `voice.transcribeAudio(buf)` | `{ transcript, words, provider }` |
| `parse-intent` | R→M | `intentParser.parseIntent(text)` | `{ intent }` |
| `save-intent-memory` | R→M | `db.createIntentMemory` + `tts.speakSaveConfirmation` | `{ memory, audioData }` |
| `simulate-trigger` | R→M | `runTrigger(..., 'manual')` — TTS only if `speakTriggerMemories` | `{ trigger, label, icon, memories, audioData, source }` |
| `get-intent-memories` | R→M | `db.getAllIntentMemories()` | |
| `delete-intent-memory` | R→M | `db.deleteIntentMemory(id)` | |
| `get-config-status` | R→M | `getConfig()` | No secrets — only booleans and provider names |
| `intelligence-query-structured` | R→M | `llm.callLLMWithStructuredOutput()` + memories/reminders context; errors via `describeLLMError` | `{ actions }` or `{ error }` |
| `intelligence-query-help` | R→M | `llm.callLLM()` with keybinds context | Prose response for shortcut queries |
| `intelligence-execute` | R→M | `executor.executeActions()` | Executes action array against DB |
| `resize-window` | R→M | `win.setBounds()` | 320→600px wide when agent panel opens |
| `create-scheduled-reminder` | R→M | `db.createScheduledReminder()` | |
| `get-scheduled-reminders` | R→M | `db.getAllScheduledReminders()` | |
| `delete-scheduled-reminder` | R→M | `db.deleteScheduledReminder(id)` | |
| `toggle-scheduled-reminder` | R→M | `db.activateReminder / deactivateReminder` | |
| `fire-reminder` | R→M | `scheduler.fireById()` | Manual test — no state change |
| `snooze-memory` | R→M | `db.snoozeMemory(id, minutes)` | Sets `snoozed_until` in the future |
| `dismiss-memory-done` | R→M | `db.markMemoryDone(id)` | Permanently suppresses auto-surfacing |
| `mark-memory-shown` | R→M | `db.markMemoryAutoShown(id)` | Records auto-surface timestamp for cooldown |
| `toggle-voice-capture` | M→R | `renderer: toggleVoiceCapture()` | Optional; main does not register a global shortcut for this channel |
| `reminder-due` | M→R | `renderer: showReminderNotification()` | Sent by scheduler when reminder fires |
| `workflow-trigger` | M→R | `renderer: showTriggerNotification()` | Sent by workflowWatcher when app switches |

---

## Data Models

### notes
```sql
CREATE TABLE notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  content    TEXT NOT NULL DEFAULT '',
  folder_id  INTEGER REFERENCES folders(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
```

### folders
```sql
CREATE TABLE folders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
)
```

### intent_memories
```sql
CREATE TABLE intent_memories (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  content           TEXT NOT NULL,
  trigger           TEXT NOT NULL DEFAULT 'general',
  category          TEXT NOT NULL DEFAULT 'other',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  note_id           INTEGER,
  embedding         TEXT,             -- reserved for future semantic search
  snoozed_until     TEXT,             -- ISO timestamp; NULL = not snoozed
  done              INTEGER NOT NULL DEFAULT 0,  -- 1 = permanently suppressed
  last_auto_shown_at TEXT             -- ISO timestamp; used for 30-min cooldown
)
```

Cooldown filtering (`getIntentMemoriesByTriggerFiltered`): excludes rows where `done = 1`, or `snoozed_until IS NOT NULL AND snoozed_until > datetime('now')`. Used for automatic workflow-watcher surfacing; manual trigger simulation uses the unfiltered query.

### scheduled_reminders
```sql
CREATE TABLE scheduled_reminders (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  content           TEXT NOT NULL,
  schedule_type     TEXT NOT NULL DEFAULT 'once',  -- 'once' | 'daily'
  scheduled_time    TEXT NOT NULL,                 -- ISO string (once) | 'HH:MM' (daily)
  active            INTEGER NOT NULL DEFAULT 1,
  last_triggered_at TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
)
```

---

## Voice pipeline (universal `Cmd+M`)

```
User: global Cmd+M (or in-app mic → same handler)
  main.js: sendToggleVoiceCommand() → win.webContents.send('toggle-voice-command')
  renderer: toggleVoiceCommand() → startVoiceCmd() / stopVoiceCmd / sendVoiceCmd
    MediaRecorder → window.api.transcribeAudio(ArrayBuffer)
      → voice.transcribeAudio (Pulse STT)
    window.api.classifyVoiceCommand(transcript)
      → voiceCommand.classifyVoiceCommand()
        → deterministic keyword pass → agent | (else) callLLM(JSON classifier)
        → on LLM/parse failure: { mode: 'error', payload.message } (no silent jot)
    executeCmdClassification():
      trigger   → saveIntentMemory + TTS confirmation
      scheduled → createScheduledReminder
      dictate   → createNote / insert at cursor
      app_control → navigate UI (back, simulate_trigger, …)
      agent     → showAgentPanel + sendAgentMessage() (structured LLM + execute)
      error     → showVoiceCmdError(...)
```

## Context → trigger pipeline (workflow watcher)

```
Every 2s (if workflowWatcherEnabled):
  osascript: frontmost process name + bundle id
  If browser (ChatGPT Atlas, Chrome, Safari, Brave, Edge, Arc, Chromium):
    osascript: URL of active tab
  contextMap.resolveWorkflowTrigger({ appName, bundleId, browserUrl, appNameToTrigger })
    → hostname / bundle / app-name → canonical trigger id
  On context change + cooldown OK:
    main.runTrigger(triggerId, 'auto', contextLabel)
      → memories + optional TTS if speakTriggerMemories
      → win.webContents.send('workflow-trigger', payload)
```

---

## Scheduler Flow

```
startScheduler() called at app.whenReady()
  setTimeout(poll, 5000)    — catch missed reminders from last session
  setInterval(poll, 30000)  — recurring check

poll():
  db.getActiveReminders()
  for each reminder:
    if isStale(reminder):    — once-reminder > 1h past due, never fired
      db.deactivateReminder()
    elif isDue(reminder):
      fireReminder(reminder)

fireReminder(reminder):
  db.markReminderTriggered()     — idempotent, prevents double-fire
  if once: db.deactivateReminder()
  tts.synthesize(content) → WAV
  win.webContents.send('reminder-due', { id, content, audioData })
  if !win.isVisible(): win.show(), win.focus()
```

`isDue` logic:
- **once**: `new Date(scheduled_time) <= now && !last_triggered_at`
- **daily**: `currentHHMM() === scheduled_time && !firedToday`

---

## Renderer State

```javascript
// Persistent (localStorage)
currentJotTypeFilter  // 'all' | 'notes' | 'triggers' | 'scheduled'
currentFolderFilter   // 'all' | null (unfiled) | number (folder id)

// Session (in-memory)
currentNote           // note object being edited, or null
currentJotDetail      // { type, data } for trigger/scheduled detail view
notes                 // unified jot list (notes + memories + reminders)
selectedIndex         // cursor in note list
deletedNotesStack     // undo stack (notes only)
folders               // folder list
voiceActive           // recording guard
folderOrganizeOpen    // folder organize view visible

// Session (sessionStorage)
agent chat HTML       // persisted across hot-reloads only
```

---

## Security Notes

- `contextIsolation: true`, `nodeIntegration: false` — renderer has no Node.js access
- All DB, API, and file system calls go through named IPC channels
- `escapeHtml()` used for all user-content rendered via `innerHTML`
- Parameterized SQL everywhere (better-sqlite3 prepared statements)
- API keys never sent to renderer — `get-config-status` returns only booleans
- config.json stored in userData (macOS file system permissions); not encrypted

---

## Easy Jot v2 (easy-jot/)

### Runtime Model

```
┌──────────────────────────────────────────────────────────────────┐
│ MAIN PROCESS (Node.js / ESM)                                     │
│                                                                  │
│  main/index.ts                                                   │
│  ├── CaptureWindow  (440×180, alwaysOnTop, backgroundColor dark) │
│  ├── SearchWindow   (520×400, alwaysOnTop)                       │
│  ├── OverlayWindow  (360×150, transparent, frameless, focusable:false) │
│  ├── globalShortcut: Cmd/Ctrl+E (capture), Cmd/Ctrl+K (search)  │
│  ├── startContextPolling()  — 2 s osascript + semantic match     │
│  └── startReminderLoop()   — 60 s due-reminder check            │
│                                                                  │
│  Supporting modules (main process only):                         │
│  db/index.ts · services/embedding.ts · services/classifier.ts   │
│  services/contextMatcher.ts · utils/activeApp.ts                 │
│  utils/similarity.ts                                             │
└────────────────────────┬─────────────────────────────────────────┘
                         │ IPC (contextIsolation: true)
                         │ preload/index.ts — contextBridge → window.memory
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│ RENDERER (Chromium + React 19, one bundle, three windows)        │
│  renderer/src/App.tsx — hash routing: #capture / #search / #overlay │
│  renderer/src/Capture.tsx   — textarea + save                    │
│  renderer/src/Search.tsx    — debounced query + result list      │
│  renderer/src/Overlay.tsx   — transparent card for context hints │
└──────────────────────────────────────────────────────────────────┘
```

### Module Responsibilities

| Module | Responsibility |
|---|---|
| `main/index.ts` | Window lifecycle (capture/search/overlay), global shortcuts, all IPC handlers, context polling loop, reminder check loop, overlay positioning and auto-hide |
| `preload/index.ts` | `contextBridge.exposeInMainWorld('memory', ...)` — typed API bridge for renderer |
| `db/index.ts` | SQLite singleton (`better-sqlite3`). `initDb`, `insertEntry`, `updateEntryMeta`, `getAllEntries`, `getDueReminders`, `clearRemindAt`. Runs `migrate()` to add `remind_at` if absent |
| `services/embedding.ts` | `generateEmbedding(text)` — POST to OpenAI `text-embedding-3-small`, returns `number[]`. Reads `OPENAI_API_KEY` from env |
| `services/classifier.ts` | `classifyEntry(text)` → `'task' \| 'note' \| 'idea'` (keyword rules). `extractRemindAt(text)` → ISO string or null (tomorrow / next week / later) |
| `services/contextMatcher.ts` | `activeAppToContextPhrase(app)` maps app name → phrase. `getRelevantEntries(phrase, rows, opts)` embeds phrase and scores rows by cosine similarity |
| `utils/activeApp.ts` | `getActiveAppName()` — macOS only; osascript with 3 s timeout; returns `''` on error or non-macOS |
| `utils/similarity.ts` | `cosineSimilarity(a, b)` — dot product normalised by L2 norms; returns 0 for zero-length vectors |
| `renderer/src/App.tsx` | Hash-based router for the shared renderer bundle |
| `renderer/src/Capture.tsx` | Textarea, `focus-input` IPC listener, Enter/Esc handling, `window.memory.saveEntry` |
| `renderer/src/Search.tsx` | `<input>`, 180 ms debounce, ↑↓ selection, Enter to copy, `window.memory.search` |
| `renderer/src/Overlay.tsx` | Transparent card, `window.memory.onOverlayShow` listener; hide handled by main (timer) |

### IPC Channel Reference

| Channel | Direction | Description |
|---|---|---|
| `entry:save` | R→M | Insert entry (sync); schedule embedding (async). Returns `{ ok, id }` or `{ ok, error }` |
| `entry:search` | R→M | Embed query → cosine similarity over stored embeddings → top 5 results with score and created_at |
| `window:hide-capture` | R→M | Hide capture window (ipcMain.on, not handle) |
| `window:hide-search` | R→M | Hide search window (ipcMain.on, not handle) |
| `clipboard:write` | R→M | Write text string to clipboard |
| `focus-input` | M→R | Main → renderer: focus the textarea / input on window show |
| `overlay:show` | M→R | Main → overlay renderer: set text and display card |

### Data Model

```sql
CREATE TABLE entries (
  id         TEXT PRIMARY KEY,       -- UUID
  content    TEXT,
  created_at DATETIME,
  updated_at DATETIME,
  type       TEXT,                   -- 'task' | 'note' | 'idea'
  embedding  TEXT,                   -- JSON number[] (null until async job completes)
  remind_at  DATETIME                -- added by migrate(); null or ISO timestamp
);
```

`remind_at` is added via an `ALTER TABLE` migration on first run if the column doesn't exist. Entries with `remind_at <= now` are fetched by `getDueReminders` and shown via overlay, then `clearRemindAt` nulls the column.

### Save Flow

```
1. User presses Enter in Capture
2. renderer → entry:save IPC (content string)
3. main: classifyEntry(content) → type; extractRemindAt(content) → remindAt
4. insertEntry(id, content, type, now, remindAt)   ← synchronous SQLite write
5. scheduleEmbedding(id, content)                  ← fires-and-forgets async
   └── generateEmbedding(content) → OpenAI API
   └── updateEntryMeta(id, type, embeddingJson, updatedAt)
6. Returns { ok: true, id } to renderer
7. Renderer clears textarea and hides window
```

### Search Flow

```
1. User types query (debounced 180 ms in Search.tsx)
2. renderer → entry:search IPC (query string)
3. main: generateEmbedding(query) → OpenAI API
4. getAllEntries() filtered to rows where embedding IS NOT NULL
5. JSON.parse(r.embedding) for each row → cosineSimilarity(queryEmb, entryEmb)
6. Sort descending; slice top 5
7. Returns { ok: true, results: [{id, content, type, score, created_at}, ...] }
```

### Context Polling Flow (macOS only)

```
setInterval(2 s):
  getActiveAppName() → osascript
  if appName === lastPolledApp: skip
  else: lastPolledApp = appName
    activeAppToContextPhrase(appName) → phrase or null
    if phrase:
      getRelevantEntries(phrase, getAllEntries(), { minScore: 0.68, maxAgeHours: 72, limit: 2 })
      if top match found and canSurface(top.id):  ← 5-min debounce per entry
        showOverlay(`👉 You wanted to: ${top.content}`)
```

### Key Constants

| Constant | Value | Purpose |
|---|---|---|
| `CONTEXT_POLL_MS` | 2 000 ms | Frontmost app polling interval |
| `CONTEXT_MIN_SCORE` | 0.68 | Cosine similarity threshold for context surface |
| `CONTEXT_MAX_AGE_HOURS` | 72 h | Max age of entries eligible for context surfacing |
| `SURFACE_DEBOUNCE_MS` | 300 000 ms (5 min) | Min time before same entry is surfaced again |
| `OVERLAY_DISMISS_MS` | 6 000 ms | Auto-hide duration for overlay window |
| `REMINDER_TICK_MS` | 60 000 ms | Due-reminder check interval |

### Security Notes (v2)

- Same `contextIsolation: true`, `nodeIntegration: false` model as v1
- `OPENAI_API_KEY` read from `process.env` in main process only; never reaches renderer
- Overlay window is `focusable: false` so it never steals keyboard focus
- `better-sqlite3` uses prepared statements; no string concatenation in queries
