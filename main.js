const { app, BrowserWindow, ipcMain, dialog, clipboard, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

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
    case 'home':
    default:
      htmlPath = path.join(__dirname, 'index.html');
      break;
  }
  
  await mainWindow.loadFile(htmlPath);
});

// ========== Excel Tool APIs ==========

// 处理文件选择
ipcMain.handle('open-file-dialog', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Excel 文件', extensions: ['xlsx', 'xls'] }
    ]
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// 获取Excel文件的列名
ipcMain.handle('get-excel-headers', async (event, filePath) => {
  try {
    const workbook = XLSX.readFile(filePath, { cellDates: true, raw: false });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    
    if (data.length === 0) {
      return { success: false, message: 'Excel 文件为空或格式不正确' };
    }
    
    const headers = data[0]
      .map(header => {
        if (header === undefined || header === null) return '';
        return String(header).trim();
      })
      .filter(header => header !== '');
    
    if (headers.length === 0) {
      return { success: false, message: 'Excel 文件表头为空' };
    }
    
    return { success: true, headers };
  } catch (error) {
    console.error('读取Excel文件失败：', error);
    return { success: false, message: `读取失败：${error.message}` };
  }
});

// 处理Excel文件
ipcMain.handle('process-excel', async (event, { filePath, operation, selectedColumns }) => {
  try {
    const workbook = XLSX.readFile(filePath, { cellDates: true, raw: false });
    
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return { success: false, message: 'Excel 文件中没有工作表' };
    }
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    
    if (data.length === 0) {
      return { success: false, message: 'Excel 文件为空或格式不正确' };
    }
    
    const headers = data[0].map(header => {
      if (header === undefined || header === null) return '';
      return String(header).trim();
    });
    
    const rows = data.slice(1);
    
    let resultData;
    let newSheetName = sheetName;
    let merges = [];
    
    if (operation === 'merge') {
      const result = mergeCells(rows, headers, selectedColumns);
      resultData = [headers, ...result.rows];
      merges = result.merges;
      newSheetName = sheetName + '_merged';
    } else if (operation === 'unmerge') {
      resultData = unmergeCells(rows, headers, selectedColumns);
      newSheetName = sheetName + '_unmerged';
    } else if (operation === 'stats') {
      const statsResult = groupStats(rows, headers, selectedColumns);
      resultData = statsResult.data;
      merges = statsResult.merges;
      newSheetName = sheetName + '_stats';
    } else {
      return { success: false, message: '未知操作类型' };
    }
    
    const newWorkbook = XLSX.utils.book_new();
    const newWorksheet = XLSX.utils.aoa_to_sheet(resultData);
    
    if ((operation === 'merge' || operation === 'stats') && merges.length > 0) {
      newWorksheet['!merges'] = merges;
    }
    
    XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, newSheetName);
    
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const baseName = path.basename(filePath, ext);
    const operationSuffix = operation === 'merge' ? '_merged' : operation === 'unmerge' ? '_unmerged' : '_stats';
    const newFilePath = path.join(dir, `${baseName}${operationSuffix}${ext}`);
    
    try {
      if (fs.existsSync(newFilePath)) {
        fs.unlinkSync(newFilePath);
      }
    } catch (e) {
      const timestamp = Date.now();
      const newFilePathWithTimestamp = path.join(dir, `${baseName}${operationSuffix}_${timestamp}${ext}`);
      XLSX.writeFile(newWorkbook, newFilePathWithTimestamp);
      return { 
        success: true, 
        message: `处理完成！由于目标文件被占用，文件已保存至：${newFilePathWithTimestamp}`,
        filePath: newFilePathWithTimestamp
      };
    }
    
    XLSX.writeFile(newWorkbook, newFilePath);
    
    return { 
      success: true, 
      message: `处理完成！文件已保存至：${newFilePath}`,
      filePath: newFilePath
    };
  } catch (error) {
    console.error('处理Excel文件时出错：', error);
    return { success: false, message: `处理失败：${error.message}` };
  }
});

