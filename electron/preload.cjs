// MusicKind Desktop App - Preload Script (CommonJS)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openDirectory: (title) => ipcRenderer.invoke('select-directory', title),
  openFiles: (title, multiple = false) => ipcRenderer.invoke('select-files', { title, multiple }),
  checkPython: () => ipcRenderer.invoke('check-python'),
  checkPipPackage: (pkg) => ipcRenderer.invoke('check-pip-package', pkg),
  installPipPackages: (pkgs) => ipcRenderer.invoke('install-pip-packages', pkgs),
  onPipInstallProgress: (cb) => {
    const listener = (_event, data) => cb(data);
    ipcRenderer.on('pip-install-progress', listener);
    return () => ipcRenderer.removeListener('pip-install-progress', listener);
  },
  checkFFmpeg: () => ipcRenderer.invoke('check-ffmpeg'),
  installFFmpeg: () => ipcRenderer.invoke('install-ffmpeg'),
  isElectron: () => ipcRenderer.invoke('is-electron'),
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),
  openExternal: (targetUrl) => ipcRenderer.invoke('open-external', targetUrl)
});
