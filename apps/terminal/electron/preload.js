const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexusCache', {
  getProducts: () => ipcRenderer.invoke('cache:get-products'),
  setProducts: (products) => ipcRenderer.invoke('cache:set-products', products),
});

contextBridge.exposeInMainWorld('nexusSession', {
  setCashierId: (cashierId) => ipcRenderer.invoke('session:set-cashier', cashierId),
  clearCashierId: () => ipcRenderer.invoke('session:clear-cashier'),
});

contextBridge.exposeInMainWorld('nexusConfig', {
  read: () => ipcRenderer.invoke('config:read'),
  write: (config) => ipcRenderer.invoke('config:write', config),
  isConfigured: () => ipcRenderer.invoke('config:is-configured'),
});