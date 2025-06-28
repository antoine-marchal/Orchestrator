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
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-accelerated-2d-canvas');
app.commandLine.appendSwitch('disable-accelerated-video-decode');
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
let splashWindow = null;
let defaultTitle;

/**
 * Creates a new window with an optional flow file path to open
 * @param {string} [flowFilePath] - Optional path to a flow file to open
 * @returns {BrowserWindow} The created window
 */
function createWindow(flowFilePath) {
  // Determine if we're in development mode
  const isDev = process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true' || process.defaultApp;
  
  // Choose the appropriate preload path based on environment
  let preloadPath;
  if (isDev) {
    // In development, use the local preload.js file
    preloadPath = path.join(__dirname, 'preload', 'preload.js');
  } else {
    // In production, use the one in resources
    preloadPath = path.join(process.resourcesPath, 'preload', 'preload.js');
  }
  
  //console.log('Creating window with:');
  //console.log('- isDev:', isDev);
  //console.log('- preloadPath:', preloadPath);
  //console.log('- __dirname:', __dirname);
  //console.log('- process.resourcesPath:', process.resourcesPath);
  //console.log('- preloadPath exists:', require('fs').existsSync(preloadPath));
  
  // If preload path doesn't exist, try alternative locations
  if (!require('fs').existsSync(preloadPath)) {
    console.log('Preload path not found, trying alternatives...');
    
    // Try alternative locations
    const alternatives = [
      path.join(__dirname, 'preload.js'),
      path.join(process.resourcesPath, 'preload.js'),
      path.join(__dirname, 'dist', 'preload', 'preload.js'),
      path.join(process.cwd(), 'preload', 'preload.js')
    ];
    
    for (const alt of alternatives) {
      console.log(`Checking alternative: ${alt}`);
      if (require('fs').existsSync(alt)) {
        console.log(`Found alternative preload at: ${alt}`);
        preloadPath = alt;
        break;
      }
    }
  }
  
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
      devTools: true // Always enable DevTools for debugging
    },
    show: false // Start hidden
  });
  
  defaultTitle = `Orchestrator v${app.getVersion()}`;
  
  if (process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true' || process.defaultApp) {
    win.loadURL('http://localhost:5173');
    if (!flowFilePath) win.webContents.openDevTools();
  } else {
    win.loadFile(path.join('dist/index.html'));
  }
  win.webContents.setFrameRate(30);
  win.webContents.setBackgroundThrottling(true);
  win.webContents.executeJavaScript(`
    console.log('🧪 PERF BENCHMARK START');
  
    let frameCount = 0;
    let lastTime = performance.now();
  
    function measureFPS(now) {
      frameCount++;
      if (now - lastTime >= 60000) {
        console.log('FPS:', frameCount);
        frameCount = 0;
        lastTime = now;
      }
      requestAnimationFrame(measureFPS);
    }
  
    requestAnimationFrame(measureFPS);
  
    setInterval(() => {
      if (performance.memory) {
        const mem = performance.memory;
        console.log(
          'Memory Used:',
          (mem.usedJSHeapSize / 1024 / 1024).toFixed(1) + ' MB',
          '| Total:',
          (mem.totalJSHeapSize / 1024 / 1024).toFixed(1) + ' MB'
        );
      }
    }, 60000);
  `);
  
  
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
  console.log('Opening flow in new window:', flowFilePath);
  try {
    const newWindow = createWindow(flowFilePath);
    console.log('New window created successfully');
    
    // Ensure the window is shown immediately for flow nodes
    newWindow.webContents.once('did-finish-load', () => {
      //console.log('New window content loaded, showing window');
      newWindow.show();
      newWindow.focus();
      //console.log('New window shown and focused');
    });
    
    return newWindow;
  } catch (error) {
    console.error('Error creating new window:', error);
    throw error;
  }
}

// Set mainWindow to the first created window
function createMainWindow() {
  mainWindow = createWindow();
}

