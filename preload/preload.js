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
  }
});

// Expose Electron API for file operations and window management
contextBridge.exposeInMainWorld('electronAPI', {
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
   * Open a save dialog to save flow data to a file (.or or .json)
   * @param {string} data - The data to save
   * @returns {Promise<string | null>} - The saved file path, or null if cancelled
   */
  saveFlowAs: async (data) => {
    return await ipcRenderer.invoke('save-flow-as', data);
  },
});