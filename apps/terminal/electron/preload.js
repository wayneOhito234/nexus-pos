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

contextBridge.exposeInMainWorld('nexusSales', {
  saveLocal: (sale) => ipcRenderer.invoke('sales:save-local', sale),
  getPending: () => ipcRenderer.invoke('sales:get-pending'),
  markSynced: (localSaleId, serverId) => ipcRenderer.invoke('sales:mark-synced', localSaleId, serverId),
  pendingCount: () => ipcRenderer.invoke('sales:pending-count'),
});