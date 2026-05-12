const { ipcMain, clipboard, nativeImage } = require('electron');

// 从剪贴板获取图片
ipcMain.handle('paste-image', async () => {
  try {
    const image = clipboard.readImage();
    
    if (image.isEmpty()) {
      return { success: false, message: '剪贴板中没有图片' };
    }
    
    const buffer = image.toPNG();
    const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`;
    
    return {
      success: true,
      dataUrl,
      width: image.getSize().width,
      height: image.getSize().height
    };
  } catch (error) {
    console.error('获取剪贴板图片失败：', error);
    return { success: false, message: `获取失败：${error.message}` };
  }
});

// 复制图片到剪贴板（copy-image）
ipcMain.handle('copy-image', async (event, dataUrl) => {
  try {
    const base64Data = dataUrl.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');
    const image = nativeImage.createFromBuffer(buffer);
    
    clipboard.writeImage(image);
    
    return { success: true, message: '图片已复制到剪贴板' };
  } catch (error) {
    console.error('复制图片失败：', error);
    return { success: false, message: `复制失败：${error.message}` };
  }
});

// 复制图片到剪贴板（copy-to-clipboard，兼容旧版调用）
ipcMain.handle('copy-to-clipboard', async (event, dataUrl) => {
  try {
    const base64Data = dataUrl.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');
    const image = nativeImage.createFromBuffer(buffer);
    
    clipboard.writeImage(image);
    
    return { success: true, message: '图片已复制到剪贴板' };
  } catch (error) {
    console.error('复制图片失败：', error);
    return { success: false, message: `复制失败：${error.message}` };
  }
});