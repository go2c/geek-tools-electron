const { contextBridge, ipcRenderer } = require('electron');

// 合并两个应用的API
contextBridge.exposeInMainWorld('electronAPI', {
  // 页面导航
  navigateTo: (appName) => ipcRenderer.invoke('navigate-to', appName),
  
  // Excel Tool APIs
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  getExcelHeaders: (filePath) => ipcRenderer.invoke('get-excel-headers', filePath),
  processExcel: (filePath, operation, selectedColumns) => 
    ipcRenderer.invoke('process-excel', { filePath, operation, selectedColumns }),
  
  // Image Compressor APIs
  pasteImage: () => ipcRenderer.invoke('paste-image'),
  copyToClipboard: (dataUrl) => ipcRenderer.invoke('copy-to-clipboard', dataUrl),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window')
});

// 为了兼容image-compressor中使用window.electron的代码
contextBridge.exposeInMainWorld('electron', {
  pasteImage: () => ipcRenderer.invoke('paste-image'),
  copyToClipboard: (dataUrl) => ipcRenderer.invoke('copy-to-clipboard', dataUrl),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window')
});