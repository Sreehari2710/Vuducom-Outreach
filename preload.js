const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveAuth: (token, user) => ipcRenderer.send('save-auth', { token, user }),
  getAuth: () => ipcRenderer.invoke('get-auth'),
  clearAuth: () => ipcRenderer.send('clear-auth')
});
