const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('joeFlux', {
  newProject: () => ipcRenderer.invoke('desktop:project', 'new'),
  openProject: () => ipcRenderer.invoke('desktop:project', 'open'),
});
