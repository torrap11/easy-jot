# Jot

A local-first, always-on-top desktop app for capturing and recalling intentions by voice.

Everything you capture is a **jot** to you: plain notes, timed reminders, or “when I’m on Netflix…”. Under the hood the app sorts them so the right ones can surface when you switch apps or sites (if the workflow watcher is on). Context alerts are **silent by default**; set `speakTriggerMemories` if you want TTS. The AI agent still works across all your jots.

Built with Electron, SQLite, Smallest AI Waves (Pulse STT + Lightning TTS), and OpenAI.

---

## Quick Start

**Requirements**: Node.js 18+, macOS (Windows/Linux: Cmd → Ctrl shortcuts)

```bash
git clone <repo>
cd jot
npm install
```

Create the config file at `~/Library/Application Support/easy-jot/config.json`. You can start from the repo template **`config.example.json`** (copy and rename), which includes `"workflowWatcherEnabled": true` for context surfacing.

```json
{
  "openaiApiKey": "sk-...",
  "smallestAiKey": "your-smallest-ai-key"
}
```

```bash
npm start
```

The app hides in the background with no dock icon. Press **Cmd+E** to show it.

### Downloadable app (no Terminal)

To produce a **`.app` / `.dmg`** other people can install without Node or `npm start`:

```bash
npm install
npm run dist
```

Open **`dist/`** for the DMG and ZIP. Full notes (Ollama vs cloud, signing): [docs/releasing.md](docs/releasing.md).

