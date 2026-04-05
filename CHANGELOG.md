# Changelog

All notable changes to this project will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

---

## [2.0.0] — 2026-04-05

**v2 timeline:** Development on `main` uses **2.x**. Branch **`v1`** and tag **`v1.0.0`** mark the frozen **1.x** line for maintenance and backports.

### Fixed
- **BUG-3**: Race condition in `showList()` — `currentNote` captured in `savedNote` at the start of the function; only nulled after the async LLM call if the user has not started a new note in the meantime. Prevents a new note from being orphaned when Back is pressed while `parseIntent` is in flight.

### Added
- `LICENSE` file (ISC) matching `package.json` license field.
- `npm run smoke` — fast pure-JS test suite (no native module rebuild); covers executor, keybinds, reminder parser, scheduler logic, trigger engine, voice command, voice deterministic, context map.
- `.gitignore` entries for `.env`, `.env.*`, `*.pem`, `*.p12`, `*.key`, `electron-builder.env`, `deep-research-report*.md`, `agent-transcripts/`.
- Config status bar now shows actionable setup hint (config path + env var names) when no API keys are configured.

### Changed
- **Voice vs LLM keys**: Speech-to-text uses **Smallest AI Pulse only** (`smallestAiKey`). `openaiApiKey` is for the **GPT** agent and intent parsing only (Whisper STT fallback removed). Env alias `EASY_JOT_SMALLEST_AI_KEY` supported.
- **Workflow watcher**: **ChatGPT Atlas** (`com.openai.atlas`) supported for active-tab URL → context triggers; see `docs/macos-workflow-setup.md` for macOS Accessibility + Automation.
- `docs/known-issues.md` reorganized: all fixed bugs (BUG-1 through BUG-12) moved to a **Fixed Bugs** section; Open Bugs section is now empty at v1.0.

### Added
- `voice.js` — Smallest AI Pulse STT as primary speech-to-text provider; OpenAI Whisper as fallback
- `tts.js` — Smallest AI Lightning TTS; WAV returned to renderer for Web Audio API playback
- `config.js` — single source of truth for all API keys and provider settings (env vars + config.json)
- `intentParser.js` — LLM-based extraction of `{ trigger, content, category }` from voice transcripts
- `triggerEngine.js` — canonical trigger IDs (`netflix_open`, `linkedin_open`, `gmail_open`, `work_start`, `general`), normalization helper, and display metadata
- `tts.js` phrase builders — `buildSaveConfirmation()` and `buildTriggerReadout()` for natural spoken output
- `scheduler.js` — 30-second polling loop for scheduled reminders; stale-detection auto-deactivates once-reminders missed by > 1 hour
- `reminderParser.js` — deterministic regex parser for natural-language time expressions ("in 30 minutes", "every day at 10 PM", "tomorrow at 8 AM")
- Scheduled reminder CRUD: create, toggle pause/resume, delete, manual test-fire via UI
- Jot type filter bar (All / Notes / Triggers / Scheduled) with localStorage persistence
- Jot detail view for trigger and scheduled jots (read-only with actions)
- Context trigger simulation buttons (Netflix, LinkedIn, Gmail, Work) in agent panel
- Dark floating notification overlay for trigger read-backs (auto-dismisses after 8s)
- Amber floating notification for scheduled reminders (auto-dismisses after 10s)
- STT provider badge in voice review bar ("Pulse STT" or "Whisper")
- Config status bar — shows TTS/STT provider status on launch; warning if no keys configured
- Smart note routing on Back: content parsed as reminder → scheduled reminder; as trigger intent → intent memory; otherwise saved as note
- `intelligence-query-help` IPC handler — routes shortcut/keybind queries to prose LLM response with full keybinds context
- Microphone permission request on macOS at app startup (better UX than prompting mid-flow)

### Changed
- App renamed from "Easy Jot" / "Jotty Agent" to **Jot — Voice Memory Agent**
- `database.js` extended with `intent_memories` and `scheduled_reminders` tables
- `llm.js` refactored to use `config.js`; Ollama support via baseURL swap
- `intentParser.js` now sources trigger IDs from `triggerEngine.js` (eliminated duplication)
- Agent panel now routes to `intelligenceQueryStructured` for action queries and `intelligenceQueryHelp` for shortcut/help queries
- Folder filter persists to `localStorage` across sessions
- README completely rewritten with architecture diagram, API key matrix, and demo script

### Fixed
- Voice button event listener race condition (double-start guard via `voiceActive` flag)
- `setFolderFilter()` now persists to `localStorage` (was missing direct assignment)
- Empty note created by image picker correctly deleted before opening file dialog

---

## [0.5.0] — 2026-02-23

### Added
- Keybind help via AI agent: queries containing "shortcut", "keybind", "how do I" route to a prose LLM response that includes all registered shortcuts
- Contextual Escape: in editor → back to list; in folder organize view → close view; in agent panel → focus jot pane
- Folder organize view (Cmd+F): multi-note management, create folder with description, batch assignment

### Changed
- Agent panel uses `intelligenceQueryStructured` → `intelligenceExecute` pipeline for action commands
- Escape key behavior made contextual (was: always closed window)

---

## [0.4.0] — 2026-02-22

### Added
- AI agent side panel (Cmd+J to toggle)
- `intelligence/executor.js` — executes structured action arrays: `search`, `create_note`, `create_folder`, `move_note_to_folder`, `organize_into_folders`
- `llm.js` structured output mode with multi-pass JSON extraction and fallback
- Ollama support (local LLM, no OpenAI key required for agent)
- Window resize when agent panel opens (600px wide) / closes (320px)

### Changed
- App renamed from Easy Jot to Jotty Agent

---

## [0.3.0] — 2026-02-21

### Added
- Folder system: create, rename, assign notes to folders
- Folder filter bar with pill navigation (Ctrl+Tab to cycle)
- Cmd+S saves and opens folder picker inline
- `folder_id` column added to `notes` table via safe migration

---

## [0.2.0] — 2026-02-20

### Added
- Global hotkey `Cmd+E` to toggle window
- Image notes: paste from clipboard or pick via file dialog (Cmd+I); stored as base64
- Cmd+Z undo delete (in-session stack)
- Delete / Backspace key in list deletes selected note
- Arrow key navigation in note list
- Auto-save on window blur
- Empty note on Back auto-deleted

### Changed
- App renamed from original P0 to Easy Jot
- Window is frameless, always-on-top, starts hidden

---

## [0.1.0] — 2026-02-20

### Added
- P0 sticky-note app: create, edit, delete text notes
- SQLite persistence via `better-sqlite3` (WAL mode)
- Auto-save with 500ms debounce
- `contextIsolation: true`, `nodeIntegration: false`, all DB access via IPC