function startBackend(silent=false) {
  if (backendProcess) return;
 
  // Use process.resourcesPath for production, __dirname for dev
  const isDev = process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true' || process.defaultApp;

  const backendDir = isDev
    ? path.join(__dirname, 'backend')
    : path.join(process.resourcesPath, 'backend');

  const bundledNodeBin = path.join(backendDir, 'node.exe');
  const pollerScript = path.join(backendDir, 'poller.cjs');
  
  if (!fs.existsSync(pollerScript)) {
    console.error('Cannot start backend: poller.js not found:', pollerScript);
    return;
  }

  const args = [pollerScript];
  if (silent) {
    //args.push('--silent');
  }
  
  // Try to use system Node.js first
  let useSystemNode = true;
  let nodeBin = 'node';
  
  try {
    // Check if system Node.js is available by running a simple command
    const { status } = require('child_process').spawnSync(nodeBin, ['--version']);
    if (status !== 0) {
      useSystemNode = false;
    }
  } catch (error) {
    console.log('System Node.js not available, falling back to bundled version');
    useSystemNode = false;
  }
  
  // Fall back to bundled Node.js if system Node.js is not available
  if (!useSystemNode) {
    if (!fs.existsSync(bundledNodeBin)) {
      console.error('Cannot start backend: bundled node.exe not found:', bundledNodeBin);
      return;
    }
    nodeBin = bundledNodeBin;
    
  }
  
  // Pass information about which Node.js is being used to the poller script
  const env = Object.assign({}, process.env, {
    NODE_EXECUTABLE_PATH: nodeBin
  });
  
  backendProcess = spawn(nodeBin, args, {
    stdio: 'inherit',
    cwd: backendDir,
    env: env
  });
  
}


function stopBackend() {
  if (backendProcess) {
    // Use tree-kill to ensure all child processes are terminated
    kill(backendProcess.pid, 'SIGTERM', (err) => {
      if (err) {
        console.error('Error killing backend process:', err);
      } else {
        console.log('Backend process terminated successfully');
      }
      backendProcess = undefined;
    });
  }
}

/**
 * Creates a splash screen window
 * @returns {BrowserWindow} The created splash window
 */
function createSplashWindow() {
  const splash = new BrowserWindow({
    width: 400,
    height: 300,
    transparent: false,
    frame: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      additionalArguments: [
        '--splashLogo=' + path.join(process.resourcesPath, 'logo.png')
      ]
    },
  });
  
  // Load the splash screen HTML directly
  splash.loadFile('splash.html');
  
  // Center the splash window
  splash.center();
  
  return splash;
}

// Expose version to splash screen
ipcMain.handle('get-version', () => {
  return app.getVersion();
});

