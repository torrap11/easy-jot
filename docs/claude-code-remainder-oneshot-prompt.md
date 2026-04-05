# Claude Code: remainder plan + single-session full build

Attach this file to Claude Code with repo access. Use the **short user prompt** at the bottom after attaching.

---

## Role

You are a senior engineer completing the **Jot** (Easy Jot) Electron app. Prior work may have landed **Component 1** (keyboard shortcuts + quick jotting) from `docs/claude-code-vision-build-prompt.md`. Your job is to **discover what is already done**, **write a concise remainder plan**, then **implement everything still missing** in one continuous pass: code, tests, IPC, schema migrations if needed, README, and updates to `docs/known-issues.md`.

## Authoritative product target

Align with `docs/claude-code-vision-build-prompt.md`:

1. **Keyboard shortcuts + quick jotting** — Assume partially or fully done; verify and fill gaps only.
2. **AI-driven control** — Structured LLM actions → validated executor. Must **query and reorganize** across **notes**, **intent memories**, and **scheduled reminders** (not notes-only search). No raw SQL from the model.
3. **Workflow-aware surfacing** — **Real** workflow signal(s) on **macOS** (e.g. frontmost app bundle ID/name → map to existing trigger IDs via `triggerEngine.js`). Automatically invoke the **same** pipeline as `simulate-trigger` (reuse `db.getIntentMemoriesByTrigger` + existing TTS/overlay path). Document **Accessibility** or other permissions.
4. **Surfacing polish** — **Snooze** (resurface after N minutes), **Done** (suppress memory for future automatic triggers), **Cooldown** (optional but preferred: same trigger+memory not shown again for N minutes), **“Why did I see this?”** (human-readable: trigger source + matched memory id/summary). Keyboard-accessible controls where feasible.

## Non-goals (do not build)

- Team sync, mobile apps, encrypted cloud sync, embeddings/semantic search (unless trivial additive), behavioral learning / weekly digests, driving other apps’ UIs beyond **detection** for triggers, ambient recording.

## Phase 0 — Recon (mandatory, do first)

1. Read: `README.md`, `docs/architecture.md`, `docs/claude-code-vision-build-prompt.md`, `docs/known-issues.md`.
2. Skim: `main.js`, `preload.js`, `database.js`, `llm.js`, `intelligence/executor.js`, `triggerEngine.js`, `scheduler.js`, `renderer/renderer.js`, `keybinds.js`.
3. Produce a **short inventory** (bullet list): what already satisfies components 1–4 vs what is missing. If git history is available, note recent commits touching shortcuts/renderer.

## Phase 1 — Remainder plan (mandatory, before large edits)

Write a **Remainder plan** (structured sections below). Keep it under ~800 words but **specific** (file paths, new IPC names, schema columns).

### Plan template (fill in)

- **A. AI / executor** — New `VALID_TYPES`, payloads, DB methods needed, changes to `llm.js` structured schema and system prompt, preload surface.
- **B. Workflow watcher** — How frontmost app is obtained (e.g. `osascript`, `node-mac-permissions`, small native helper—justify choice for Electron 40+ on macOS), polling interval, debouncing, mapping bundle ID → trigger id, failure modes when permission denied.
- **C. Surfacing + state** — DB columns or new table for `snoozed_until`, `dismissed_done`, `last_auto_shown_at`; how automatic path calls existing notification/overlay code; UI controls and shortcuts.
- **D. Hardening** — Which open items in `docs/known-issues.md` you will fix in this pass (see checklist below).
- **E. Verification** — `npm test` plus a numbered manual smoke list for macOS.

## Phase 2 — Implementation order

Execute in this order to minimize rework:

1. **Database + migrations** — Safe additive migrations in `database.js` (existing style). Any new fields for memory lifecycle (done/snooze/cooldown).
2. **`intelligence/executor.js` + `llm.js`** — Extend structured actions; implement read/update paths for intent memories and scheduled reminders (list, search, delete, move to folder if applicable, toggle reminder—only what schema supports). Keep actions whitelisted.
3. **Workflow watcher (main process)** — New module e.g. `workflowWatcher.js`; start/stop with config flag; emit internal events → normalize to same shape as manual `simulate-trigger` input; **dedupe** rapid app switches.
4. **IPC + preload** — Expose only what renderer needs; validate payloads.
5. **Renderer** — Wire auto-surface UI; snooze/done/why; settings or status for “workflow watching on/off” if appropriate.
6. **README + architecture** — Shortcuts, permissions, new config keys.
7. **Tests** — Add or extend `tests/test-*.js` for: executor new actions (mock db), trigger normalization if touched, scheduler timezone fix if touched, reminder parser if shared.
8. **`docs/known-issues.md`** — Mark fixed bugs **✓ FIXED** with one-line note or remove dead entries; add new known issues if you defer something critical.

## Technical constraints

- **Security**: keep `contextIsolation: true`, no `nodeIntegration` in renderer; validate IPC args; no `eval` of model output.
- **Reuse**: automatic triggers must **not** fork duplicate “match memories” logic—call shared main-process functions used by `simulate-trigger`.
- **Performance**: workflow polling conservative (e.g. 1–3s) with change detection only.
- **Style**: match existing patterns; avoid unrelated refactors.

## Known issues — target checklist for this pass

Fix **all that are still open** unless truly out of scope (then document why in known-issues):

| ID | Topic |
|----|--------|
| BUG-3 | Race in `showList()` during LLM |
| BUG-5 | Daily reminders double-fire / timezone consistency in `scheduler.js` |
| BUG-6 | Image note size limit |
| BUG-7 | Back button disabled during async `showList()` |
| BUG-8 | `normalizeTrigger` word boundaries |
| BUG-9 | Agent `AbortController` timeout |
| BUG-10 | `app.dock.hide()` after `app.ready` |
| BUG-11 | Remove dead `intelligence-query` IPC + preload |
| BUG-12 | Remove unused `_cached` in `config.js` |

If BUG-1/BUG-2/BUG-4 are already marked fixed, verify in code; fix regressions if any.

## Definition of done (session exit criteria)

- [ ] Remainder plan was written before implementation (paste at top of final summary or add `docs/REMAINDER_PLAN.md`).
- [ ] AI agent can operate on **notes + intent memories + scheduled reminders** via structured actions.
- [ ] macOS workflow signal → automatic surfacing works for at least one real app switch (e.g. Safari → mapped trigger), with permission instructions in README.
- [ ] Snooze + done + “why” UX implemented for automatic (and ideally manual) surfacing.
- [ ] `npm test` passes.
- [ ] README updated; `docs/architecture.md` IPC/table sections updated if changed.
- [ ] `docs/known-issues.md` reflects current reality.

## Deliverable format

When finished, reply with:

1. **Remainder plan** (or path to `docs/REMAINDER_PLAN.md`).
2. **Files changed** (grouped: main / renderer / tests / docs).
3. **Manual test steps** (numbered).
4. **Follow-ups** (only if unavoidable), max 3 bullets.

---

## Short user prompt (paste with this attachment)

You have `docs/claude-code-remainder-oneshot-prompt.md` attached. Follow it exactly: **Phase 0 recon → Phase 1 remainder plan → Phase 2 implementation** in the specified order. Implement **all** remaining vision items (AI across all jot types, macOS workflow watching with automatic surfacing, snooze/done/why/cooldown) and **fix every open bug** listed in the attachment’s checklist (or document blockers). Run `npm test` before you finish. Do not expand scope beyond the attached non-goals. Start with Phase 0 now.
