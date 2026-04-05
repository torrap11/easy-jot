# Building and distributing Jot (macOS)

## What gets packaged

`electron-builder` produces a normal **macOS app** (`Jot.app`) inside `dist/`, plus a **`.dmg`** and **`.zip`** for sharing. Users double-click the app or drag it to **Applications** — no `npm start` or Node on their machine.

**Not bundled:** [Ollama](https://ollama.com) is a separate download (~large runtime + models). Jot only talks to `http://localhost:11434` when `useOllama` is true in config. For a “download and use” flow:

- **Cloud LLM:** set `openaiApiKey` and `useOllama: false` — nothing else to install.
- **Local LLM:** user installs Ollama once from the official site, runs it (menu bar app or `ollama serve`), pulls a model (`ollama pull llama3.2`), then enables Ollama in Jot’s config.

Fully embedding Ollama inside Jot would balloon the download and complicate updates; the usual pattern is two installers: **Jot** + **Ollama (optional)**.

## Maintainer: create a release build

**Avoid building from iCloud Drive** (paths like `Mobile Documents/.../CloudDocs/...`). Extended attributes on synced folders often make `codesign` fail with:

`resource fork, Finder information, or similar detritus not allowed`

Clone or copy the repo to a **local folder** (e.g. `~/Developer/jot`) and run `npm run dist` there. Release `package.json` sets **`mac.identity: null`** so **codesign is skipped**. That avoids failures when the repo lives under **iCloud Drive** (extended attributes / sync break ad-hoc signing). The tradeoff is an **unsigned** app: users may need to **right-click → Open** the first time, and some org Macs may block it. For a public release, build from a **non-iCloud path** (or CI) and set a real **Apple Developer identity** instead of `null`, then enable **notarization** as needed.

An **`afterPack`** script runs `xattr -cr` on the output folder to reduce signing issues if you switch back to ad-hoc signing later.

From the repo root (macOS, Apple Silicon or Intel — build on the arch you want to ship):

```bash
npm install
npm run dist
```

Artifacts appear under **`dist/`**, for example:

- `Jot-1.0.0-arm64.dmg` / `Jot-1.0.0-x64.dmg` (architecture depends on the machine that built)
- `Jot-1.0.0-arm64-mac.zip`
- macOS may also emit `latest-mac.yml` for auto-updaters (if you add publishing later)

Quick unpack test without DMG:

```bash
npm run pack
open dist/mac-arm64/Jot.app   # folder name may be mac / mac-arm64 depending on builder
```

**Native module:** `better-sqlite3` is listed under `build.asarUnpack` so it loads correctly from the packaged app.

## Code signing & notarization (optional, for wide distribution)

Unsigned builds often require **Right-click → Open** the first time (Gatekeeper). For distribution outside friends-and-family:

1. Enroll in the **Apple Developer Program**.
2. Set environment variables or `build.mac` fields for `identity`, `hardenedRuntime`, `gatekeeperAssess`, `notarize`, and entitlements — see [electron-builder macOS](https://www.electron.build/configuration/mac).

This repo does not configure signing by default.

## End-user config location (packaged app)

Same as dev: **`~/Library/Application Support/easy-jot/config.json`**. Ship **`config.example.json`** in the repo as documentation; users copy keys into that path (or you add onboarding later).

## Workflow watcher permissions

Packaged app name in **Accessibility** / **Automation** is **Jot** (product name), not Electron. See **`docs/macos-workflow-setup.md`**.
