const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vault', {
  load: () => ipcRenderer.invoke('vault:load'),
  save: state => ipcRenderer.invoke('vault:save', state),
  selectBankFile: () => ipcRenderer.invoke('bank-file:select')
});
