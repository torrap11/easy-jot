# Claude Code: context detection (apps + websites), remove quick-jot, UX fixes

Attach this file and grant full repo access. Use the **short user prompt** at the bottom after attaching.

---

## Role

You are implementing product and engineering changes to **Jot**, an Electron + SQLite desktop app (`main.js`, `preload.js`, `renderer/`, `workflowWatcher.js`, `triggerEngine.js`, `intelligence/executor.js`, `llm.js`, `voiceCommand.js`). Read `README.md`, `docs/architecture.md`, and `docs/known-issues.md` before editing.

---

## A. Remove global `Cmd+Shift+N` (“quick jot”) completely

The product owner wants **no** global `Command+Shift+N`. In-app **`Cmd+N`** remains the way to create a note when the window is focused.

**Do:**

1. **`main.js`** — Remove `sendQuickJot`, `globalShortcut.register('Command+Shift+N', …)`, and any related comments.
2. **`preload.js`** — Remove `onQuickJot` and the `quick-jot` IPC listener.
3. **`renderer/renderer.js`** — Remove `window.api.onQuickJot(…)` and any logic that only existed for that event.
4. **`keybinds.js`** — Remove the `Cmd+Shift+N` entry from `global`.
5. **`docs/architecture.md`**, **`README.md`**, **`renderer/index.html`** (titles/tooltips) — Remove references to `Cmd+Shift+N` / quick jot.
6. **`tests/test-keybinds.js`** — Add an assertion that **`Cmd+Shift+N` is not** listed in `keybinds` (global or inApp). Keep existing tests valid.

**Do not** register a replacement global shortcut unless explicitly asked.

---

## B. Detect context from **native apps** and **websites** (unified pipeline)

**Goal:** When the user works in a **mapped native app** or visits a **mapped website** (active browser tab), Jot should fire the **same** match-and-surface pipeline as today’s `runTrigger` / `simulate-trigger` (reuse `normalizeTrigger`, `getIntentMemoriesByTriggerFiltered` for auto, keyword fallback, overlay UI, snooze/done/why).

### B1. Unified context event shape

Introduce a small, explicit shape used everywhere (watcher, extension, manual test IPC if useful), e.g.:

```ts
// Conceptual — implement in JS
{ source: 'app' | 'domain', raw: string, triggerHint?: string }
// raw examples: bundle id, app name, hostname "netflix.com", full URL (normalize to registrable domain)
```

Normalize to a **canonical trigger id** (`netflix_open`, `gmail_open`, …) in **one** module (extend `triggerEngine.js` or add `contextMap.js`) so you do not scatter string matching across the codebase.

### B2. Native apps (improve existing watcher)

Today `workflowWatcher.js` maps **frontmost process display name** only. Improve robustness where feasible on **macOS**:

- Prefer **bundle identifier** when obtainable (e.g. via `osascript` / System Events) in addition to name, to avoid collisions.
- Keep opt-in config **`workflowWatcherEnabled`** (default `false`).
- Document **Accessibility** (and any other) permissions in README.

Debounce / cooldown behavior should remain sensible; document changes if you adjust constants.

### B3. Websites (required deliverable)

**Opening netflix.com in a browser** must be able to surface Netflix-related memories the same way the native Netflix app would (same trigger id after normalization).

Pick **one primary approach** that you can ship and document:

**Recommended (reliable):** A minimal **Chromium extension** (Manifest V3) that:

- Reads the **active tab URL** on tab activation and navigation.
- Sends **hostname or registrable domain** to the Electron app via **native messaging** (register a native host manifest that launches a small Node script or the app’s helper — follow Electron/nativeMessaging patterns).

**Acceptable fallback for MVP:** AppleScript (or similar) to read the **front browser’s URL** for **one** supported browser (e.g. Chrome) with clear **version fragility** called out in README — only if you cannot ship an extension in this pass, but **netflix.com → trigger** must still work in dev.

**Domain → trigger map:** Maintain a configurable map, e.g. `netflix.com` → `netflix_open`, `mail.google.com` / `gmail.com` → `gmail_open`, `linkedin.com` → `linkedin_open`, etc. Reuse existing trigger ids from `triggerEngine.js`.

**Security:** Never execute arbitrary code from the extension; validate messages; reject non-HTTP(S) or absurd lengths; no full page content by default — **URL / hostname only**.

### B4. What “screenread” means in scope (important)

The user asked to “screenread and detect.” **Do not** implement full-screen OCR, continuous screen recording, or scraping arbitrary window pixels as part of this task — that raises trust, performance, and platform-review risk.

**In scope for “read what matters for triggers”:**

