const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets/icon.png'),
    show: false
  });

  // Start loading the app
  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools for development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers for directory selection
ipcMain.handle('select-directory', async (event, title) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: title,
    properties: ['openDirectory']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// Check FFmpeg installation
ipcMain.handle('check-ffmpeg', async () => {
  const { spawn } = require('child_process');
  return new Promise((resolve) => {
    const child = spawn('ffmpeg', ['-version']);
    child.on('close', (code) => {
      resolve(code === 0);
    });
    child.on('error', () => {
      resolve(false);
    });
  });
});

// Install FFmpeg (macOS)
ipcMain.handle('install-ffmpeg', async () => {
  const { spawn } = require('child_process');
  
  return new Promise((resolve) => {
    // Using Homebrew to install FFmpeg on macOS
    const child = spawn('brew', ['install', 'ffmpeg']);
    let output = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      output += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({
        success: code === 0,
        output: output,
        message: code === 0 ? 'FFmpeg instalado correctamente' : 'Error al instalar FFmpeg'
      });
    });
  });
});