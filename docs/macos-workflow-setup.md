# macOS workflow setup (context auto-surfacing)

This guide configures **Jot** so jots can resurface when you switch apps or when a supported browser’s **front tab** matches a known site (e.g. Netflix in **ChatGPT Atlas**).

## 1. Enable the watcher in config

Edit your config file (same folder as the app’s user data):

**Path:** `~/Library/Application Support/easy-jot/config.json`

Add or set:

```json
{
  "workflowWatcherEnabled": true
}
```

Restart Jot after saving. The watcher only runs while the app is open.

## 2. Accessibility (required)

Jot uses AppleScript via **System Events** to read the **frontmost app** name and bundle id.

1. Open **System Settings** → **Privacy & Security** → **Accessibility**.
2. Turn **on** the entry for:
   - **Jot** when using the packaged app from **`npm run dist`**, **or**
   - **Electron** when you run `npm start` from a terminal, **or**
   - **Terminal** / **iTerm** / **Cursor** if you launch Jot from there and macOS attributes control to the parent.

If surfacing never fires, recheck this list after an OS update (permissions sometimes reset).

## 3. Automation (required for tab URLs in browsers)

To read the **active tab URL**, macOS must allow Jot to control each browser you use.

1. Open **System Settings** → **Privacy & Security** → scroll to **Automation** (older macOS: **Privacy & Security** → **Automation**).
2. Find **Jot** (release build) / **Electron** (dev) / **Terminal** (whichever matches how you start the app).
3. Expand it and enable **ChatGPT Atlas** (and any other browsers you use with Jot: Chrome, Safari, Brave, Edge, Arc, Chromium).

The first time Jot requests tab access, macOS may show a prompt — choose **Allow**.

**ChatGPT Atlas:** The app is listed as **ChatGPT Atlas** (bundle id `com.openai.atlas`). Jot uses the same AppleScript pattern as Google Chrome: `URL of active tab of front window`.

## 4. Supported browsers for URL → trigger mapping

When the frontmost app is one of these, Jot reads the **front window’s active tab** URL and maps the hostname (e.g. `netflix.com` → Netflix trigger):

| Browser            | Notes                                      |
|--------------------|--------------------------------------------|
| ChatGPT Atlas      | Also matched if System Events shows **Atlas** |
| Google Chrome      |                                            |
| Safari             |                                            |
| Brave Browser      |                                            |
| Microsoft Edge     |                                            |
| Arc                |                                            |
| Chromium           |                                            |

**Firefox** and other browsers are **not** wired for tab URLs in this repo.

## 5. Verify it’s working

1. Enable the watcher and permissions above; restart Jot.
2. Open **ChatGPT Atlas**, make **Netflix** the active tab (`https://www.netflix.com/...`).
3. Switch to another app, then back to Atlas on that tab.

You should see a log line in the **terminal** where Jot runs, for example:

```text
[workflow] Context (domain): "ChatGPT Atlas (www.netflix.com)" → trigger "netflix_open"
```

If you see **no** log when switching to Netflix:

- Confirm **Accessibility** for the process that runs Jot.
- Confirm **Automation** → control **ChatGPT Atlas** is enabled for that process.
- Confirm `workflowWatcherEnabled` is `true` and you restarted the app.

If you see the log but **no overlay**, you may be in the **30-minute cooldown** for that trigger, or you have no jots matching that trigger (intent memories for `netflix_open`, or notes whose text matches Netflix-related keywords). See README **Workflow Watcher** section.

## 6. Optional: Shortcuts / “workflow” automation

Apple **Shortcuts** cannot replace Jot’s internal watcher, but you can:

- Use a Shortcut to **open Jot** (`Cmd+E` or launching the app) before a browsing session so the watcher is running.
- Combine with **Focus** modes or **Open app** actions if you want a ritual that starts Jot + Atlas together.

Jot does not register a dedicated Shortcuts intent today; the integration above is launch + permissions only.

## 7. Security note

Tab URL reading is **local** (AppleScript to the browser). It is used only to map hostnames to your existing trigger ids. API keys are unrelated to this feature.
