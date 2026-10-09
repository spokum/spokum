const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 420,
    height: 800,
    minWidth: 360,
    minHeight: 600,
    title: 'СпокУм',
    backgroundColor: '#0e1116',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'icon.ico')
  });

  win.loadURL('https://spokum.ru/');

  win.webContents.on('did-create-window', (childWindow) => {
    childWindow.setSize(800, 600);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('spokum.ru') || url.includes('api.spokum.ru') || url.includes('t.me')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'deny' };
  });

  Menu.setApplicationMenu(null);

  win.on('closed', () => { win = null; });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
