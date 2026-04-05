# Roadmap

## Current State (shipped)

The full voice memory pipeline is working end-to-end:
- Voice capture → Pulse STT → LLM intent extraction → SQLite → Lightning TTS confirmation
- Manual context trigger simulation with TTS read-back
- Scheduled reminders (once/daily) with TTS notification
- Note + folder system with AI agent
- Smart note routing: text typed in the note editor auto-converts to a reminder or intent memory on Back based on content

---

## Design Principle: Trigger Source vs. Match Logic

The match-and-surface pipeline is decoupled from how triggers arrive. Adding real auto-detection (M4) requires no changes to matching or surfacing logic.

```
[Trigger Source]                [Match Logic]           [Surface]
  Manual button     ──────────► query memories   ──► overlay + TTS
  Browser extension ──────────► same logic       ──► same overlay
  macOS app watcher ──────────► same logic       ──► same overlay
```

---

## Milestones

### M0 — Foundation (done)
Note CRUD, folders, AI agent, keyboard shortcuts, SQLite persistence.

### M1 — Voice Memory (done)
Voice capture → STT → LLM intent extraction → context trigger memories → TTS read-back. Manual trigger simulation via UI buttons.

### M2 — Scheduled Reminders (done)
Natural-language time parsing ("at 10 PM", "every day at 9 AM", "in 30 minutes"). 30s scheduler poll. TTS reminder notification. Auto-conversion of note text to reminder on save.

### M3 — Real Context Detection ✓ done in v2

**Shipped in `easy-jot/`** — `utils/activeApp.ts` polls the macOS frontmost app every 2 s via osascript. `services/contextMatcher.ts` maps the app name to a semantic context phrase, generates an embedding, and scores it against stored entries (cosine similarity ≥ 0.68, age ≤ 72 h, limit 2). A match triggers a transparent overlay (top-right, 6 s, 5-min re-surface debounce).

Original options for reference:

**Option A — macOS app watcher** (shipped)
- Periodic osascript poll of frontmost process name (`utils/activeApp.ts`, `main/index.ts`)
- App name mapped to context phrase (`services/contextMatcher.ts:activeAppToContextPhrase`)

**Option B — Browser extension**
- Not yet implemented. Would use `chrome.runtime.connectNative` → native messaging → same context surface pipeline

**Option C — Calendar integration**
- Not yet implemented.

### M4 — Snooze, Done, Cooldown ✓ done in v1

**Shipped in root Jot** — `snooze-memory` IPC (sets `snoozed_until`), `dismiss-memory-done` (sets `done = 1`), `mark-memory-shown` (records `last_auto_shown_at` for 30-min cooldown), and a "Why?" button on the trigger overlay. See `database.js` and `renderer/renderer.js`.

### M5 — Semantic Search and Embeddings ✓ done in v2

**Shipped in `easy-jot/`** — `services/embedding.ts` calls `text-embedding-3-small` on every saved entry (async, non-blocking). `entry:search` IPC scores all entries with stored embeddings via `utils/similarity.ts:cosineSimilarity` and returns top 5. The `entries` table has an `embedding TEXT` column (JSON `number[]`).

### M6 — Behavioral Learning
- Track dismiss/snooze/done outcomes per memory
- Surface higher-confidence memories first (fewer false positives over time)
- Weekly review summary: "You acted on 3/5 Netflix memories. 2 were snoozed repeatedly — remove?"

### M7 — Sync and Mobile
- Encrypted SQLite sync across devices (iCloud or self-hosted)
- iOS companion app: capture only (voice, text), notifications when triggers fire on desktop

---

## Non-Goals (current scope)

- **No real-time collaboration**: this is a personal tool
- **No cloud processing**: intent extraction and reminder logic run locally
- **No surveillance features**: only user-initiated context events; no ambient recording beyond explicit voice capture
