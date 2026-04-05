const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // ── Notes ──────────────────────────────────────────────────────────────
  getNotes:         ()               => ipcRenderer.invoke('get-notes'),
  createNote:       (content)        => ipcRenderer.invoke('create-note', content),
  createNoteFromImage: ()            => ipcRenderer.invoke('create-note-from-image'),
  updateNote:       (id, content)    => ipcRenderer.invoke('update-note', id, content),
  deleteNote:       (id)             => ipcRenderer.invoke('delete-note', id),
  restoreNote:      (note)           => ipcRenderer.invoke('restore-note', note),

  // ── Window ─────────────────────────────────────────────────────────────
  resizeWindow:     (panelOpen)      => ipcRenderer.invoke('resize-window', panelOpen),

  // ── Folders ────────────────────────────────────────────────────────────
  createFolder:     (name, desc)     => ipcRenderer.invoke('create-folder', name, desc),
  updateFolder:     (id, name, desc) => ipcRenderer.invoke('update-folder', id, name, desc),
  getFolders:       ()               => ipcRenderer.invoke('get-folders'),
  updateNoteFolder: (noteId, folderId) => ipcRenderer.invoke('update-note-folder', noteId, folderId),
  getNotesByFolder: (folderId)       => ipcRenderer.invoke('get-notes-by-folder', folderId),

  // ── AI Agent ───────────────────────────────────────────────────────────
  // intelligenceQuery removed (BUG-11: dead handler)
  intelligenceQueryStructured: (msg, notes)  => ipcRenderer.invoke('intelligence-query-structured', { userMessage: msg, notes }),
  intelligenceExecute:         (actions)     => ipcRenderer.invoke('intelligence-execute', actions),
  intelligenceQueryHelp:       (msg)         => ipcRenderer.invoke('intelligence-query-help', { userMessage: msg }),

  // ── Voice (STT) ───────────────────────────────────────────────────────
  transcribeAudio:    (ab)      => ipcRenderer.invoke('transcribe-audio', ab),

  // ── Universal Voice Command (Cmd+M) ───────────────────────────────────
  classifyVoiceCommand: (transcript) => ipcRenderer.invoke('classify-voice-command', transcript),

  // ── Context-surfaced notes (overlay actions) ──────────────────────────
  snoozeContextNote: (id, minutes) => ipcRenderer.invoke('snooze-context-note', id, minutes),
  dismissContextNote: (id)         => ipcRenderer.invoke('dismiss-context-note', id),

  // ── Config status (no secrets exposed) ────────────────────────────────
  getConfigStatus: () => ipcRenderer.invoke('get-config-status'),

  // ── Scheduled Reminders ────────────────────────────────────────────────
  createScheduledReminder: (data)  => ipcRenderer.invoke('create-scheduled-reminder', data),
  getScheduledReminders:   ()      => ipcRenderer.invoke('get-scheduled-reminders'),
  deleteScheduledReminder: (id)    => ipcRenderer.invoke('delete-scheduled-reminder', id),
  toggleScheduledReminder: (id)    => ipcRenderer.invoke('toggle-scheduled-reminder', id),
  fireReminder:            (id)    => ipcRenderer.invoke('fire-reminder', id),

  // ── IPC events from main process ──────────────────────────────────────
  // Legacy: voice-capture IPC (no global shortcut registered in main)
  onToggleVoiceCapture: (cb) => ipcRenderer.on('toggle-voice-capture', () => cb()),
  // Universal voice command toggle sent by the global hotkey (Cmd+M)
  onToggleVoiceCommand: (cb) => ipcRenderer.on('toggle-voice-command', () => cb()),
  // Workflow watcher: automatic trigger from frontmost app detection
  onWorkflowTrigger: (cb) => ipcRenderer.on('workflow-trigger', (_e, data) => cb(data)),
  // Reminder due (pushed by scheduler)
  onReminderDue: (cb) => ipcRenderer.on('reminder-due', (_e, data) => cb(data)),
});
