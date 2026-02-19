const { app, BrowserWindow, globalShortcut, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

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

  win.on('closed', () => {
    win = null;
  });
}

function toggleWindow() {
  if (!win) {
    createWindow();
    win.show();
    return;
  }
  if (win.isVisible()) {
    win.hide();
  } else {
    win.show();
    win.focus();
  }
}

app.whenReady().then(() => {
  const db = require('./database');

  createWindow();

  globalShortcut.register('Control+Option+Command+J', toggleWindow);

  ipcMain.handle('get-notes', () => db.getAllNotes());
  ipcMain.handle('create-note', (_e, content) => db.createNote(content));
  ipcMain.handle('update-note', (_e, id, content) => db.updateNote(id, content));
  ipcMain.handle('delete-note', (_e, id) => db.deleteNote(id));
  ipcMain.handle('restore-note', (_e, note) => db.restoreNote(note));
  ipcMain.handle('resize-window', (_e, panelOpen) => {
    if (!win) return;
    const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
    if (panelOpen) {
      win.setBounds({ x: screenWidth - 620, width: 600 }, true);
    } else {
      win.setBounds({ x: screenWidth - 340, width: 320 }, true);
    }
  });
  ipcMain.handle('create-note-from-image', async () => {
    const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() || win, {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const ext = path.extname(filePath).toLowerCase().slice(1);
    const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }[ext] || 'image/png';
    const buffer = fs.readFileSync(filePath);
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${mime};base64,${base64}`;
    return db.createNote(dataUrl);
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

if (app.dock) {
  app.dock.hide();
}
