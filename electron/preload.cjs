// MusicKind Desktop App - Preload Script (CommonJS)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openDirectory: (title) => ipcRenderer.invoke('select-directory', title),
  openFiles: (title, multiple = false) => ipcRenderer.invoke('select-files', { title, multiple }),
  checkFFmpeg: () => ipcRenderer.invoke('check-ffmpeg'),
  installFFmpeg: () => ipcRenderer.invoke('install-ffmpeg'),
  isElectron: () => ipcRenderer.invoke('is-electron'),
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath)
});
