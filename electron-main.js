const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const kill = require('tree-kill');
const fs = require('fs');


app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.disableHardwareAcceleration();

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
  process.exit(0);
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

let backendProcess;
let mainWindow;
let defaultTitle;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(process.resourcesPath, 'preload', 'preload.js')
    },
  });
  defaultTitle = `Orchestrator v${app.getVersion()}`;
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join('dist/index.html'));
  }
}

function startBackend() {
  if (backendProcess) return;

  // Use process.resourcesPath for production, __dirname for dev
  const isDev = process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true' || process.defaultApp;

  const backendDir = isDev
    ? path.join(__dirname, 'backend')
    : path.join(process.resourcesPath, 'backend');

  const nodeBin = path.join(backendDir, 'node.exe');
  const pollerScript = path.join(backendDir, 'poller.js');

  if (!fs.existsSync(nodeBin)) {
    console.error('Cannot start backend: node.exe not found:', nodeBin);
    return;
  }
  if (!fs.existsSync(pollerScript)) {
    console.error('Cannot start backend: poller.js not found:', pollerScript);
    return;
  }

  backendProcess = spawn(nodeBin, [pollerScript], {
    stdio: 'inherit',
    cwd: backendDir
  });
}


function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = undefined;
  }
}

app.whenReady().then(() => {
  const { ipcMain } = require('electron');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');


ipcMain.handle('save-flow-as', async (event, data) => {
  const result = await dialog.showSaveDialog({
    filters: [{ name: 'Flow Files', extensions: ['or', 'json'] }],
    defaultPath: 'my-flow.or'
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, data, 'utf8');
  return result.filePath;
});
ipcMain.handle('execute-node-job', async (event, payload) => {
  // Use the same logic as in your TS `executeNode` for file IPC
  const isDev = process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true' || process.defaultApp;

  const backendPath = isDev
    ? path.join(__dirname, 'backend')
    : path.join(process.resourcesPath, 'backend');
 
  const inbox = path.join(backendPath, 'inbox');
  const outbox = path.join(backendPath, 'outbox');
  if (!fs.existsSync(inbox)) fs.mkdirSync(inbox, { recursive: true });
  if (!fs.existsSync(outbox)) fs.mkdirSync(outbox, { recursive: true });

  const jobFile = path.join(inbox, `${payload.id}.json`);
  const resultFile = path.join(outbox, `${payload.id}.result.json`);

  await fsp.writeFile(jobFile, JSON.stringify(payload, null, 2), 'utf8');

  // Wait for result
  let waited = 0, timeout = 30000;
  while (!fs.existsSync(resultFile)) {
    if (waited > timeout) throw new Error("Timeout waiting for backend result.");
    await new Promise(res => setTimeout(res, 100));
    waited += 100;
  }

  const resultData = JSON.parse(await fsp.readFile(resultFile, 'utf8'));
  await fsp.unlink(resultFile);
  return resultData;
});
  startBackend();
  createWindow();
  function cleanArgPath(str) {
    if (!str) return str;
    // Remove all non-printable characters from start
    return str.replace(/^[^\x20-\x7E]*/, '');
  }
  mainWindow.webContents.on('did-finish-load', () => {
    // Find the first argument that looks like an or/json file
    let flowJsonPath = process.argv.find(arg => arg.endsWith('.or') || arg.endsWith('.json'));
    flowJsonPath = cleanArgPath(flowJsonPath);
    console.log('Flow JSON path:', flowJsonPath);
    if (flowJsonPath) {
      fs.readFile(flowJsonPath, 'utf-8', (err, data) => {
        if (err) {
          console.error('Failed to read flow JSON file:', err);
          mainWindow.webContents.send('load-flow-json', [flowJsonPath, null]);
        } else {
          mainWindow.webContents.send('load-flow-json', [flowJsonPath, data]);
        }
      });
    }
    else{
      mainWindow.setTitle(defaultTitle);
    }
  });
  
  ipcMain.handle('open-flow-file', async () => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'Flow Files', extensions: ['or', 'json'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    const data = fs.readFileSync(filePath, 'utf-8');
    return { filePath, data };
  });
  ipcMain.on('set-title', (event, title) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      if (!title || title === 'default') {
        win.setTitle(defaultTitle); // Reset to default
      } else {
        win.setTitle(`${defaultTitle} - ${title}`);
      }
    }
  });
  ipcMain.on('save-flow-to-path', (event, filePath, data) => {
    require('fs').writeFileSync(filePath, data, 'utf8');
  });
  

  
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopBackend();
});
