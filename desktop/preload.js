const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('SpokumHost', {
  showNotification: (title, body) => ipcRenderer.send('show-notification', { title, body }),
  areNotificationsEnabled: () => true,
  requestNotificationPermission: () => {},
  apply: () => location.reload(),
  version: () => '1.0.0-desktop',
  isDesktop: () => true
});