app.whenReady().then(() => {
  const { ipcMain } = require('electron');
  const fs = require('fs');
  const fsp = require('fs/promises');
  const path = require('path');

  // Handle silent mode execution
  if (isSilentMode && silentModeFlowPath) {
    console.log(`Running in silent mode with flow file: ${silentModeFlowPath}`);
    
    // Start the backend
    startBackend(true);
    
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
        
        // Stop the backend process before exiting
        stopBackend();
        
        // Exit the application after execution
        console.log('Flow execution completed. Exiting...');
        app.exit(0);
      } catch (error) {
        console.error(`Error executing flow in silent mode: ${error.message}`);
        // Make sure to stop the backend even if there's an error
        stopBackend();
        app.exit(1);
      }
    }, 1000); // Give the backend a second to start up
    
    return; // Skip UI initialization in silent mode
  }
  let splashCreatedAt = Date.now() ;
  // Create splash window first
  try {
    splashWindow = createSplashWindow();
    //console.log('Splash window created');
  } catch (error) {
    console.error('Failed to create splash window:', error);
  }
  
  // Start backend

  startBackend();
  
  // Create main window
  createMainWindow();
  
  // When main window is ready, close splash
  if (splashWindow) {
    const MIN_SPLASH_DURATION = 5000; // 3s en ms
    mainWindow.webContents.on('did-finish-load', () => {
      console.log('Main window loaded, closing splash');
      
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
      
    const elapsed = Date.now() - splashCreatedAt;
      const remaining = Math.max(MIN_SPLASH_DURATION - elapsed, 0);
      
      //console.log(`Splash window will close in ${remaining}ms (elapsed: ${elapsed}ms, min duration: ${MIN_SPLASH_DURATION}ms)`);

      setTimeout(() => {
        //console.log('Closing splash window and showing main window');
        if (splashWindow && !splashWindow.isDestroyed()) {
          try {
            splashWindow.close();
            //console.log('Splash window closed successfully');
            splashWindow = null;
          } catch (error) {
            console.error('Error closing splash window:', error);
          }
        }
        
        try {
          mainWindow.show();
          //console.log('Main window shown successfully');
          // Ensure the main window is focused
          mainWindow.focus();
        } catch (error) {
          console.error('Error showing main window:', error);
        }
      }, remaining);
    });
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
    // For nodes with dontWaitForOutput enabled, don't wait for the result
    if (payload.dontWaitForOutput) {
      console.log(`Node ${payload.id} has dontWaitForOutput enabled, not waiting for result`);
      
      // Return immediately but include information that this is a non-blocking node
      // This will allow the UI to maintain the loading state
      return {
        id: payload.id,
        output: payload.input,
        log: "Node execution started in non-blocking mode",
        error: null,
        dontWaitForOutput: true,
        // Include the jobId so the UI can use it to stop the node if needed
        jobId: payload.id
      };
    }

    // Wait for result for normal nodes
    let waited = 0, timeout = payload.timeout || 30000;
    try {
      while (!fs.existsSync(resultFile)) {
        if (waited > timeout) {
          console.log(`Timeout reached for job ${payload.id} after ${timeout}ms`);
          
          // Create a stop signal file to terminate the process
          const stopFilePath = path.join(inbox, `${payload.id}.stop`);
          try {
            fs.writeFileSync(stopFilePath, 'timeout', 'utf8');
            console.log(`Created stop signal file for timed out job ${payload.id}`);
            
            // Also create a result file to unblock any waiting processes
            const timeoutResult = {
              id: payload.id,
              output: null,
              log: "Process terminated due to timeout",
              error: "Error: Timeout waiting for backend result",
              timedOut: true
            };
            fs.writeFileSync(resultFile, JSON.stringify(timeoutResult, null, 2), 'utf8');
            console.log(`Created timeout result file for job ${payload.id}`);
            
            // For normal nodes (not dontWaitForOutput), we need to terminate the process
            // This is done by creating the stop signal file above
            
            // Return the timeout result instead of throwing an error
            return timeoutResult;
          } catch (stopErr) {
            console.error(`Error handling timeout for job ${payload.id}: ${stopErr.message}`);
            throw new Error("Timeout waiting for backend result.");
          }
        }
        await new Promise(res => setTimeout(res, 100));
        waited += 100;
      }

      const resultData = JSON.parse(await fsp.readFile(resultFile, 'utf8'));
      await new Promise(res => setTimeout(res, 250));
      await fsp.unlink(resultFile);
      return resultData;
    } catch (error) {
      console.error(`Error in execute-node-job for ${payload.id}: ${error.message}`);
      
      // Return a structured error response
      return {
        id: payload.id,
        output: null,
        log: null,
        error: `Error: ${error.message}`,
        timedOut: waited > timeout
      };
    }
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
    console.log('IPC: open-flow-in-new-window received with path:', flowFilePath);
    if (!flowFilePath) {
      //console.log('IPC: open-flow-in-new-window - No flow path provided');
      return false;
    }
    try {
      openFlowInNewWindow(flowFilePath);
      //console.log('IPC: open-flow-in-new-window - Successfully opened flow');
      return true;
    } catch (error) {
      console.error('IPC: open-flow-in-new-window - Error opening flow:', error);
      return false;
    }
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
  
  ipcMain.handle('create-stop-signal', async (event, jobId, reason = 'user_request') => {
    try {
      // Get the backend directory
      const isDev = process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true' || process.defaultApp;
      const backendDir = isDev
        ? path.join(__dirname, 'backend')
        : path.join(process.resourcesPath, 'backend');
      
      // Create the stop signal file in the inbox directory
      const stopFilePath = path.join(backendDir, 'inbox', `${jobId}.stop`);
      fs.writeFileSync(stopFilePath, reason, 'utf8');
      console.log(`Created stop signal file for job ${jobId} at ${stopFilePath} (reason: ${reason})`);
      
      // For timeout cases, also create a result file to unblock any waiting processes
      if (reason === 'timeout') {
        const resultFilePath = path.join(backendDir, 'outbox', `${jobId}.result.json`);
        if (!fs.existsSync(resultFilePath)) {
          const timeoutResult = {
            id: jobId,
            output: null,
            log: "Process terminated due to timeout",
            error: "Error: Timeout waiting for backend result",
            timedOut: true
          };
          fs.writeFileSync(resultFilePath, JSON.stringify(timeoutResult, null, 2), 'utf8');
          console.log(`Created timeout result file for job ${jobId}`);
        }
      }
      
      return true;
    } catch (error) {
      console.error(`Error creating stop signal file: ${error.message}`);
      throw error;
    }
  });
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopBackend();
});
