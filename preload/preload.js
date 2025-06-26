const { contextBridge, ipcRenderer } = require('electron');

console.log('!!! PRELOAD LOADED !!!');

// Expose backend API for executing node jobs
contextBridge.exposeInMainWorld('backendAPI', {
  /**
   * Execute a node job through the backend process
   * @param {Object} payload - The job payload
   * @returns {Promise<Object>} - The job result
   */
  executeNodeJob: async (payload) => {
    return ipcRenderer.invoke('execute-node-job', payload);
  },
  
  /**
   * Execute a flow file directly
   * @param {string} flowFilePath - Path to the flow file to execute
   * @param {any} [input=null] - Optional input data for the flow
   * @returns {Promise<any>} - The result of the flow execution
   */
  executeFlowFile: async (flowFilePath, input) => {
    return ipcRenderer.invoke('execute-flow-file', flowFilePath, input);
  },
  
  /**
   * Create a stop signal file for a running job
   * @param {string} jobId - The ID of the job to stop
   * @returns {Promise<void>} - A promise that resolves when the stop signal is created
   */
  createStopSignal: async (jobId) => {
    return ipcRenderer.invoke('create-stop-signal', jobId);
  }
});

// Expose Electron API for file operations and window management
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Get the application version
   * @returns {Promise<string>} - The application version
   */
  getVersion: () => ipcRenderer.invoke('get-version'),
  /**
   * Set the window title
   * @param {string} title - The title to set
   */
  setTitle: (title) => ipcRenderer.send('set-title', title),
  
  /**
   * Register a callback for when a flow JSON is loaded
   * @param {Function} callback - The callback function
   */
  onLoadFlowJson: (callback) =>
    ipcRenderer.on('load-flow-json', (event, data) => callback(data)),

  /**
   * Save flow data to a specific path
   * @param {string} filePath - The file path to save to
   * @param {string} data - The data to save
   */
  saveFlowToPath: (filePath, data) => ipcRenderer.send('save-flow-to-path', filePath, data),
  
  /**
   * Open a file dialog to select a flow file (.or or .json)
   * @returns {Promise<{filePath: string, data: string} | null>} - The selected file path and data, or null if cancelled
   */
  openFlowFile: () => ipcRenderer.invoke('open-flow-file'),
  
  /**
   * Open a flow file in a new window
   * @param {string} flowFilePath - Path to the flow file to open
   * @returns {Promise<boolean>} - True if successful, false otherwise
   */
  openFlowInNewWindow: (flowFilePath) => ipcRenderer.invoke('open-flow-in-new-window', flowFilePath),
  
  /**
   * Open a save dialog to save flow data to a file (.or or .json)
   * @param {string} data - The data to save
   * @returns {Promise<string | null>} - The saved file path, or null if cancelled
   */
  saveFlowAs: async (data) => {
    return await ipcRenderer.invoke('save-flow-as', data);
  },
});