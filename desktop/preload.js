const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  version: '2.1.0',
  platform: process.platform
});
