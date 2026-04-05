# Claude Code — Full product completion (oneshot prompt)

Use this document as the **system task** for a single extended Claude Code session. Goal: move the repo from **“working internal MVP”** to a **coherent v1.0 product** that is safe to **open-source on GitHub** and **reasonable for friends/beta testers to install**, while closing documented gaps. Treat anything marked **Stretch** as lower priority than **Ship**.

---

## 0. How to run this session

1. Read this file end-to-end, then read **`README.md`**, **`docs/architecture.md`**, **`docs/known-issues.md`**, **`docs/releasing.md`**, **`docs/macos-workflow-setup.md`**, **`CONTRIBUTING.md`**, and **`docs/roadmap.md`**.
2. Work in **small, coherent commits** (or one squash-ready branch) with clear messages.
3. Run **`node --test tests/test-*.js`** for suites that do **not** require a fragile `better-sqlite3` rebuild; if native tests fail only in CI/sandbox, document that in **`CONTRIBUTING.md`** and prefer **pure-JS tests** for new logic.
4. **Never commit secrets.** Verify **`.gitignore`** covers `config.json`, `.env*`, signing keys, and local DBs. **`config.example.json`** must stay placeholder-only.
5. After changes, update **README**, **known-issues** (close or add BUGs), and **CHANGELOG** (`[Unreleased]`) where appropriate.

---

## 1. Product vision (north star)

**Jot** is a **local-first macOS desktop app** (Electron) for:

- **Keyboard- and voice-first capture** of notes and “intentions.”
- **Context-triggered recall**: when the user enters a matching **app/site workflow** (e.g. Netflix in browser or native app), surface the right **intent memories** and **keyword-matched notes**.
- **Time-based reminders** (once / daily) with optional **TTS**.
- A constrained **AI agent** over the user’s jots (OpenAI GPT or **local Ollama**), plus **LLM intent parsing** for voice-saved memories.

**Non-goals for v1.0 oneshot:** multi-user sync, mobile apps, full lifelogging, enterprise SSO, browser extensions (unless listed as Stretch), and embedding-based semantic search at scale (see roadmap M5+).

---

## 2. Current codebase — what already exists (baseline)

Summarize from the repo (do not re-implement unless broken):

| Area | Implementation |
|------|----------------|
| **Data** | SQLite (`notes`, `folders`, `intent_memories`, `scheduled_reminders`); WAL; migrations in `database.js`. |
| **Notes / folders** | CRUD, images (size-capped), folder moves, unified “jot” list with types note / trigger / scheduled. |
| **Voice** | Smallest AI **Pulse STT** only (`voice.js`). **Lightning TTS** (`tts.js`). |
| **Intent memories** | `intentParser.js` + `save-intent-memory`; triggers from `triggerEngine.js`. |
| **Manual triggers** | UI + `simulate-trigger` → `runTrigger` in `main.js`. |
| **Auto workflow** | `workflowWatcher.js` + `contextMap.js` (apps + **browser tab URL**); supports **ChatGPT Atlas** and major browsers; opt-in `workflowWatcherEnabled`. |
| **Snooze / done / why** | Intent rows: `intent_memories`. Note keyword matches: `notes.context_snoozed_until`, `context_no_auto_surface` + IPC `snooze-context-note` / `dismiss-context-note`. |
| **Reminders** | `reminderParser.js` + client mirror `parseReminderNLClient`; `scheduler.js` poll; `reminder-due` IPC. |
| **Agent** | `llm.js` + `intelligence/executor.js` + renderer agent UI; structured actions. |
| **Packaging** | `electron-builder`; `npm run dist`; **`mac.identity: null`** (unsigned) documented for iCloud-path builds; `scripts/electron-after-pack.js`. |
| **Docs** | README, architecture, known-issues, releasing, macos workflow setup, roadmap, CONTRIBUTING. |

---

## 3. Desired “v1.0 full product” (definition of done)

### 3.1 Ship blockers (must complete in oneshot)

1. **Close or downgrade all misleading “open” items in `docs/known-issues.md`.**  
   - Many BUGs are marked fixed but still under “Open Bugs” — **reorganize** into Open / Fixed with accurate line references or remove stale snippets.
2. **Fix BUG-3** (`showList()` race during `parseIntent`): capture note identity at start, **re-entrancy guard**, and ensure `currentNote` cannot be orphaned when the user starts a new note mid-flight.
3. **First-run / empty config UX (minimal):**  
   - If no LLM and no Smallest key, show a **short, accurate** in-app message (reuse or extend config status bar) pointing to **`config.example.json`** path and env var names — **no secrets in UI**.
4. **Ollama operator path:**  
   - When `useOllama: true`, if `localhost:11434` (or configured base) is unreachable, agent and intent paths should surface **`llm.describeLLMError`-style** messaging (already partially there — **verify end-to-end** from renderer).
5. **README accuracy pass:**  
   - Align feature list with code (e.g. **ChatGPT Atlas**, note snooze/done, voice/OpenAI split, unsigned DMG caveat, **two-terminal dev** vs **single `.app`**).