See [Configuration](#configuration) for all options and the [API key matrix](#api-keys) for what each key enables.

---

## What It Does

### Voice memory
Use the in-app **mic** or global **`Cmd+M`** → speak → review transcript → save. The LLM extracts a trigger context when relevant. Save confirmations can use TTS if Smallest AI is configured.

### Context triggers
Click a trigger button (Netflix, LinkedIn, Gmail, Work) to simulate that context. With **`workflowWatcherEnabled`**, Jot can also detect the **frontmost macOS app** and the **active tab URL** in supported browsers (Chrome, Safari, Brave, Edge, Arc) via AppleScript — e.g. **netflix.com** maps to the same trigger as the Netflix app. See [Workflow Watcher](#workflow-watcher-automatic-trigger-surfacing).

### Scheduled reminders
Write `at 10 PM remind me to drink water` and press Back. Jot parses the time automatically, converts the note to a scheduled reminder, and fires it at the right time with a spoken notification.

### Notes and folders
Plain text and image notes with folder organization, autosave, and Cmd+Z undo. An AI agent accepts natural-language commands to search, create, and organize.

---

## Keyboard Shortcuts

### Global (work in any app)

| Shortcut | Action |
|---|---|
| `Cmd+E` | Show / hide Jot |
| `Cmd+M` | Universal voice command (dictate, set reminder, save memory, or prompt agent) |

### In-app

| Shortcut | Action |
|---|---|
| `Cmd+N` | New note |
| `Cmd+I` | New note from image file |
| `Cmd+S` | Save + open folder picker |
| `Cmd+Z` | Undo last delete |
| `Cmd+F` | Toggle folder organize view |
| `Cmd+J` | Focus / open AI agent panel |
| `Escape` | Contextual: note → list → folder view → close |
| `↑ / ↓` | Navigate note list |
| `Enter` | Open selected note |
| `Delete / Backspace` | Delete selected note (in list) |
| `Ctrl+Tab` | Cycle folder filter forward |
| `Ctrl+Shift+Tab` | Cycle folder filter backward |

---

## Configuration

Config is read from `~/Library/Application Support/easy-jot/config.json` on every API call. Environment variables take precedence.

```json
{
  "openaiApiKey":          "sk-...",
  "smallestAiKey":         "...",
  "model":                 "gpt-4o-mini",
  "useOllama":             false,
  "ollamaBaseURL":         "http://localhost:11434/v1",
  "ttsVoice":              "emily",
  "ttsSampleRate":         24000,
  "sttLanguage":           "en",
  "workflowWatcherEnabled": false,
  "speakTriggerMemories":   false
}
```

| Key | Env var | Default | Description |
|---|---|---|---|
| `openaiApiKey` | `EASY_JOT_OPENAI_API_KEY` | — | OpenAI API key |
| `smallestAiKey` | `SMALLEST_AI_KEY` or `EASY_JOT_SMALLEST_AI_KEY` | — | Smallest AI key (Pulse STT + Lightning TTS only) |
| `model` | — | `gpt-4o-mini` | OpenAI GPT model id for agent + intent parsing |
| `useOllama` | `EASY_JOT_USE_OLLAMA=1` | `false` | Use local Ollama instead of OpenAI |
| `ollamaBaseURL` | — | `http://localhost:11434/v1` | Ollama endpoint |
| `ttsVoice` | — | `emily` | Smallest AI voice ID |
| `ttsSampleRate` | — | `24000` | TTS audio sample rate |
| `sttLanguage` | — | `en` | STT language code (BCP-47) |
| `workflowWatcherEnabled` | — | `false` | Auto-detect frontmost app + browser tab URL (supported browsers) and surface matching memories. Requires Accessibility (see below). |
| `speakTriggerMemories` | — | `false` | When `true`, context-trigger overlays use TTS read-back. Default is silent overlays. |

### API keys

| Feature | Provider | Key needed |
|---|---|---|
| Voice STT | Smallest AI Pulse | `smallestAiKey` only |
| TTS read-back | Smallest AI Lightning | `smallestAiKey` |
| AI agent + intent parsing | OpenAI GPT (`model` in config) | `openaiApiKey` |
| AI agent (local, no cloud) | Ollama | none |

**Minimum for full stack**: `smallestAiKey` (voice + TTS) and `openaiApiKey` (GPT agent). You can use either alone for partial features.

### Ollama (local LLM)

```bash
ollama pull llama3.2
```

Set `"useOllama": true` in config.json. Note: Ollama has no STT or TTS — voice still needs `smallestAiKey`.

### Workflow Watcher (automatic trigger surfacing)

Set `"workflowWatcherEnabled": true` in config.json to enable automatic surfacing when your **foreground context** matches a known trigger.

**Step-by-step (macOS permissions + Atlas):** see [docs/macos-workflow-setup.md](docs/macos-workflow-setup.md).

**Required permission**: System Settings → Privacy & Security → **Accessibility** → enable for your **Jot** app, **Electron** (dev), or **Terminal** if you start the app from there. AppleScript needs this to read the frontmost app.

**Automation** (Privacy & Security → **Automation**): allow Jot/Electron/Terminal to control each browser you use (**ChatGPT Atlas**, Chrome, Safari, Brave, Edge, Arc, Chromium) so Jot can read the **active tab URL**.

**Native apps** (process name / bundle id): Netflix, Spotify, Slack, VS Code, Xcode, Microsoft Teams → same mapping as before.

**Websites** (active tab URL via AppleScript): when the frontmost app is **ChatGPT Atlas**, **Google Chrome, Safari, Brave Browser, Microsoft Edge, Arc, or Chromium**, Jot reads the tab URL and maps the hostname — e.g. `netflix.com`, `open.spotify.com`, `mail.google.com`, `linkedin.com`. This is **best-effort** and can break with browser updates; there is no browser extension in this repo.

**Cooldown**: 30 minutes per canonical trigger id. **Snooze / Done / Why?** on the overlay still apply.

**Silent by default**: context overlays do not call TTS unless you set `"speakTriggerMemories": true`.

---

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full module map, IPC flow, and data models.

```
Main process (Node.js)
├── main.js          — window lifecycle, global shortcuts, IPC handlers
├── database.js      — SQLite (better-sqlite3), 4 tables
├── llm.js           — OpenAI / Ollama client
├── config.js        — reads env + config.json on every call
├── voice.js         — Pulse STT (Smallest AI only)
├── tts.js           — Lightning TTS, returns WAV buffer
├── intentParser.js  — LLM → structured { trigger, content, category }
├── triggerEngine.js — canonical trigger IDs and normalization
├── scheduler.js     — 30s poll for scheduled reminders
├── reminderParser.js — deterministic regex time parser
├── keybinds.js      — shortcut definitions (data only)
├── contextMap.js    — hostname / bundle id → canonical trigger id
├── workflowWatcher.js — osascript: front app + browser URL → runTrigger, 30-min cooldown
└── intelligence/
    └── executor.js  — action dispatcher (search, create, move, organize, memories, reminders)

preload.js           — contextBridge: exposes window.api (contextIsolation: true)

Renderer (Chromium)
└── renderer/
    ├── index.html   — DOM structure
    ├── renderer.js  — all UI logic (~1400 lines)
    └── style.css    — sticky-note aesthetic
```

---

## Data Storage

```
~/Library/Application Support/easy-jot/
├── easy-jot.db      — SQLite database (WAL mode)
└── config.json      — API keys and settings (never commit this file)
```

Database tables: `notes`, `folders`, `intent_memories`, `scheduled_reminders`.

---

## Troubleshooting

**App doesn't appear**
Press `Cmd+E`. Check the terminal for startup errors.

**Microphone not working**
macOS: System Settings → Privacy & Security → Microphone → enable for Electron or your terminal.

**"Voice input needs a Smallest AI key"**
Add `smallestAiKey` to config.json (or `SMALLEST_AI_KEY` / `EASY_JOT_SMALLEST_AI_KEY`). OpenAI is not used for STT.

**TTS not speaking**
TTS requires `smallestAiKey`. Check the status bar at the top of the app.

**"No LLM configured"**
Add `openaiApiKey` to config.json, or set `"useOllama": true`.

**`npm install` fails (native module error)**
`better-sqlite3` requires native compilation. Make sure Xcode Command Line Tools are installed: `xcode-select --install`. The `postinstall` script runs `electron-rebuild` automatically.

**Workflow watcher never fires on a website**
Ensure `workflowWatcherEnabled` is `true`, Accessibility is granted, and the browser allows **Automation** for Jot/Electron when macOS prompts. AppleScript tab URLs can fail on some browser versions — try Google Chrome first.

**Context triggers are silent**
Default is no TTS on trigger overlays. Set `"speakTriggerMemories": true` in config.json if you want spoken read-back.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

See [docs/roadmap.md](docs/roadmap.md).

## Known Issues

See [docs/known-issues.md](docs/known-issues.md).
