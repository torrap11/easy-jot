const {
  app, BrowserWindow, globalShortcut, ipcMain,
  screen, dialog, systemPreferences,
} = require('electron');
const path = require('path');
const fs   = require('fs');
const keybinds = require('./keybinds');

const IMAGE_MAX_BYTES = 2 * 1024 * 1024; // BUG-6: 2 MB limit for image notes

let win;

function createWindow() {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

  win = new BrowserWindow({
    width: 320,
    height: 260,
    x: screenWidth - 340,
    y: 80,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    show: false,
    transparent: false,
    backgroundColor: '#fef9c3',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.on('closed', () => { win = null; });

  // Allow getUserMedia (microphone) from renderer
  win.webContents.session.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === 'media');
  });
}

function toggleWindow() {
  if (!win) { createWindow(); win.show(); return; }
  if (win.isVisible()) { win.hide(); } else { win.show(); win.focus(); }
}

// ── Send a toggle-voice-command event to renderer (Cmd+M) ─────────────────
function sendToggleVoiceCommand() {
  if (!win) return;
  if (win.isVisible()) {
    win.webContents.send('toggle-voice-command');
  } else {
    win.show();
    win.focus();
    win.webContents.send('toggle-voice-command');
  }
}

app.whenReady().then(() => {
  // BUG-10: dock.hide() must be called after app is ready
  if (app.dock) app.dock.hide();

  const db          = require('./database');
  const llm         = require('./llm');
  const executor    = require('./intelligence/executor');
  const voice       = require('./voice');
  const tts         = require('./tts');
  const { normalizeTrigger, getTriggerLabel, getTriggerIcon, getTriggerKeywords } = require('./triggerEngine');
  const { getConfig }                               = require('./config');
  const { startScheduler, fireById }                = require('./scheduler');
  const { parseReminderNL }                         = require('./reminderParser');
  const { classifyVoiceCommand }                    = require('./voiceCommand');
  const { startWatcher }                            = require('./workflowWatcher');

  createWindow();

  // Start the reminder scheduler (polls every 30s)
  startScheduler({
    getDb:  () => db,
    getTts: () => tts,
    getWin: () => win,
  });

  // macOS: request microphone access upfront so the permission prompt appears
  // before the user tries to record (better UX than prompting mid-flow).
  if (process.platform === 'darwin') {
    systemPreferences.askForMediaAccess('microphone').catch(() => {});
  }

  // ── Global hotkeys ──────────────────────────────────────────────────────
  globalShortcut.register('Command+E', toggleWindow);
  globalShortcut.register('Command+M', sendToggleVoiceCommand);

  // ── Context surface pipeline (workflow watcher only) ────────────────────
  // Resurfaces **notes** whose text matches keywords for this screen/context.
  // No separate "intent memory" rows — everything is a normal note.
  // source: 'auto' (watcher) | 'manual' (unused; kept for API shape)
  async function runContextSurface(triggerInput, source = 'auto', appName = null) {
    const triggerId = normalizeTrigger(triggerInput);
    const label     = getTriggerLabel(triggerId);
    const icon      = getTriggerIcon(triggerId);

    const keywords = getTriggerKeywords(triggerId);
    const matchesKeywords = (text) => keywords.some(kw => text.toLowerCase().includes(kw));
    const noteMatches = db.getAllNotes()
      .filter(n => !n.content.startsWith('data:image/') && matchesKeywords(n.content))
      .filter(n => source === 'manual' || db.noteEligibleForAutoContextSurface(n))
      .map(n => ({ ...n, trigger: triggerId, category: 'note', jotType: 'note' }));

    const memories = noteMatches;

    let audioData = null;
    if (getConfig().speakTriggerMemories) {
      try {
        const wavBuf = await tts.speakTriggerReadout(label, memories);
        if (wavBuf) {
          audioData = wavBuf.buffer.slice(wavBuf.byteOffset, wavBuf.byteOffset + wavBuf.byteLength);
        }
      } catch (ttsErr) {
        console.warn('[tts] trigger readout failed:', ttsErr.message);
      }
    }

    const payload = { trigger: triggerId, label, icon, memories, audioData, source, appName };

    // Push to renderer only when there are matching notes (no empty popups)
    if (win && !win.isDestroyed() && memories.length > 0) {
      const channel = source === 'auto' ? 'workflow-trigger' : 'trigger-result';
      win.webContents.send(channel, payload);
      if (!win.isVisible()) { win.show(); win.focus(); }
    }

    return payload;
  }

  // ── Note & folder handlers ──────────────────────────────────────────────
  ipcMain.handle('get-notes',          ()                     => db.getAllNotes());
  ipcMain.handle('create-note',        (_e, content)          => db.createNote(content));
  ipcMain.handle('update-note',        (_e, id, content)      => db.updateNote(id, content));
  ipcMain.handle('delete-note',        (_e, id)               => db.deleteNote(id));
  ipcMain.handle('restore-note',       (_e, note)             => db.restoreNote(note));
  ipcMain.handle('create-folder',      (_e, name, desc)       => db.createFolder(name, desc));
  ipcMain.handle('update-folder',      (_e, id, name, desc)   => db.updateFolder(id, name, desc));
  ipcMain.handle('get-folders',        ()                     => db.getAllFolders());
  ipcMain.handle('update-note-folder', (_e, noteId, folderId) => db.updateNoteFolder(noteId, folderId));
  ipcMain.handle('get-notes-by-folder',(_e, folderId)         => db.getNotesByFolder(folderId));

  // ── Agent handlers ──────────────────────────────────────────────────────
  // BUG-11: intelligence-query handler removed (dead code — renderer uses structured output)

  ipcMain.handle('intelligence-execute', async (_e, actions) => {
    return executor.executeActions(actions, db);
  });

  // Structured output: notes + reminders only (no separate context-memory table)
  ipcMain.handle('intelligence-query-structured', async (_e, { userMessage, notes }) => {
    try {
      const reminders = db.getAllScheduledReminders();
      const actions   = await llm.callLLMWithStructuredOutput(userMessage, notes, reminders);
      return { actions };
    } catch (err) {
      return { error: llm.describeLLMError(err, getConfig()) };
    }
  });

  ipcMain.handle('intelligence-query-help', (_e, { userMessage }) => {
    try {
      const all = [...keybinds.global, ...keybinds.inApp];
      const words = (userMessage || '').toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const matches = words.length
        ? all.filter(s => words.some(w => s.action.toLowerCase().includes(w) || s.keys.toLowerCase().includes(w)))
        : [];
      const list = (matches.length > 0 ? matches : all)
        .map(s => `${s.keys} — ${s.action}`)
        .join('\n');
      const intro = matches.length > 0 ? 'Here are the matching shortcuts:' : 'Here are all keyboard shortcuts:';
      return { response: `${intro}\n\n${list}` };
    } catch (err) { return { error: err.message }; }
  });

  // ── Window resize ───────────────────────────────────────────────────────
  ipcMain.handle('resize-window', (_e, panelOpen) => {
    if (!win) return;
    const { width: sw } = screen.getPrimaryDisplay().workAreaSize;
    if (panelOpen) {
      win.setBounds({ x: sw - 620, width: 600 }, true);
    } else {
      win.setBounds({ x: sw - 340, width: 320 }, true);
    }
  });

  // ── Image note ──────────────────────────────────────────────────────────
  ipcMain.handle('create-note-from-image', async () => {
    const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() || win, {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const fp  = result.filePaths[0];
    const buf = fs.readFileSync(fp);
    // BUG-6: reject images larger than 2 MB before base64 encoding
    if (buf.length > IMAGE_MAX_BYTES) {
      return { error: `Image too large (${(buf.length / 1024 / 1024).toFixed(1)} MB). Maximum is 2 MB.` };
    }
    const ext = path.extname(fp).toLowerCase().slice(1);
    const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }[ext] || 'image/png';
    const b64  = buf.toString('base64');
    return db.createNote(`data:${mime};base64,${b64}`);
  });

  // ── Voice (transcription + Cmd+M classifier) ────────────────────────────

  ipcMain.handle('transcribe-audio', async (_e, arrayBuffer) => {
    try {
      const buf = Buffer.from(arrayBuffer);
      const result = await voice.transcribeAudio(buf);
      return { transcript: result.transcript, words: result.words, provider: result.provider };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('classify-voice-command', async (_e, transcript) => {
    try {
      const classification = await classifyVoiceCommand(transcript);
      return { classification };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('snooze-context-note', (_e, id, minutes) => {
    try { db.snoozeNoteContextSurface(id, minutes || 30); return { ok: true }; }
    catch (err) { return { error: err.message }; }
  });

  ipcMain.handle('dismiss-context-note', (_e, id) => {
    try { db.markNoteContextSurfaceDone(id); return { ok: true }; }
    catch (err) { return { error: err.message }; }
  });

  // Expose current config status to renderer (no secrets)
  ipcMain.handle('get-config-status', () => {
    const cfg = getConfig();
    return {
      hasOpenAI:              !!cfg.openaiApiKey,
      hasSmallest:            !!cfg.smallestAiKey,
      useOllama:              cfg.useOllama,
      model:                  cfg.model,
      sttProvider:            cfg.smallestAiKey ? 'pulse' : null,
      ttsEnabled:             !!cfg.smallestAiKey,
      workflowWatcherEnabled: cfg.workflowWatcherEnabled,
      speakTriggerMemories:   cfg.speakTriggerMemories,
    };
  });

  // ── Scheduled Reminders ─────────────────────────────────────────────────

  ipcMain.handle('create-scheduled-reminder', (_e, { content, scheduleType, scheduledTime, noteContent }) => {
    try {
      return { reminder: db.createScheduledReminder({ content, scheduleType, scheduledTime, noteContent }) };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('get-scheduled-reminders', () => {
    try { return db.getAllScheduledReminders(); }
    catch { return []; }
  });

  ipcMain.handle('delete-scheduled-reminder', (_e, id) => {
    try { db.deleteScheduledReminder(id); return { ok: true }; }
    catch (err) { return { error: err.message }; }
  });

  ipcMain.handle('toggle-scheduled-reminder', (_e, id) => {
    try {
      const reminders = db.getAllScheduledReminders();
      const reminder = reminders.find(r => r.id === id);
      if (!reminder) return { error: 'Reminder not found' };
      if (reminder.active) {
        db.deactivateReminder(id);
      } else {
        db.activateReminder(id);
      }
      return { ok: true, active: !reminder.active };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('fire-reminder', async (_e, id) => {
    try {
      const audioData = await fireById(id, db, tts);
      const reminders = db.getAllScheduledReminders();
      const reminder = reminders.find(r => r.id === id);
      if (!reminder || !win || win.isDestroyed()) return { ok: true, audioData };
      const payload = { id, content: reminder.content, audioData };
      if (reminder.note_content) {
        try {
          const note = db.createNote(reminder.note_content);
          payload.noteId = note.id;
          payload.showOnlyThisNote = true;
        } catch (e) { /* ignore */ }
      }
      win.webContents.send('reminder-due', payload);
      return { ok: true, audioData };
    } catch (err) {
      return { error: err.message };
    }
  });

  // ── Workflow watcher ────────────────────────────────────────────────────
  startWatcher({ runTrigger: runContextSurface, getConfig });

});

app.on('will-quit', () => { globalShortcut.unregisterAll(); });
app.on('window-all-closed', (e) => { e.preventDefault(); });
