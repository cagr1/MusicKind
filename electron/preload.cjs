// MusicKind Desktop App - Preload Script (CommonJS)
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Resolves the absolute filesystem path for a File object obtained from a
  // drag-and-drop DataTransfer, since File.path is not populated on
  // Electron 32+. Returns "" if webUtils is unavailable or the file has no
  // resolvable path (e.g. not backed by a real filesystem entry).
  getPathForFile: (file) => {
    try {
      return webUtils && typeof webUtils.getPathForFile === 'function'
        ? webUtils.getPathForFile(file)
        : '';
    } catch (e) {
      return '';
    }
  },
  openDirectory: (title) => ipcRenderer.invoke('select-directory', title),
  openFiles: (title, multiple = false) => ipcRenderer.invoke('select-files', { title, multiple }),
  checkPython: () => ipcRenderer.invoke('check-python'),
  checkPipPackage: (pkg) => ipcRenderer.invoke('check-pip-package', pkg),
  checkFFmpeg: () => ipcRenderer.invoke('check-ffmpeg'),
  installFFmpeg: () => ipcRenderer.invoke('install-ffmpeg'),
  isElectron: () => ipcRenderer.invoke('is-electron'),
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),
  openExternal: (targetUrl) => ipcRenderer.invoke('open-external', targetUrl)
});
