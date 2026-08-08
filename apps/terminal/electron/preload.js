const { contextBridge, ipcRenderer } = require('electron');

const isTerminal2 = process.argv.some((arg) => arg.includes('nexus-terminal-2'));

contextBridge.exposeInMainWorld('nexusCache', {
  getProducts: () => ipcRenderer.invoke('cache:get-products'),
  setProducts: (products) => ipcRenderer.invoke('cache:set-products', products),
});

contextBridge.exposeInMainWorld('nexusSession', {
  setCashierId: (cashierId) => ipcRenderer.invoke('session:set-cashier', cashierId),
  clearCashierId: () => ipcRenderer.invoke('session:clear-cashier'),
});

contextBridge.exposeInMainWorld('nexusTerminalLabel', isTerminal2 ? 'Till 2' : 'Till 1');