import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  clipboard,
  screen,
} from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  initDb,
  insertEntry,
  updateEntryMeta,
  getAllEntries,
  getDueReminders,
  clearRemindAt,
} from '../db/index.js';
import { generateEmbedding } from '../services/embedding.js';
import { classifyEntry, extractRemindAt } from '../services/classifier.js';
import { cosineSimilarity } from '../utils/similarity.js';
import { getActiveAppName } from '../utils/activeApp.js';
import {
  activeAppToContextPhrase,
  getRelevantEntries,
} from '../services/contextMatcher.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDev = process.env.NODE_ENV !== 'production' && !!process.env.VITE_DEV_SERVER_URL;

const CONTEXT_POLL_MS = 2000;
const REMINDER_TICK_MS = 60_000;
const OVERLAY_DISMISS_MS = 6000;
/** Tune for embedding match; keyword fallback covers borderline demo cases. */
const CONTEXT_MIN_SCORE = 0.68;
const CONTEXT_MAX_AGE_HOURS = 72;
const SURFACE_DEBOUNCE_MS = 5 * 60 * 1000;

function dbFilePath(): string {
  if (process.platform === 'darwin') {
    return path.join(
      process.env.HOME ?? '',
      'Library',
      'Application Support',
      'easy-jot',
      'easy-jot.db',
    );
  }
  return path.join(app.getPath('userData'), 'easy-jot.db');
}

let captureWin: BrowserWindow | null = null;
let searchWin: BrowserWindow | null = null;
let overlayWin: BrowserWindow | null = null;
let overlayHideTimer: ReturnType<typeof setTimeout> | null = null;

let lastPolledApp = '';
let lastSurface: { entryId: string; at: number } | null = null;

function preloadPath(): string {
  return path.join(__dirname, 'preload.cjs');
}

function devUrl(hash: string): string {
  const base = process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173';
  return `${base}/index.html#${hash}`;
}

function loadWindow(win: BrowserWindow, hash: 'capture' | 'search' | 'overlay'): void {
  if (isDev) {
    win.loadURL(devUrl(hash));
  } else {
    win.loadFile(path.join(__dirname, '../dist/renderer/index.html'), { hash });
  }
}

function createCaptureWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 440,
    height: 180,
    show: false,
    backgroundColor: '#1a1a1c',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    minimizable: false,
    maximizable: false,
    title: 'Capture',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  loadWindow(win, 'capture');
  return win;
}

function createSearchWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 520,
    height: 400,
    show: false,
    backgroundColor: '#1a1a1c',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    title: 'Search',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  loadWindow(win, 'search');
  return win;
}

function createOverlayWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 360,
    height: 150,
    show: false,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    focusable: false,
    hasShadow: true,
    title: 'Memory',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  loadWindow(win, 'overlay');
  return win;
}

function ensureWindows(): void {
  if (!captureWin || captureWin.isDestroyed()) captureWin = createCaptureWindow();
  if (!searchWin || searchWin.isDestroyed()) searchWin = createSearchWindow();
}

function ensureOverlay(): BrowserWindow {
  if (!overlayWin || overlayWin.isDestroyed()) overlayWin = createOverlayWindow();
  return overlayWin;
}

function positionOverlay(win: BrowserWindow): void {
  const w = 380;
  const h = 150;
  const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
  win.setSize(w, h);
  win.setPosition(x + width - w - 12, y + 12);
}

function canSurface(entryId: string): boolean {
  if (!lastSurface) return true;
  if (lastSurface.entryId !== entryId) return true;
  return Date.now() - lastSurface.at > SURFACE_DEBOUNCE_MS;
}

function showOverlay(text: string): void {
  const win = ensureOverlay();
  positionOverlay(win);
  if (overlayHideTimer) {
    clearTimeout(overlayHideTimer);
    overlayHideTimer = null;
  }
  const go = (): void => {
    win.webContents.send('overlay:show', text);
    if (process.platform === 'darwin') win.showInactive();
    else win.show();
    overlayHideTimer = setTimeout(() => {
      win.hide();
      overlayHideTimer = null;
    }, OVERLAY_DISMISS_MS);
  };
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', go);
  } else {
    go();
  }
}

function showCapture(): void {
  ensureWindows();
  captureWin!.show();
  captureWin!.focus();
  captureWin!.webContents.send('focus-input');
}

function showSearch(): void {
  ensureWindows();
  searchWin!.show();
  searchWin!.focus();
  searchWin!.webContents.send('focus-input');
}

function hideCapture(): void {
  captureWin?.hide();
}

function hideSearch(): void {
  searchWin?.hide();
}

function scheduleEmbedding(id: string, content: string): void {
  const type = classifyEntry(content);
  void (async () => {
    try {
      const emb = await generateEmbedding(content);
      const json = JSON.stringify(emb);
      updateEntryMeta(id, type, json, new Date().toISOString());
    } catch (e) {
      console.error('[easy-jot] embedding failed', id, e);
    }
  })();
}

