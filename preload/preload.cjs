const { contextBridge, ipcRenderer } = require('electron');

console.log('!!! PRELOAD LOADED !!!');

contextBridge.exposeInMainWorld('electronAPI', {
  onLoadFlowJson: (callback) => ipcRenderer.on('load-flow-json', (event, data) => {
    callback(data); // data is the file content or null
  }),
  requestLoadFlowJson: (path) => ipcRenderer.send('request-load-flow-json', path),
});
