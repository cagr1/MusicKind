// MusicKind Desktop App - Main Process (CommonJS)
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;

function createWindow() {
  const iconPath = fs.existsSync(path.join(__dirname, 'assets', 'icon.png')) 
    ? path.join(__dirname, 'assets', 'icon.png') 
    : null;
    
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.cjs')
    },
    icon: iconPath,
    show: false
  });

  // Start loading the app
  mainWindow.loadFile(path.join(__dirname, '..', 'ui', 'index.html'));

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

// Check FFmpeg installation (cross-platform)
ipcMain.handle('check-ffmpeg', async () => {
  return new Promise((resolve) => {
    const ffmpegCommand = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const child = spawn(ffmpegCommand, ['-version']);
    child.on('close', (code) => {
      resolve(code === 0);
    });
    child.on('error', () => {
      resolve(false);
    });
  });
});

// Install FFmpeg (cross-platform: macOS with brew, Windows with chocolatey or winget)
ipcMain.handle('install-ffmpeg', async () => {
  const platform = process.platform;
  
  return new Promise((resolve) => {
    let installCommand, installArgs, fallbackCommand, fallbackArgs;
    
    if (platform === 'darwin') {
      // macOS: use Homebrew
      installCommand = 'brew';
      installArgs = ['install', 'ffmpeg'];
    } else if (platform === 'win32') {
      // Windows: try winget first, then chocolatey
      installCommand = 'winget';
      installArgs = ['install', 'FFmpeg.FFmpeg', '--source', 'winget', '--accept-package-agreements', '--accept-source-agreements'];
      fallbackCommand = 'choco';
      fallbackArgs = ['install', 'ffmpeg', '-y'];
    } else {
      resolve({
        success: false,
        output: '',
        message: 'Plataforma no soportada para instalación automática'
      });
      return;
    }
    
    const child = spawn(installCommand, installArgs);
    let output = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      output += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({
          success: true,
          output: output,
          message: platform === 'darwin' ? 'FFmpeg instalado correctamente con Homebrew' : 'FFmpeg instalado correctamente con Winget'
        });
      } else if (platform === 'win32' && fallbackCommand) {
        // Try chocolatey as fallback on Windows
        const chocoChild = spawn(fallbackCommand, fallbackArgs);
        let chocoOutput = '';
        
        chocoChild.stdout.on('data', (data) => {
          chocoOutput += data.toString();
        });
        
        chocoChild.stderr.on('data', (data) => {
          chocoOutput += data.toString();
        });
        
        chocoChild.on('close', (chocoCode) => {
          resolve({
            success: chocoCode === 0,
            output: chocoOutput,
            message: chocoCode === 0 ? 'FFmpeg instalado correctamente con Chocolatey' : 'Error al instalar FFmpeg. Instala manualmente desde https://ffmpeg.org/download.html'
          });
        });
        
        chocoChild.on('error', () => {
          resolve({
            success: false,
            output: '',
            message: 'Error al instalar con Chocolatey. Instala FFmpeg manualmente desde https://ffmpeg.org/download.html'
          });
        });
      } else {
        resolve({
          success: false,
          output: output,
          message: platform === 'darwin' ? 'Error al instalar FFmpeg. Ejecuta "brew install ffmpeg" manualmente.' : 'Error al instalar FFmpeg.'
        });
      }
    });
    
    child.on('error', () => {
      if (platform === 'darwin') {
        resolve({
          success: false,
          output: '',
          message: 'Error: Homebrew no encontrado. Instala Homebrew desde https://brew.sh luego ejecuta "brew install ffmpeg"'
        });
      } else if (platform === 'win32') {
        resolve({
          success: false,
          output: '',
          message: 'Error: Winget no encontrado. Instala FFmpeg manualmente desde https://ffmpeg.org/download.html'
        });
      } else {
        resolve({
          success: false,
          output: '',
          message: 'Error al instalar FFmpeg.'
        });
      }
    });
  });
});

// Check if running in Electron environment
ipcMain.handle('is-electron', () => {
  return true;
});