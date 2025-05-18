import { app, BrowserWindow } from 'electron';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import kill from 'tree-kill';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
  process.exit(0);
} else {
  app.on('second-instance', () => {
    // Focus window, do not open a new one
    if (BrowserWindow.getAllWindows().length) {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
      }
    }
  });
}

let backendProcess;
let backendPath;
function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join('dist/index.html'));
  }
}

function startBackend() {
  let nodeBinary;
  if (app.isPackaged) {
    nodeBinary = path.join(process.resourcesPath, 'node_runtime', 'node.exe');
    backendPath = path.join(process.resourcesPath, 'backend', 'server.js');
  } else {
    nodeBinary = 'node'; // Use globally installed node in dev
    backendPath = path.join(__dirname, 'backend', 'server.js');
  }
  
  console.log('Spawning backend:', nodeBinary, backendPath, 'cwd:', path.dirname(backendPath));
  backendProcess = spawn(nodeBinary, [backendPath], {
    stdio: 'inherit',
    cwd: path.dirname(backendPath),
    windowsHide: true
  });
}


function stopBackend() {
  if (backendProcess) {
    kill(backendProcess.pid, 'SIGKILL', (err) => {
      if (err) {
        console.error('Failed to kill backend:', err);
      }
    });
    backendProcess = null;
  }
}

app.whenReady().then(() => {
  startBackend();
  createWindow();
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopBackend();
});
