const { contextBridge, ipcRenderer } = require('electron');

console.log('!!! PRELOAD LOADED !!!');


contextBridge.exposeInMainWorld('backendAPI', {
  executeNodeJob: async (payload) => {
    return ipcRenderer.invoke('execute-node-job', payload);
  }
});
contextBridge.exposeInMainWorld('electronAPI', {
  setTitle: (title) => ipcRenderer.send('set-title', title),
  onLoadFlowJson: (callback) =>
    ipcRenderer.on('load-flow-json', (event, data) => callback(data)),

  saveFlowToPath: (filePath, data) => ipcRenderer.send('save-flow-to-path', filePath, data),
  openFlowFile: () => ipcRenderer.invoke('open-flow-file'),
  saveFlowAs: async (data) => {
    return await ipcRenderer.invoke('save-flow-as', data);
  },
});