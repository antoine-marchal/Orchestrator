const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const kill = require('tree-kill');
const fs = require('fs');

// Parse command line arguments
const argv = process.argv.slice(1);
const silentModeIndex = argv.findIndex(arg => arg === '-s' || arg === '--silent');
const isSilentMode = silentModeIndex !== -1;
let silentModeFlowPath = null;

if (isSilentMode && silentModeIndex + 1 < argv.length) {
  silentModeFlowPath = argv[silentModeIndex + 1];
  // Clean the path if needed
  silentModeFlowPath = cleanArgPath(silentModeFlowPath);
  
  // Verify it's a flow file
  if (!silentModeFlowPath.endsWith('.or') && !silentModeFlowPath.endsWith('.json')) {
    console.error('Error: Silent mode requires a valid flow file path (.or or .json)');
    app.exit(1);
  }
}

// Helper function to clean path arguments
function cleanArgPath(str) {
  if (!str) return str;
  // Remove all non-printable characters from start
  return str.replace(/^[^\x20-\x7E]*/, '');
}


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

/**
 * Creates a new window with an optional flow file path to open
 * @param {string} [flowFilePath] - Optional path to a flow file to open
 * @returns {BrowserWindow} The created window
 */
function createWindow(flowFilePath) {
  const win = new BrowserWindow({
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
    win.loadURL('http://localhost:5173');
    if (!flowFilePath) win.webContents.openDevTools();
  } else {
    win.loadFile(path.join('dist/index.html'));
  }
  
  // If a flow file path was provided, set it up to be loaded when the window is ready
  if (flowFilePath) {
    win.webContents.on('did-finish-load', () => {
      try {
        const data = fs.readFileSync(flowFilePath, 'utf-8');
        win.webContents.send('load-flow-json', [flowFilePath, data]);
        const fileName = flowFilePath.split(/[\\/]/).pop();
        if (fileName) win.setTitle(`${defaultTitle} - ${fileName}`);
      } catch (err) {
        console.error('Failed to read flow file:', err);
        win.webContents.send('load-flow-json', [flowFilePath, null]);
      }
    });
  }
  
  return win;
}

/**
 * Opens a flow file in a new window
 * @param {string} flowFilePath - Path to the flow file to open
 */
function openFlowInNewWindow(flowFilePath) {
  createWindow(flowFilePath);
}

// Set mainWindow to the first created window
function createMainWindow() {
  mainWindow = createWindow();
}

function startBackend() {
  if (backendProcess) return;

  // Use process.resourcesPath for production, __dirname for dev
  const isDev = process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true' || process.defaultApp;

  const backendDir = isDev
    ? path.join(__dirname, 'backend')
    : path.join(process.resourcesPath, 'backend');

  const nodeBin = path.join(backendDir, 'node.exe');
  const pollerScript = path.join(backendDir, 'poller.cjs');

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

  // Handle silent mode execution
  if (isSilentMode && silentModeFlowPath) {
    console.log(`Running in silent mode with flow file: ${silentModeFlowPath}`);
    
    // Start the backend
    startBackend();
    
    // Wait for backend to initialize
    setTimeout(async () => {
      try {
        // Get the backend directory
        const isDev = process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true' || process.defaultApp;
        const backendDir = isDev
          ? path.join(__dirname, 'backend')
          : path.join(process.resourcesPath, 'backend');
        
        // Import the executeFlowFile function from poller.cjs
        const { executeFlowFile } = require(path.join(backendDir, 'poller.cjs'));
        
        // Execute the flow file
        await executeFlowFile(silentModeFlowPath);
        
        // Exit the application after execution
        console.log('Flow execution completed. Exiting...');
        app.exit(0);
      } catch (error) {
        console.error(`Error executing flow in silent mode: ${error.message}`);
        app.exit(1);
      }
    }, 1000); // Give the backend a second to start up
    
    return; // Skip UI initialization in silent mode
  }


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
  await new Promise(res => setTimeout(res, 250));
  await fsp.unlink(resultFile);
  return resultData;
});

ipcMain.handle('execute-flow-file', async (event, flowFilePath, input) => {
  try {
    // Get the backend directory
    const isDev = process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true' || process.defaultApp;
    const backendDir = isDev
      ? path.join(__dirname, 'backend')
      : path.join(process.resourcesPath, 'backend');
    
    // Import the executeFlowFile function from poller.cjs
    const { executeFlowFile } = require(path.join(backendDir, 'poller.cjs'));
    
    // Execute the flow file
    const result = await executeFlowFile(flowFilePath, input);
    return result;
  } catch (error) {
    console.error(`Error executing flow file: ${error.message}`);
    throw error;
  }
});

  startBackend();
  createMainWindow();
  
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
  
  ipcMain.handle('open-flow-in-new-window', async (event, flowFilePath) => {
    if (!flowFilePath) return false;
    openFlowInNewWindow(flowFilePath);
    return true;
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
