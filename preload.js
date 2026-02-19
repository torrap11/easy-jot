const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getNotes: () => ipcRenderer.invoke('get-notes'),
  createNote: (content) => ipcRenderer.invoke('create-note', content),
  createNoteFromImage: () => ipcRenderer.invoke('create-note-from-image'),
  updateNote: (id, content) => ipcRenderer.invoke('update-note', id, content),
  deleteNote: (id) => ipcRenderer.invoke('delete-note', id),
  restoreNote: (note) => ipcRenderer.invoke('restore-note', note),
  resizeWindow: (panelOpen) => ipcRenderer.invoke('resize-window', panelOpen),
});
