# Easy Jot — Contextual Memory OS

Local-first semantic memory. Press a key, capture a thought. Press another, find it by meaning.

---

## What it does

- **Capture** (`Cmd/Ctrl+E`) — floating textarea; type a thought, press Enter, it's saved and gone
- **Search** (`Cmd/Ctrl+K`) — type a query in plain English; results ranked by semantic similarity, not keywords
- **Context surface** — when you switch apps on macOS, a non-intrusive overlay surfaces the most relevant memory from the last 72 hours

Everything stays on your machine. No account, no cloud sync, no background service beyond the running app.

---

## Requirements

- **Node.js 18+** and **npm**
- **macOS** (primary — context surface uses AppleScript; capture and search work on all platforms)
- **OpenAI API key** for `text-embedding-3-small` (embeddings + search); get one at [platform.openai.com](https://platform.openai.com/api-keys)

---

## Setup

```bash
cd easy-jot
npm install
```

Set your API key (copy `.env.example` to `.env`, or export in your shell):

```bash
export OPENAI_API_KEY=sk-...
```

Start in dev mode:

```bash
npm run dev
```

The app starts hidden. Press **Cmd+E** to open the capture window.

---

## Usage

### Capture (`Cmd/Ctrl+E`)

| Key | Action |
|---|---|
| `Enter` | Save and close |
| `Shift+Enter` | New line |
| `Esc` | Close without saving |

Type naturally. Entries are saved to SQLite immediately; the embedding is generated in the background (~1–2 s). You can search right away once the embedding is ready.

**Auto-classification:** entries are tagged automatically —
- Starts with `idea:` → **idea**
- Contains *email / call / schedule / send* → **task**
- Everything else → **note**

**Reminder keywords:** include *tomorrow*, *next week*, or *later* and the entry gets a `remind_at` timestamp. A non-intrusive overlay fires when the time comes.

### Search (`Cmd/Ctrl+K`)

| Key | Action |
|---|---|
| `↑ / ↓` | Move through results |
| `Enter` | Copy selected entry to clipboard |
| `Esc` | Close |

Search uses cosine similarity over stored OpenAI embeddings — you can query by concept, not just exact words. Results include a type badge, entry text, and similarity score.

### Context overlay (macOS)

Every 2 seconds the app checks which app is in the foreground. When it changes, it maps the app name to a semantic context phrase and finds the most relevant recent memory (score ≥ 0.68, age ≤ 72 h). If one is found — and the same entry hasn't been surfaced in the last 5 minutes — a transparent overlay appears in the top-right corner for 6 seconds.

Supported app → context mappings:

| Frontmost app | Context phrase |
|---|---|
| Chrome | `browser email web` |
| Mail | `email communication` |
| Code (VS Code, etc.) | `coding programming` |

---

## How it works

```
Main process (Node.js + Electron)
├── main/index.ts        — windows, shortcuts, IPC, context polling, reminder loop
├── db/index.ts          — SQLite: insertEntry, getAllEntries, getDueReminders, clearRemindAt
├── services/
│   ├── embedding.ts     — OpenAI text-embedding-3-small → number[]
│   ├── classifier.ts    — classifyEntry (task/note/idea), extractRemindAt
│   └── contextMatcher.ts — semantic match of context phrase against stored embeddings
├── utils/
│   ├── activeApp.ts     — macOS: osascript frontmost app name (3 s timeout)
│   └── similarity.ts    — cosineSimilarity(a, b): number
└── preload/index.ts     — contextBridge → window.memory API

Renderer (Chromium + React + Vite)
└── renderer/src/
    ├── App.tsx          — hash-based routing: #capture | #search | #overlay
    ├── Capture.tsx      — textarea, Enter/Esc handling, saveEntry IPC
    ├── Search.tsx       — debounced query (180 ms), result list, copy on Enter
    └── Overlay.tsx      — transparent card, listens for overlay:show IPC event
```

**Save path** (non-blocking):

```
User presses Enter
  → entry:save IPC
  → insertEntry() synchronous (SQLite write, UUID, timestamp, null embedding)
  → window hides immediately
  → scheduleEmbedding() fires async: generateEmbedding → updateEntryMeta
```

**Search path**:

```
User types query (debounced 180 ms)
  → entry:search IPC
  → generateEmbedding(query) → OpenAI
  → getAllEntries() filtered to rows with embedding
  → cosineSimilarity(queryEmb, entryEmb) for each
  → sort descending, return top 5
```

**Context path** (macOS only):

```
setInterval 2 s
  → getActiveAppName() via osascript
  → if changed: activeAppToContextPhrase(appName)
  → getRelevantEntries(phrase, rows, { minScore: 0.68, maxAgeHours: 72, limit: 2 })
  → if match found and not surfaced recently: showOverlay(text)
```

---

## Project structure

| File | Purpose |
|---|---|
| `main/index.ts` | Electron main process — windows, global shortcuts, IPC handlers, context polling, reminder loop |
| `preload/index.ts` | `contextBridge` → `window.memory` (saveEntry, search, hideCapture, hideSearch, copyText, onFocusInput, onOverlayShow) |
| `db/index.ts` | SQLite singleton — `entries` table, `remind_at` migration, CRUD functions |
| `services/embedding.ts` | `generateEmbedding(text)` — POST to OpenAI `text-embedding-3-small`, returns `number[]` |
| `services/classifier.ts` | `classifyEntry(text)` → task/note/idea; `extractRemindAt(text)` → ISO string or null |
| `services/contextMatcher.ts` | `activeAppToContextPhrase(app)`; `getRelevantEntries(phrase, rows, opts)` |
| `utils/activeApp.ts` | `getActiveAppName()` — macOS osascript, returns `''` on failure or non-macOS |
| `utils/similarity.ts` | `cosineSimilarity(a, b)` — dot product / (norm_a * norm_b) |
| `renderer/src/App.tsx` | Route: `#capture` → Capture, `#search` → Search, `#overlay` → Overlay |
| `renderer/src/Capture.tsx` | Textarea, auto-focus on show, Enter save, Esc close |
| `renderer/src/Search.tsx` | Query input, 180 ms debounce, result list with ↑↓/Enter/Esc |
| `renderer/src/Overlay.tsx` | Transparent card, subscribes to `overlay:show` IPC, auto-hide handled by main |
| `scripts/build-electron.mjs` | esbuild: `main/index.ts` → `dist-electron/main.js` (ESM), `preload/index.ts` → `dist-electron/preload.cjs` (CJS) |
| `vite.config.ts` | Vite: root `renderer/`, output `dist/renderer/`, port 5173 |

---

## NPM scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server + esbuild watch + Electron (hot-reload for renderer; rebuild main on changes) |
| `npm run build` | Production build: `build:electron` then `build:renderer` |
| `npm run build:electron` | esbuild compile of main + preload only |
| `npm run build:renderer` | Vite production build of renderer only |
| `npm run start` | Run the production build (`NODE_ENV=production electron .`) |
| `npm run pack` | `build` then `electron-builder --dir` (no DMG) |

---

## Configuration

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | OpenAI key — used for `text-embedding-3-small` in `services/embedding.ts` |

Set via environment variable or create a `.env` file in this directory (already gitignored):

```bash
cp .env.example .env
# then edit .env and set OPENAI_API_KEY=sk-...
```

No other configuration is needed for local development.

---

## Database

SQLite at `~/Library/Application Support/easy-jot/easy-jot.db` (macOS) or `{userData}/easy-jot.db` (other platforms).

```sql
CREATE TABLE entries (
  id         TEXT PRIMARY KEY,
  content    TEXT,
  created_at DATETIME,
  updated_at DATETIME,
  type       TEXT,        -- 'task' | 'note' | 'idea'
  embedding  TEXT,        -- JSON number[] from text-embedding-3-small; NULL until async job completes
  remind_at  DATETIME     -- NULL or ISO timestamp set by extractRemindAt(); cleared once shown
);
```

`remind_at` is added via a migration if it doesn't exist, so existing databases are upgraded automatically.

---

## Key constants (main/index.ts)

| Constant | Value | Meaning |
|---|---|---|
| `CONTEXT_POLL_MS` | 2000 ms | How often the frontmost app is checked |
| `CONTEXT_MIN_SCORE` | 0.68 | Minimum cosine similarity to surface a memory |
| `CONTEXT_MAX_AGE_HOURS` | 72 h | Maximum age of entries eligible for context surfacing |
| `SURFACE_DEBOUNCE_MS` | 5 min | Minimum time before the same entry is surfaced again |
| `OVERLAY_DISMISS_MS` | 6000 ms | How long the overlay stays visible |
| `REMINDER_TICK_MS` | 60 000 ms | How often due reminders are checked |

---

## Relation to the root Jot app

This directory is a self-contained app. The repository root contains **Jot v1** — a different app: voice-first sticky notes with context triggers and a GPT agent. Both apps use the `easy-jot` name and share the SQLite app-support directory name, but they run independently and have separate `package.json` files, build configs, and databases.

To run Jot v1, `cd` to the repo root and follow its [README](../README.md).

---

## License

ISC — see [LICENSE](../LICENSE).