6. **`.gitignore` hardening:**  
   - Add patterns for `.env`, `.env.*`, `*.pem`, `*.p12`, `electron-builder.env`, and any local “secrets” filenames you introduce. Ensure **`deep-research-report*.md`** or other internal research files are **either** committed intentionally **or** ignored — pick one and document.
7. **Release hygiene:**  
   - `docs/releasing.md`: one clear path for **maintainer** (signed vs unsigned), **“do not build from iCloud”**, and **beta testers** (Right-click Open).  
   - Optional: **`LICENSE`** file if missing (MIT or ISC to match `package.json`).

### 3.2 Strong should-haves (if time permits)

1. **Agent panel + global shortcuts:** Ensure **Cmd+N**, **Cmd+E**, etc. work when agent input is focused (stop propagation where needed); document behavior.
2. **Reminder / parser parity:** Audit **`reminderParser.js`** vs **`parseReminderNLClient`** for drift; add tests for any new patterns (e.g. “in N mins”, “remind me …”).
3. **Workflow watcher observability:** Optional **dev-only** log toggle in config (`workflowDebug: true`) printing resolved trigger + suppressed reasons (cooldown, empty matches) — **no PII**, no full URLs in production log if you consider that sensitive (hostname only).
4. **Smoke test script:** `npm run smoke` that runs **node tests** that never need Electron GUI (all `tests/test-*.js` that are pure JS).

### 3.3 Stretch (only after Ship + Should-have)

1. **Chrome/Safari extension** for tab events → native messaging → Electron (roadmap M3 Option B). Large scope; separate PR unless explicitly prioritized.
2. **Calendar-based triggers** (M3 Option C).
3. **Embeddings / semantic trigger matching** (M5).
4. **Windows/Linux parity** for global shortcuts and any watcher equivalent.
5. **Apple notarization + hardened runtime** CI on a **non-iCloud** builder; restore **`mac.identity`** from env / CI secrets.

---

## 4. Gap matrix (current vs desired)

| Theme | Current | v1.0 target |
|-------|---------|-------------|
| **Trust / docs** | Mixed BUG status; some README drift | Clean known-issues; README = source of truth |
| **Stability** | BUG-3 race | Fixed + regression note |
| **Onboarding** | Config file only | Clear empty-config + Ollama-down messaging |
| **Security / OSS** | `config.json` ignored | Expanded gitignore; no secrets in tree |
| **Distribution** | Unsigned DMG works | Documented; optional LICENSE |
| **Roadmap M3** | Watcher + Atlas + AppleScript | Done for macOS web/native map; extension = stretch |
| **Roadmap M4** | Snooze/done/cooldown/why | Done; verify edge cases |
| **M5–M7** | Not implemented | Explicitly post-v1 |

---

## 5. Technical constraints (do not violate)

- **Electron security:** keep `contextIsolation: true`, no `nodeIntegration` in renderer; all DB access in main.
- **API keys:** only `config.json` + env; never log key material.
- **Voice:** STT remains **Smallest-only**; GPT keys are **agent/intent only** (see `config.js` / `voice.js`).
- **Native module:** `better-sqlite3` + `asarUnpack` — do not break packaged app load path.
- **Signing:** do not commit Apple certificates; CI signing via secrets only.

---

## 6. Suggested execution order

1. Audit and **rewrite `docs/known-issues.md`** (structure + BUG-3 only in Open if still open).
2. Implement **BUG-3 fix** in `renderer/renderer.js` (+ test if you can extract pure logic).
3. **Config / Ollama UX** pass (renderer + `llm.js` / IPC error paths).
4. **README + CONTRIBUTING + CHANGELOG** sync.
5. **`.gitignore` + LICENSE** + research file policy.
6. **Optional:** debug flag, smoke script, shortcut focus fix.
7. Full **`node --test`** run (scope per CONTRIBUTING); fix failures you introduce.
8. Optional **`npm run dist`** from a **non-iCloud clone** to verify pack still works.

---

## 7. Success criteria (checklist before merge)

- [ ] No real API keys or tokens in any tracked file.
- [ ] `docs/known-issues.md` reflects reality; BUG-3 fixed or explicitly documented workaround.
- [ ] New user can follow README + `config.example.json` + `macos-workflow-setup.md` without reading source.
- [ ] `npm start` dev flow still works.
- [ ] `npm run dist` completes (unsigned acceptable for v1.0 beta).
- [ ] Tests you rely on pass locally; documented if some tests require full native toolchain.

---

## 8. Explicit non-goals for this oneshot

Do **not** treat the following as required to call the oneshot “done” unless the user overrides this file:

- Shipping **notarized** macOS builds in CI.
- Bundling **Ollama** inside the DMG.
- **Cloud sync** or **mobile** clients.
- **Semantic embeddings** on all memories.
- **Rewriting** `renderer.js` into React/Svelte (stay vanilla unless a bug forces a small refactor).

---

*End of prompt. Execute methodically; prefer correctness and documentation over feature creep.*
