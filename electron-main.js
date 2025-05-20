import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import kill from 'tree-kill';
import fs from 'fs';
app.disableHardwareAcceleration(); 

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
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(process.resourcesPath, 'preload', 'preload.cjs')
    },
  });
  
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join('dist/index.html'));
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

  // Send the path to the renderer after window is ready
  mainWindow.webContents.on('did-finish-load', () => {
    const flowJsonPath = process.argv.find(arg => arg.endsWith('.or') || arg.endsWith('.json'));
    if (flowJsonPath) {
      // Instead of sending just the path, read and send the data!
      fs.readFile(flowJsonPath, 'utf-8', (err, data) => {
        if (err) {
          console.error('Failed to read flow JSON file:', err);
          mainWindow.webContents.send('load-flow-json', null);
        } else {
          mainWindow.webContents.send('load-flow-json', data);
        }
      });
    }
    mainWindow.setTitle(`Orchestrator v${app.getVersion()}`);
  });

  // Listen for request from renderer to load a file (optional)
  ipcMain.on('request-load-flow-json', (event, filePath) => {
    fs.readFile(filePath, 'utf-8', (err, data) => {
      event.sender.send('load-flow-json', err ? null : data);
    });
  });
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopBackend();
});