// 合并单元格
function mergeCells(rows, headers, selectedColumns) {
  if (!selectedColumns || selectedColumns.length === 0) {
    return { rows, merges: [] };
  }
  
  const columnIndices = selectedColumns
    .map(col => {
      const trimmedCol = String(col).trim();
      return headers.indexOf(trimmedCol);
    })
    .filter(idx => idx !== -1);
  
  const resultRows = rows.map(row => [...row]);
  const merges = [];
  
  const normalizeValue = (val) => {
    if (val === null || val === undefined) return null;
    const strVal = String(val).trim();
    return strVal === '' ? null : strVal;
  };
  
  columnIndices.forEach(colIndex => {
    let startRow = -1;
    let currentValue = null;
    
    for (let i = 0; i <= resultRows.length; i++) {
      const cellValue = i < resultRows.length ? resultRows[i][colIndex] : null;
      const normalizedValue = normalizeValue(cellValue);
      
      const shouldStartNewGroup = normalizedValue !== null && normalizedValue !== currentValue;
      const shouldEndGroup = (shouldStartNewGroup || i === resultRows.length) && startRow >= 0;
      
      if (shouldEndGroup) {
        const mergeLength = i - startRow;
        if (mergeLength > 1) {
          merges.push({
            s: { r: startRow + 1, c: colIndex },
            e: { r: i, c: colIndex }
          });
        }
        
        if (shouldStartNewGroup) {
          startRow = i;
          currentValue = normalizedValue;
        }
      } else if (normalizedValue !== null && startRow < 0) {
        startRow = i;
        currentValue = normalizedValue;
      }
    }
  });
  
  return { rows: resultRows, merges };
}

// 取消合并单元格
function unmergeCells(rows, headers, selectedColumns) {
  if (!selectedColumns || selectedColumns.length === 0) {
    return [headers, ...rows];
  }
  
  const columnIndices = selectedColumns
    .map(col => {
      const trimmedCol = String(col).trim();
      return headers.indexOf(trimmedCol);
    })
    .filter(idx => idx !== -1);
  
  const resultRows = rows.map(row => [...row]);
  
  columnIndices.forEach(colIndex => {
    let lastValue = null;
    
    for (let i = 0; i < resultRows.length; i++) {
      const cellValue = resultRows[i][colIndex];
      
      if (cellValue === null || cellValue === undefined || cellValue === '') {
        resultRows[i][colIndex] = lastValue;
      } else {
        lastValue = cellValue;
      }
    }
  });
  
  return [headers, ...resultRows];
}

// 分组统计
function groupStats(rows, headers, selectedColumns) {
  if (!selectedColumns || selectedColumns.length === 0) {
    return { data: [headers, ...rows], merges: [] };
  }
  
  const columnIndices = selectedColumns
    .map(col => {
      const trimmedCol = String(col).trim();
      return headers.indexOf(trimmedCol);
    })
    .filter(idx => idx !== -1);
  
  const filledRows = rows.map(row => [...row]);
  
  columnIndices.forEach(colIndex => {
    let lastValue = null;
    
    for (let i = 0; i < filledRows.length; i++) {
      const cellValue = filledRows[i][colIndex];
      
      if (cellValue === null || cellValue === undefined || cellValue === '') {
        filledRows[i][colIndex] = lastValue;
      } else {
        lastValue = cellValue;
      }
    }
  });
  
  const groups = {};
  
  filledRows.forEach(row => {
    const key = columnIndices.map(idx => row[idx]).join('|');
    if (!groups[key]) {
      groups[key] = {
        values: columnIndices.map(idx => row[idx]),
        count: 0
      };
    }
    groups[key].count++;
  });
  
  const statsHeaders = [...selectedColumns, '计数'];
  const statsRows = Object.values(groups).map(group => [...group.values, group.count]);
  
  const merges = [];
  const resultData = [statsHeaders, ...statsRows];
  
  for (let colIndex = 0; colIndex < statsHeaders.length - 1; colIndex++) {
    let startRow = 1;
    let currentValue = resultData[1][colIndex];
    
    for (let i = 2; i <= resultData.length; i++) {
      const cellValue = i < resultData.length ? resultData[i][colIndex] : null;
      
      if (cellValue !== currentValue || i === resultData.length) {
        if (i - startRow > 1) {
          merges.push({
            s: { r: startRow, c: colIndex },
            e: { r: i - 1, c: colIndex }
          });
        }
        
        startRow = i;
        currentValue = cellValue;
      }
    }
  }
  
  return { data: resultData, merges };
}

// ========== Image Compressor APIs ==========

ipcMain.handle('paste-image', () => {
  const img = clipboard.readImage();
  if (img.isEmpty()) return null;
  return img.toDataURL();
});

ipcMain.handle('copy-to-clipboard', (e, dataUrl) => {
  const img = nativeImage.createFromDataURL(dataUrl);
  clipboard.writeImage(img);
});

ipcMain.handle('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('maximize-window', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('close-window', () => {
  if (mainWindow) mainWindow.close();
});