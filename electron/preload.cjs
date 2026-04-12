// MusicKind Desktop App - Preload Script (CommonJS)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openDirectory: (title) => ipcRenderer.invoke('select-directory', title),
  checkFFmpeg: () => ipcRenderer.invoke('check-ffmpeg'),
  installFFmpeg: () => ipcRenderer.invoke('install-ffmpeg'),
  isElectron: () => ipcRenderer.invoke('is-electron')
});