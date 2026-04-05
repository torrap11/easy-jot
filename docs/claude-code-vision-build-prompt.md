# Claude Code: plan + one-shot build per component

Copy everything below the line into Claude Code (or attach this file + grant repo access).

---

You are working in the **Jot** repository: an **Electron** desktop app (`main.js`, `preload.js`, `renderer/`), **SQLite** via `better-sqlite3` (`database.js`), LLM integration (`llm.js`), voice (`voice.js`, `tts.js`), intent memories and triggers (`intentParser.js`, `triggerEngine.js`), scheduler (`scheduler.js`), and an AI executor (`intelligence/executor.js`). Read `README.md`, `docs/architecture.md`, and `docs/known-issues.md` before changing behavior.

## Product target (authoritative)

Build toward this **narrow** vision:

1. **Keyboard shortcuts** — Rich, documented shortcuts to control the app (navigation, capture, agent, folders, dismiss surfaces) without relying only on the mouse.
2. **Quick jotting** — Fast path to create and save short notes with minimal friction (global shortcut, inline capture, sensible defaults).
3. **AI-driven control** — User prompts an assistant that can run **safe, structured actions** against the local DB: query/search across **notes, intent memories, and scheduled reminders**, reorganize (folders, moves), and other actions you add that are clearly scoped and auditable. Prefer structured tool/action output from the LLM → validated executor, not raw SQL from the model.
4. **Workflow-aware surfacing** — The app **observes** real workflow signals (e.g. frontmost macOS app and/or browser domain via an agreed integration path) and **automatically** fires the same match-and-surface pipeline that today is only reached via **`simulate-trigger`** manual buttons. Include UX for **snooze**, **done**, and **“why did I see this?”** so surfacing is tolerable day-to-day.

## Non-goals (do not implement unless explicitly asked)

- Team collaboration, real-time sync, mobile apps, encrypted cloud sync.
- Full “app control” automation (driving other apps’ UIs, AppleScript macros) beyond what is needed to **detect** context for triggers.
- Ambient recording or screen lifelogging beyond explicit user-initiated voice capture and permissioned context signals.

## How to work

For **each** of the four numbered capabilities above:

1. **Plan** — Write a short plan (files to touch, IPC additions, data model changes if any, risks). Call out dependencies (e.g. workflow surfacing depends on trigger event shape staying stable).
2. **One-shot build** — Implement that plan in a **single cohesive pass** for that component: code + wiring + minimal tests where the repo already uses `node --test` (`tests/test-*.js`). Fix or file follow-ups for any `docs/known-issues.md` items you touch.
3. **Verify** — `npm test` and manual smoke steps you document in the plan (e.g. “press shortcut X”, “switch to app Y and confirm overlay”).

Process the components in this **order** (dependency order):

1. Keyboard shortcuts + quick jotting (foundation for everything else).
2. AI DB control (executor + LLM schema + preload IPC as needed).
3. Workflow watching → automatic triggers → surface pipeline reuse.
4. Surfacing polish: snooze, done, cooldown, explanation string in UI.

## Definition of done (whole effort)

- New or updated shortcuts are listed in **README** and surfaced in the in-app agent help path if one exists.
- AI actions can **read** and **reorganize** user data across notes + intent memories + scheduled reminders within the executor’s allowed action types (extend `intelligence/executor.js` and `llm.js` structured output accordingly).
- At least **one** real workflow signal is wired end-to-end on **macOS** (document required permissions, e.g. Accessibility if you use frontmost-app APIs).
- Automatic surfacing reuses existing **match + TTS/overlay** behavior where possible; no duplicate business logic for “what to show.”
- No new secrets committed; config remains user-local.

## Constraints

- Match existing code style and patterns; avoid unrelated refactors.
- Keep security: `contextIsolation`, no `nodeIntegration` in renderer; validate all IPC payloads.
- Prefer small, explicit trigger/event types (e.g. `{ type, value }`) compatible with `triggerEngine.js` / `database.js` query patterns.

Begin with **Component 1**: audit current `keybinds.js` and `renderer/renderer.js`, list gaps vs the vision, then plan and execute the one-shot build. Proceed to Components 2–4 in order, repeating plan → build → verify for each.