- **Foreground app identity** (name + bundle id).
- **Active web context** (tab URL → hostname / registrable domain).
- Optional **stretch:** read **focused window title** via Accessibility-safe APIs **only** for trigger heuristics (e.g. contains “Netflix”), with user-visible toggle and clear privacy note — **only if** URL-based detection is insufficient and time allows.

**Out of scope:** ambient lifelogging, keystroke logging, full page text extraction.

---

## C. Silent trigger surfacing (no spoken read-aloud for context alerts)

The product owner does **not** want **TTS playback** when context-triggered jots appear (manual simulate + workflow auto + domain auto).

**Do:**

- Add config, e.g. **`speakTriggerMemories`: boolean** default **`false`** (or name consistently with existing config style). When `false`, **`runTrigger`** must not synthesize audio for the notification payload (or pass `audioData: null`), and the renderer must **not** call `playAudioBuffer` for trigger notifications.
- **Scheduled reminders** and **voice save confirmations** may keep TTS unless the README states otherwise; scope this change to **trigger / workflow surfacing** unless the user explicitly asked to mute everything (they did not in the latest message — only alerted jots).

Document the flag in README.

---

## D. Cmd+M voice: actually run organizer / agent actions (not always a plain jot)

**Problem:** LLM classifier failures or mis-routes fall back to **dictate** and create a note; organizer phrases never reach `intelligenceExecute`.

**Do:**

1. **Classifier robustness:** Improve `voiceCommand.js` prompts and/or add a **deterministic pre-pass** (keyword/regex) for high-confidence routes: e.g. “organize my notes”, “create folder”, “list reminders”, “search my notes” → **`agent`** mode with the full transcript as `query`, without waiting for a flaky JSON shape when pattern matches.
2. **LLM failure UX:** If `classifyVoiceCommand` cannot call the LLM, **do not** silently dump the entire utterance into a new note without confirmation — show an error that LLM/STT pipeline failed and suggest checking keys/network (align messaging with agent “Connection error” improvements below).
3. **`executeCmdAgent` path:** Ensure that when mode is `agent`, the app **runs the same structured query + execute path** as the agent panel (and handles panel focus correctly).

---

## E. Agent “Connection error” — actionable diagnostics

**Do:**

- When `intelligence-query-structured` (or underlying `callLLMWithStructuredOutput`) fails, surface a **clearer** message in the UI than a bare `Connection error.` where possible: distinguish **no API key**, **Ollama disabled/unreachable**, **timeout**, **DNS/network**, **401/invalid key** (if available from SDK error), without leaking secrets.
- Optionally add a **config status** line in the agent error bubble (“OpenAI: unreachable”, “Ollama: connection refused to localhost:11434”, etc.).

---

## F. Documentation and tests

1. **`README.md`** — Sections for: removed shortcut; domain detection + **how to install/load the extension** (or AppleScript limitations); permissions; new config keys; trigger TTS off by default for context alerts.
2. **`docs/architecture.md`** — Update IPC list, new modules, context pipeline diagram in prose.
3. **Tests** — Extend `node:test` suites: domain normalization unit tests; executor unchanged unless you add actions; any pure JS context mapping should have tests. Mock or skip native messaging in CI if needed, but keep logic tested.

---

## G. Constraints

- **`contextIsolation: true`**, no `nodeIntegration` in renderer.
- Validate all IPC and extension/native-messaging payloads.
- No secrets in repo; document `config.json` only in userData.
- Avoid unrelated refactors; touch only files needed for the above.

---

## H. Definition of done (checklist)

- [ ] `Cmd+Shift+N` removed end-to-end; tests and docs updated.
- [ ] Visiting **netflix.com** (or mapped domain) in a **supported** browser path fires the **same** trigger pipeline as Netflix app / manual button (with watcher + extension/host enabled).
- [ ] Native app detection improved or unchanged-but-documented; still opt-in via config.
- [ ] Context alerts **do not** speak TTS when config default / `speakTriggerMemories` false.
- [ ] Voice “organize / create folder / search notes” routes to **agent execution**, not a blind jot, when phrasing matches; LLM-down path shows a **clear error**, not silent jot.
- [ ] Agent errors are **more informative** than generic “Connection error.”
- [ ] `npm test` passes.

---

## Short user prompt (paste with this attachment)

You have `docs/claude-code-context-and-ux-prompt.md` attached. Implement **all** sections A–H in one cohesive pass: remove global `Cmd+Shift+N`; add **website + improved app** context detection with a **unified trigger pipeline**; keep scope to URL/app/title heuristics — **no** full-screen OCR; **disable TTS** for context-trigger surfacing by default via config; fix **Cmd+M** routing to the **agent/executor** for organizer-style phrases and improve **LLM failure** UX; improve **agent connection** error messages; update **README**, **architecture**, and **tests**. Run `npm test` before finishing. Start with a short plan listing files you will add or change, then implement.
