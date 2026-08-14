const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexusConfig', {
  read:  ()       => ipcRenderer.invoke('config:read'),
  write: (config) => ipcRenderer.invoke('config:write', config),
});