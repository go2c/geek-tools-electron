const { app, BrowserWindow, ipcMain, clipboard, nativeImage } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false,
    autoHideMenuBar: true
  });

  mainWindow.loadFile('index.html');
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
  
  // 导入子应用的API（每个main-api.js会注册自己的handler）
  require('./excel-tool/main-api.js');
  require('./image-compressor/main-api.js');
  require('./remove-watermark/main-api.js')();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 页面导航
ipcMain.handle('navigate-to', async (event, appName) => {
  let htmlPath;
  
  switch (appName) {
    case 'excel-tool':
      htmlPath = path.join(__dirname, 'excel-tool', 'index.html');
      break;
    case 'image-compressor':
      htmlPath = path.join(__dirname, 'image-compressor', 'index.html');     
      break;
    case 'remove-watermark':
      htmlPath = path.join(__dirname, 'remove-watermark', 'index.html');     
      break;
    case 'home':
    default:
      htmlPath = path.join(__dirname, 'index.html');
      break;
  }
  
  await mainWindow.loadFile(htmlPath);
});