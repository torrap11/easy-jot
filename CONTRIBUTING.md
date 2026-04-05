# Contributing to Jot

## Dev Setup

```bash
git clone <repo>
cd jot
npm install       # also runs electron-rebuild for better-sqlite3
npm start
```

Requires Node.js 18+ and Xcode Command Line Tools (`xcode-select --install`) for the native SQLite build.

Create your config at `~/Library/Application Support/easy-jot/config.json` — see [README.md](README.md#configuration). Never commit this file; it contains API keys.

For a **maintainer “full v1.0” oneshot** (gap analysis, BUG-3, docs, gitignore, release hygiene), use **[docs/claude-code-full-product-oneshot-prompt.md](docs/claude-code-full-product-oneshot-prompt.md)** as the task prompt for Claude Code or similar.

## Project Structure

```
main.js                  Electron main process — window, hotkeys, IPC
preload.js               Context bridge — exposes window.api
database.js              SQLite CRUD — all four tables
config.js                Config loader — env vars > config.json > defaults
voice.js                 STT — Smallest AI Pulse only (OpenAI is GPT agent only)
tts.js                   TTS — Smallest AI Lightning, returns WAV buffer
intentParser.js          LLM → { trigger, content, category }
triggerEngine.js         Canonical trigger IDs, normalizeTrigger()
scheduler.js             30s reminder poll loop
reminderParser.js        Deterministic regex time parser
keybinds.js              Shortcut definitions (data only, no logic)
intelligence/
  executor.js            Action dispatcher for agent commands
renderer/
  index.html             DOM
  renderer.js            All UI logic (~1400 lines)
  style.css              Styles
docs/                    Technical docs
dev-docs/                Product strategy docs
```

## Architecture Principles

- **Main/renderer split**: all Node.js, DB, and API calls in main process; renderer communicates only via `window.api` (IPC). Never add `nodeIntegration: true`.
- **config.js is the only config source**: add new settings there. Re-reads disk on every call intentionally (hot reload without restart).
- **TTS and STT are optional**: every code path where they're called must handle `null` return gracefully.
- **triggerEngine.js owns trigger IDs**: if you add a trigger, add it there. Don't add parallel maps in tts.js or renderer.js.
- **reminderParser.js is deterministic**: no LLM. Keep it pure regex so it's testable and predictable. The renderer has a client-side copy (`parseReminderNLClient`) — keep them in sync.

## Code Style

- Vanilla JS (no TypeScript, no bundler, no framework)
- `async/await` for all async code; no raw `.then()` chains
- IPC channel names: `kebab-case` (e.g., `'save-intent-memory'`)
- Functions and variables: `camelCase`
- DOM IDs: `kebab-case`
- Always use `escapeHtml()` when inserting user text into `innerHTML`
- Prefer `const` over `let`; avoid `var`

## Making Changes

### Adding an IPC handler
1. Add the handler in `main.js` with `ipcMain.handle('channel-name', ...)`
2. Expose it in `preload.js` via `contextBridge.exposeInMainWorld`
3. Call it from `renderer.js` via `window.api.methodName()`

### Adding a trigger
1. Add to `TRIGGER_LABELS` and `TRIGGER_ICONS` in `triggerEngine.js`
2. Add the button to the trigger demo section in `renderer/index.html`
3. Add the context string to `TRIGGER_CONTEXT` in `tts.js`

### Adding a config option
1. Add to the return object in `getConfig()` in `config.js`
2. Document in `README.md` config table

## Known Issues to Fix

See [docs/known-issues.md](docs/known-issues.md). All numbered bugs (BUG-1 through BUG-12) are fixed. New bugs should be added to the **Open Bugs** section of that file with the next available number.

## Running Tests

```bash
# Fast smoke suite — pure-JS tests, no native module rebuild needed
npm run smoke

# Full suite — rebuilds better-sqlite3 first, then runs all tests including DB tests
npm test
```

**`npm run smoke`** runs the tests that require only Node.js and no native modules or Electron GUI:
`test-executor`, `test-keybinds`, `test-reminder-parser`, `test-scheduler-logic`, `test-trigger-engine`, `test-voice-command`, `test-voice-deterministic`, `test-context-map`.

**`npm test`** additionally runs `test-database` which requires `better-sqlite3` to be compiled for the current Electron ABI. If `npm test` fails with a native module error, run `xcode-select --install` and then `npm install` (which triggers `electron-rebuild` via the `postinstall` hook). Tests that require the native module will not pass in a CI environment without a Xcode toolchain.

---

## Easy Jot v2 (easy-jot/)

The `easy-jot/` subdirectory is a separate, standalone Electron app with its own `package.json`, TypeScript source, React renderer, and SQLite database.

### Dev setup

```bash
cd easy-jot
npm install          # rebuilds better-sqlite3 for current Electron ABI (postinstall)
export OPENAI_API_KEY=sk-...   # or copy .env.example → .env
npm run dev          # Vite dev server + esbuild watch + Electron
```

### Project structure

| File | Purpose |
|---|---|
| `main/index.ts` | Main process — windows, shortcuts, IPC, context poll, reminder loop |
| `preload/index.ts` | `contextBridge` → `window.memory` API |
| `db/index.ts` | SQLite — `entries` table, `remind_at` migration, CRUD |
| `services/embedding.ts` | OpenAI `text-embedding-3-small` → `number[]` |
| `services/classifier.ts` | Rule-based type tagging + reminder keyword extraction |
| `services/contextMatcher.ts` | Semantic match of app-context phrase vs. stored embeddings |
| `utils/activeApp.ts` | macOS: osascript frontmost app name |
| `utils/similarity.ts` | `cosineSimilarity(a, b)` |
| `renderer/src/App.tsx` | Hash router: `#capture` / `#search` / `#overlay` |
| `renderer/src/Capture.tsx` | Textarea capture UI |
| `renderer/src/Search.tsx` | Semantic search results UI |
| `renderer/src/Overlay.tsx` | Transparent context reminder card |

### Architecture principles

- **Same Electron security model**: `contextIsolation: true`, `nodeIntegration: false` on all three windows. All Node.js work in `main/index.ts`.
- **ESM main, CJS preload**: `main/index.ts` compiles to ESM (`dist-electron/main.js`); `preload/index.ts` compiles to CJS (`dist-electron/preload.cjs`) because Electron's preload must be CJS.
- **Hash-based window routing**: one renderer bundle handles all three windows via `window.location.hash` (`#capture`, `#search`, `#overlay`).
- **Save never blocks the UI**: `insertEntry()` is synchronous SQLite; `scheduleEmbedding()` is a detached async call. The capture window hides before the network round-trip.
- **TypeScript throughout**: strict mode, ESNext target, `@types/better-sqlite3` for DB, `vite-env.d.ts` for `window.memory` types.

### Build commands

| Command | What it does |
|---|---|
| `npm run build:electron` | esbuild compile of `main/index.ts` + `preload/index.ts` only |
| `npm run build:renderer` | Vite production build of renderer |
| `npm run build` | Both of the above in sequence |
| `npm run start` | Run the production build |
| `npm run pack` | `build` then `electron-builder --dir` (no DMG) |

### Adding a feature (IPC pattern)

1. Add an `ipcMain.handle('channel:name', ...)` handler in `main/index.ts`
2. Expose it in `preload/index.ts` via `contextBridge.exposeInMainWorld('memory', { ... })`
3. Add the TypeScript signature to the `window.memory` interface in `renderer/src/vite-env.d.ts`
4. Call it from a React component via `window.memory.methodName(...)`

### Testing

There are no automated tests for v2 yet. Manual smoke test:

1. `npm run dev`
2. Press `Cmd+E` → type something → Enter (should save and close)
3. Wait ~2 s for embedding → press `Cmd+K` → type a related query → confirm results appear
4. Type an entry with *tomorrow* in it → confirm overlay fires ~60 s later

The root `npm run smoke` covers v1 only.

---

## Commit Conventions

```
<type>: <short description>

Types: feat, fix, refactor, docs, style, test, chore
```

Examples:
```
feat: add browser extension trigger source
fix: delete key dispatches to correct jot type
docs: update architecture diagram for scheduler
refactor: split renderer.js into focused modules
```

Keep commits atomic — one logical change per commit. Don't mix feature work with unrelated fixes.

## Pull Requests

- Branch from `main`
- Reference any issue or bug ID from `docs/known-issues.md` in the PR description
- Test the happy path for the feature you changed
- If you add a config option, update `README.md`
- If you change IPC channels, update `preload.js` and `docs/architecture.md`
