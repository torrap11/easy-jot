import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('memory', {
  saveEntry: (content: string) => ipcRenderer.invoke('entry:save', content),
  search: (query: string) => ipcRenderer.invoke('entry:search', query),
  hideCapture: () => ipcRenderer.send('window:hide-capture'),
  hideSearch: () => ipcRenderer.send('window:hide-search'),
  copyText: (text: string) => ipcRenderer.invoke('clipboard:write', text),
  onFocusInput: (cb: () => void) => {
    const fn = () => cb();
    ipcRenderer.on('focus-input', fn);
    return () => ipcRenderer.removeListener('focus-input', fn);
  },
  onOverlayShow: (cb: (text: string) => void) => {
    const fn = (_e: unknown, text: unknown) => {
      if (typeof text === 'string') cb(text);
    };
    ipcRenderer.on('overlay:show', fn);
    return () => ipcRenderer.removeListener('overlay:show', fn);
  },
});