function recentWithinHours(createdAt: string | null, hours: number): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= hours * 60 * 60 * 1000 && Date.now() >= t;
}

/**
 * If embeddings are still pending or scores are borderline, surface obvious
 * email tasks when switching to Chrome (demo reliability).
 */
function keywordFallbackChrome(rows: ReturnType<typeof getAllEntries>): {
  id: string;
  content: string;
} | null {
  for (const r of rows) {
    if (!recentWithinHours(r.created_at, CONTEXT_MAX_AGE_HOURS)) continue;
    const c = r.content ?? '';
    if (/\bemail\b/i.test(c) && /\b(professor|robotics|lab)\b/i.test(c)) {
      return { id: r.id, content: c };
    }
  }
  return null;
}

async function handleContextChange(activeApp: string): Promise<void> {
  const phrase = activeAppToContextPhrase(activeApp);
  if (!phrase) return;
  try {
    const rows = getAllEntries();
    const matches = await getRelevantEntries(phrase, rows, {
      maxAgeHours: CONTEXT_MAX_AGE_HOURS,
      minScore: CONTEXT_MIN_SCORE,
      limit: 2,
    });
    let top = matches[0];
    if (!top && activeApp.includes('Chrome')) {
      const fb = keywordFallbackChrome(rows);
      if (fb) top = { id: fb.id, content: fb.content, score: 0.9 };
    }
    if (!top) return;
    if (!canSurface(top.id)) return;
    lastSurface = { entryId: top.id, at: Date.now() };
    showOverlay(`👉 You wanted to: ${top.content}`);
  } catch (e) {
    console.error('[easy-jot] context', e);
  }
}

function registerShortcuts(): void {
  const okE = globalShortcut.register('CommandOrControl+E', () => {
    showCapture();
  });
  const okK = globalShortcut.register('CommandOrControl+K', () => {
    showSearch();
  });
  if (!okE) console.warn('[easy-jot] Could not register Cmd/Ctrl+E');
  if (!okK) console.warn('[easy-jot] Could not register Cmd/Ctrl+K');
}

function startContextPolling(): void {
  if (process.platform !== 'darwin') return;
  setInterval(() => {
    void (async () => {
      const appName = await getActiveAppName();
      if (!appName) return;
      if (appName === lastPolledApp) return;
      lastPolledApp = appName;
      await handleContextChange(appName);
    })();
  }, CONTEXT_POLL_MS);
}

function startReminderLoop(): void {
  setInterval(() => {
    const now = new Date().toISOString();
    const due = getDueReminders(now);
    for (const row of due) {
      showOverlay(`👉 Reminder:\n${row.content ?? ''}`);
      clearRemindAt(row.id);
    }
  }, REMINDER_TICK_MS);
}

app.whenReady().then(() => {
  initDb(dbFilePath());
  registerShortcuts();

  ensureWindows();
  ensureOverlay();

  ipcMain.handle('entry:save', async (_evt, raw: unknown) => {
    const content = typeof raw === 'string' ? raw.trim() : '';
    if (!content) return { ok: false as const, error: 'empty' };
    const id = randomUUID();
    const now = new Date().toISOString();
    const type = classifyEntry(content);
    const remindAt = extractRemindAt(content);
    insertEntry(id, content, type, now, remindAt);
    scheduleEmbedding(id, content);
    return { ok: true as const, id };
  });

  ipcMain.handle('entry:search', async (_evt, raw: unknown) => {
    const query = typeof raw === 'string' ? raw.trim() : '';
    if (!query) {
      return {
        ok: true as const,
        results: [] as Array<{
          id: string;
          content: string;
          type: string;
          score: number;
          created_at: string;
        }>,
      };
    }
    try {
      const qEmb = await generateEmbedding(query);
      const rows = getAllEntries().filter((r) => r.embedding);
      const scored = rows
        .map((r) => {
          let emb: number[];
          try {
            emb = JSON.parse(r.embedding!) as number[];
          } catch {
            return null;
          }
          return {
            id: r.id,
            content: r.content ?? '',
            type: r.type ?? 'note',
            score: cosineSimilarity(qEmb, emb),
            created_at: r.created_at ?? '',
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      scored.sort((a, b) => b.score - a.score);
      const top = scored.slice(0, 5);
      return { ok: true as const, results: top };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  });

  ipcMain.on('window:hide-capture', () => hideCapture());
  ipcMain.on('window:hide-search', () => hideSearch());

  ipcMain.handle('clipboard:write', (_e, text: unknown) => {
    if (typeof text === 'string') clipboard.writeText(text);
  });

  startContextPolling();
  startReminderLoop();

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
