// MusicKind Desktop App - Main Process (CommonJS)
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow;
let backendProcess = null;
let backendOwnedByElectron = false;
let shuttingDown = false;
let startupDone = false;
const SERVER_PORT = Number(process.env.PORT || 3030);
const SERVER_ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
const projectRoot = path.join(__dirname, '..');
const appIconPath = path.join(__dirname, 'assets', 'icon.png');
const gotSingleInstanceLock = app.requestSingleInstanceLock();

async function checkPythonResult() {
  const candidates = process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];
  for (const cmd of candidates) {
    try {
      const version = await new Promise((resolve, reject) => {
        const child = spawn(cmd, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        child.stdout.on('data', (d) => { out += d; });
        child.stderr.on('data', (d) => { out += d; });
        child.on('close', (code) => code === 0 ? resolve(out.trim()) : reject(new Error(`Python probe failed: ${cmd}`)));
        child.on('error', reject);
      });
      return { found: true, cmd, version };
    } catch {
      // Try next candidate.
    }
  }
  return { found: false };
}

if (!gotSingleInstanceLock) {
  app.quit();
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    return;
  }

  const iconPath = fs.existsSync(appIconPath)
    ? appIconPath
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
  mainWindow.loadURL(SERVER_ORIGIN);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open DevTools for development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return;
  if (process.platform === 'darwin' && app.dock && fs.existsSync(appIconPath)) {
    app.dock.setIcon(appIconPath);
  }
  await ensureBackendServerReady();
  createWindow();
  startupDone = true;
});

app.on('second-instance', () => {
  if (!gotSingleInstanceLock) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    return;
  }

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (!gotSingleInstanceLock) return;
  if (!startupDone) return; // Don't race with whenReady during initial boot
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  shuttingDown = true;
  stopBackendServer();
});

async function ensureBackendServerReady() {
  const alreadyRunning = await isBackendReachable();
  if (!alreadyRunning) {
    startBackendServer();
  }

  const ready = await waitForBackendReady();
  if (!ready) {
    throw new Error(`Backend did not become ready on ${SERVER_ORIGIN}`);
  }
}

function startBackendServer() {
  backendOwnedByElectron = true;
  backendProcess = spawn(process.execPath, [path.join(projectRoot, 'src', 'server.js')], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(SERVER_PORT), ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  backendProcess.stdout.on('data', (chunk) => {
    process.stdout.write(`[backend] ${chunk.toString()}`);
  });

  backendProcess.stderr.on('data', (chunk) => {
    process.stderr.write(`[backend] ${chunk.toString()}`);
  });

  backendProcess.on('exit', (code, signal) => {
    if (!shuttingDown && code !== 0) {
      console.error(`[backend] exited early (code=${code}, signal=${signal})`);
    }
  });
}

function stopBackendServer() {
  if (!backendOwnedByElectron || !backendProcess || backendProcess.killed) {
    return;
  }

  backendProcess.kill('SIGTERM');
  setTimeout(() => {
    if (backendProcess && !backendProcess.killed) {
      backendProcess.kill('SIGKILL');
    }
  }, 2000);
}

function waitForBackendReady(timeoutMs = 10000, retryMs = 250) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const check = async () => {
      if (await isBackendReachable()) {
        resolve(true);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(check, retryMs);
    };
    check();
  });
}

function isBackendReachable() {
  return new Promise((resolve) => {
    const req = http.get(`${SERVER_ORIGIN}/api/settings`, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

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

ipcMain.handle('select-files', async (event, options = {}) => {
  const title = typeof options.title === 'string' ? options.title : 'Selecciona archivos';
  const multiple = Boolean(options.multiple);
  const properties = multiple ? ['openFile', 'multiSelections'] : ['openFile'];

  const result = await dialog.showOpenDialog(mainWindow, {
    title,
    properties,
    filters: [
      { name: 'Audio', extensions: ['mp3', 'wav', 'aiff', 'aif', 'flac', 'm4a'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return multiple ? [] : null;
  }

  return multiple ? result.filePaths : result.filePaths[0];
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

ipcMain.handle('check-python', async () => {
  return checkPythonResult();
});

ipcMain.handle('check-pip-package', async (_event, pkg) => {
  const python = await checkPythonResult();
  if (!python.found) return { installed: false };
  return new Promise((resolve) => {
    const child = spawn(python.cmd, ['-c', `import ${pkg}`], { stdio: 'ignore' });
    child.on('close', (code) => resolve({ installed: code === 0 }));
    child.on('error', () => resolve({ installed: false }));
  });
});

ipcMain.handle('install-pip-packages', async (event, packages) => {
  const python = await checkPythonResult();
  if (!python.found) {
    return { success: false, message: 'Python no encontrado.' };
  }
  const pkgList = Array.isArray(packages) ? packages.filter(Boolean) : [];
  if (pkgList.length === 0) {
    return { success: true, output: '' };
  }

  return new Promise((resolve) => {
    const child = spawn(python.cmd, ['-m', 'pip', 'install', '--upgrade', ...pkgList], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout.on('data', (d) => {
      const chunk = d.toString();
      output += chunk;
      event.sender.send('pip-install-progress', chunk);
    });
    child.stderr.on('data', (d) => {
      const chunk = d.toString();
      output += chunk;
      event.sender.send('pip-install-progress', chunk);
    });
    child.on('close', (code) => resolve({ success: code === 0, output }));
    child.on('error', (err) => resolve({ success: false, message: err.message }));
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

ipcMain.handle('show-in-folder', (_event, filePath) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle('open-external', (_event, targetUrl) => {
  return shell.openExternal(targetUrl);
});
