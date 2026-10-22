const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vault', {
  load: () => ipcRenderer.invoke('vault:load'),
  save: state => ipcRenderer.invoke('vault:save', state),
  selectBankFile: () => ipcRenderer.invoke('bank-file:select'),
  onOpenCategoryManager: callback => {
    const listener = () => callback();
    ipcRenderer.on('vault:open-category-manager', listener);
    return () => ipcRenderer.removeListener('vault:open-category-manager', listener);
  }
});
