// 全局变量
let originalFile = null
let originalFormat = null  // 原图格式
let compressedDataUrl = null
let compressedBlobUrl = null  // 用于预览的 blob URL
let compressedMimeType = 'image/jpeg'  // 当前压缩输出的 MIME 类型
let aspectRatio = 1

// DOM选择器
const $ = selector => document.querySelector(selector)

/**
 * PNG 转 ICO 工具函数
 * ICO 文件格式：文件头 + 目录条目 + PNG数据
 */

/**
 * 将 PNG Uint8Array 转换为 ICO 格式
 * @param {Uint8Array} pngData PNG 格式的图像数据
 * @param {number} width 图标宽度
 * @param {number} height 图标高度
 * @returns {Uint8Array} ICO 格式的图像数据
 */
function pngEntriesToIco(entries) {
  const count = entries.length
  const iconDir = new ArrayBuffer(6)
  const iconDirView = new DataView(iconDir)
  iconDirView.setUint16(0, 0, true)
  iconDirView.setUint16(2, 1, true)
  iconDirView.setUint16(4, count, true)

  const iconEntries = entries.map(entry => {
    const entryBuffer = new ArrayBuffer(16)
    const entryView = new DataView(entryBuffer)
    entryView.setUint8(0, entry.width >= 256 ? 0 : entry.width)
    entryView.setUint8(1, entry.height >= 256 ? 0 : entry.height)
    entryView.setUint8(2, 0)
    entryView.setUint8(3, 0)
    entryView.setUint16(4, 1, true)
    entryView.setUint16(6, 32, true)
    entryView.setUint32(8, entry.pngData.length, true)
    // Offset will be set later
    return { entryBuffer, pngData: entry.pngData }
  })

  let offset = 6 + iconEntries.length * 16
  iconEntries.forEach(item => {
    const itemView = new DataView(item.entryBuffer)
    itemView.setUint32(12, offset, true)
    offset += item.pngData.length
  })

  const result = new Uint8Array(offset)
  result.set(new Uint8Array(iconDir), 0)
  let position = 6
  iconEntries.forEach(item => {
    result.set(new Uint8Array(item.entryBuffer), position)
    position += 16
  })
  iconEntries.forEach(item => {
    result.set(item.pngData, position)
    position += item.pngData.length
  })

  return result
}

function pngToIco(pngData, width, height) {
  return pngEntriesToIco([{ width, height, pngData }])
}

function dataUrlToUint8Array(dataUrl) {
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const array = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i)
  }
  return array
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = dataUrl
  })
}

function createPngDataForSize(img, size) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, size, size)

  const ratio = Math.min(size / img.naturalWidth, size / img.naturalHeight)
  const drawWidth = Math.round(img.naturalWidth * ratio)
  const drawHeight = Math.round(img.naturalHeight * ratio)
  const offsetX = Math.round((size - drawWidth) / 2)
  const offsetY = Math.round((size - drawHeight) / 2)

  ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight)
  return dataUrlToUint8Array(canvas.toDataURL('image/png'))
}

function getIcoSizes(maxSize) {
  const standardSizes = [16, 32, 48, 64, 128, 256]
  const sizes = standardSizes.filter(size => size <= maxSize)
  if (sizes.length === 0) {
    return [Math.min(maxSize, 16)]
  }
  if (!sizes.includes(maxSize) && maxSize <= 256) {
    sizes.push(maxSize)
  }
  return sizes
}

/**
 * 将 data URL (PNG) 转换为 ICO 格式的 Blob，生成多尺寸图标条目
 * @param {string} dataUrl PNG 格式的 data URL
 * @param {number} width 图片宽度
 * @param {number} height 图片高度
 * @returns {Promise<Blob>} ICO 格式的 Blob
 */
async function dataUrlToMultiSizeIcoBlob(dataUrl, width, height) {
  const img = await loadImageFromDataUrl(dataUrl)
  const maxSize = Math.max(width, height)
  const icoSizes = getIcoSizes(maxSize)
  const entries = icoSizes.map(size => ({
    width: size,
    height: size,
    pngData: createPngDataForSize(img, size)
  }))

  const icoData = pngEntriesToIco(entries)
  return new Blob([icoData], { type: 'image/x-icon' })
}

/**
 * 获取文件扩展名
 * @param {string} mimeType MIME 类型
 * @returns {string} 扩展名
 */
function getExtensionFromMimeType(mimeType) {
  const extensions = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
    'image/x-icon': 'ico'
  }
  return extensions[mimeType] || 'png'
}

// -------------------------- 工具函数 --------------------------
/**
 * 根据文件扩展名获取 MIME 类型
 * @param {string} filename 文件名
 * @returns {string} MIME 类型
 */
function getMimeTypeFromName(filename) {
  const ext = filename.split('.').pop().toLowerCase()
  const mimeTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'bmp': 'image/bmp',
    'ico': 'image/x-icon',
    'svg': 'image/svg+xml',
    'tiff': 'image/tiff',
    'tif': 'image/tiff'
  }
  return mimeTypes[ext] || 'image/png'
}

/**
 * 获取格式显示名称
 * @param {string} mimeType MIME 类型
 * @returns {string} 显示名称
 */
function getFormatDisplayName(mimeType) {
  const names = {
    'image/jpeg': 'JPEG',
    'image/png': 'PNG',
    'image/gif': 'GIF',
    'image/webp': 'WebP',
    'image/bmp': 'BMP',
    'image/x-icon': 'ICO',
    'image/svg+xml': 'SVG',
    'image/tiff': 'TIFF'
  }
  return names[mimeType] || mimeType
}

/**
 * HeroUI风格Toast通知
 * @param {string} message 提示内容
 * @param {number} duration 显示时长，默认2000ms
 */
function toast(message, duration = 2000) {
  const toastEl = $('#toast')
  toastEl.textContent = message
  toastEl.classList.add('show')
  
  setTimeout(() => {
    toastEl.classList.remove('show')
  }, duration)
}

/**
 * 格式化文件大小，自动适配单位
 * @param {number} bytes 字节数
 * @returns {string} 格式化后的大小
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * 将图片URL转换为data URL（用于复制到剪贴板）
 * @param {string} url 图片URL（支持blob URL）
 * @returns {Promise<string>} data URL
 */
function loadImageAsDataUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = url
  })
}

/**
 * 将图片URL转换为指定格式的data URL
 * @param {string} url 图片URL（支持blob URL）
 * @param {string} mimeType 目标MIME类型
 * @param {number} quality 质量（0-1）
 * @returns {Promise<string>} data URL
 */
function loadImageAsDataUrlWithFormat(url, mimeType, quality = 0.92) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      
      // ICO 格式：canvas.toDataURL 不直接支持，需要使用 PNG
      // 或者使用ICO.js库，这里简化为 PNG（因为大多数情况下 ICO 转换是嵌入 PNG）
      const outputType = mimeType === 'image/x-icon' ? 'image/png' : mimeType
      
      ctx.drawImage(img, 0, 0)
      
      // GIF 不支持 quality 参数
      if (outputType === 'image/gif') {
        resolve(canvas.toDataURL('image/gif'))
      } else {
        resolve(canvas.toDataURL(outputType, quality))
      }
    }
    img.onerror = reject
    img.src = url
  })
}

/**
 * 加载图片文件（File对象）到预览区
 * @param {File} file 图片文件对象
 */
function loadImageFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    toast('请选择有效的图片文件', 2500)
    return
  }
  
  // 检测原图格式
  originalFormat = file.type || getMimeTypeFromName(file.name)
  
  const reader = new FileReader()
  reader.onload = (e) => {
    const dataUrl = e.target.result
    const img = new Image()
    img.src = dataUrl
    img.onload = () => {
      // 记录原图纵横比
      aspectRatio = img.width / img.height
      // 填充宽高输入框
      $('#width').value = img.width
      $('#height').value = img.height
      // 显示原图
      $('#originalImg').src = dataUrl
      $('#originalImg').style.display = 'block'
      
      // 记录文件对象用于压缩
      originalFile = file
      
      // 更新原图信息（包含格式）
      const formatName = getFormatDisplayName(originalFormat)
      $('#originalInfo').textContent = `尺寸：${img.width} × ${img.height} px  |  大小：${formatFileSize(file.size)}  |  格式：${formatName}`
      
      // 重置压缩状态
      compressedDataUrl = null
      $('#compressedImg').src = ''
      $('#compressedInfo').textContent = '--'
      $('#copyBtn').disabled = true
      $('#saveBtn').disabled = true
      
      // 更新空状态
      updatePreviewEmptyState()
      toast('图片加载成功')
    }
  }
  reader.readAsDataURL(file)
}

/**
 * 更新预览图的空状态显示
 */
function updatePreviewEmptyState() {
  const originalEmpty = $('#originalEmpty')
  const originalImg = $('#originalImg')
  
  if (originalFile) {
    originalEmpty.style.display = 'none'
    originalImg.style.display = 'block'
  } else {
    originalEmpty.style.display = 'flex'
    originalImg.style.display = 'none'
  }
  
  const compressedEmpty = $('#compressedEmpty')
  const compressedImg = $('#compressedImg')
  
  if (compressedDataUrl) {
    compressedEmpty.style.display = 'none'
    compressedImg.style.display = 'block'
  } else {
    compressedEmpty.style.display = 'flex'
    compressedImg.style.display = 'none'
  }
}

// -------------------------- 核心功能逻辑 --------------------------
// 返回按钮
$('#backBtn').addEventListener('click', () => {
  window.electronAPI.navigateTo('home');
});

// 1. 从剪贴板获取图片
$('#pasteBtn').addEventListener('click', async () => {
  try {
    const result = await window.electron.pasteImage()
    // 处理返回值可能是对象或字符串的情况
    const dataUrl = typeof result === 'string' ? result : (result.success !== false ? result.dataUrl : null)
    if (!dataUrl) {
      toast('剪贴板中没有找到图片', 2500)
      return
    }

    // 加载图片获取尺寸
    const img = new Image()
    img.src = dataUrl
    img.onload = async () => {
      // 记录原图纵横比
      aspectRatio = img.width / img.height
      // 填充宽高输入框
      $('#width').value = img.width
      $('#height').value = img.height
      // 显示原图
      $('#originalImg').src = dataUrl
      $('#originalImg').style.display = 'block'
      
      // 转换为File对象用于压缩
      const blob = await fetch(dataUrl).then(res => res.blob())
      originalFormat = blob.type || 'image/png'
      originalFile = new File([blob], 'clipboard-image.png', { type: blob.type })
      
      // 更新原图信息
      const formatName = getFormatDisplayName(originalFormat)
      $('#originalInfo').textContent = `尺寸：${img.width} × ${img.height} px  |  大小：${formatFileSize(blob.size)}  |  格式：${formatName}`
      
      // 重置压缩状态
      compressedDataUrl = null
      $('#compressedImg').src = ''
      $('#compressedInfo').textContent = '--'
      $('#copyBtn').disabled = true
      $('#saveBtn').disabled = true
      
      // 更新空状态
      updatePreviewEmptyState()
      toast('图片加载成功')
    }
  } catch (error) {
    toast('图片加载失败，请重试', 3000)
    console.error(error)
  }
})

// 1.5 文件选择（点击原图区域）
$('#originalWrapper').addEventListener('click', (e) => {
  // 如果点击的是操作按钮，不触發文件选择
  if (e.target.closest('.img-actions') || e.target.closest('#dropZone')) return
  // 如果已经有图片，不显示拖拽提示，直接打开文件选择
  // 没有图片时，直接打开文件选择
  $('#fileInput').click()
})

// 文件选择 input 变化
$('#fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0]
  if (file) {
    loadImageFile(file)
  }
  e.target.value = '' // 重置input允许重复选择同一文件
})

// 原图区域拖拽事件
const originalWrapper = $('#originalWrapper')
const dropZone = $('#dropZone')

// 拖入时显示拖拽区域
originalWrapper.addEventListener('dragenter', (e) => {
  e.preventDefault()
  e.stopPropagation()
  dropZone.classList.add('active')
})

// 拖拽悬停
originalWrapper.addEventListener('dragover', (e) => {
  e.preventDefault()
  e.stopPropagation()
  dropZone.classList.add('active')
})

// 拖出时隐藏拖拽区域
originalWrapper.addEventListener('dragleave', (e) => {
  e.preventDefault()
  e.stopPropagation()
  // 只有当真正离开wrapper区域时才隐藏
  if (!originalWrapper.contains(e.relatedTarget)) {
    dropZone.classList.remove('active')
  }
})

// 释放文件时加载
originalWrapper.addEventListener('drop', (e) => {
  e.preventDefault()
  e.stopPropagation()
  dropZone.classList.remove('active')
  
  const files = e.dataTransfer.files
  if (files.length > 0) {
    loadImageFile(files[0])
  }
})

// 点击拖拽区域也打开文件选择
dropZone.addEventListener('click', () => {
  $('#fileInput').click()
})

// 1.6 全局 Ctrl+V 粘贴快捷键
document.addEventListener('keydown', async (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
    // 尝试从剪贴板获取图片
    try {
      const result = await window.electron.pasteImage()
      // 处理返回值可能是对象或字符串的情况
      const dataUrl = typeof result === 'string' ? result : (result.success !== false ? result.dataUrl : null)
      if (dataUrl) {
        e.preventDefault()
        // 加载图片获取尺寸
        const img = new Image()
        img.src = dataUrl
        img.onload = async () => {
          // 记录原图纵横比
          aspectRatio = img.width / img.height
          // 填充宽高输入框
          $('#width').value = img.width
          $('#height').value = img.height
          // 显示原图
          $('#originalImg').src = dataUrl
          $('#originalImg').style.display = 'block'
          
          // 转换为File对象用于压缩
          const blob = await fetch(dataUrl).then(res => res.blob())
          originalFormat = blob.type || 'image/png'
          originalFile = new File([blob], 'clipboard-image.png', { type: blob.type })
          
          // 更新原图信息
          const formatName = getFormatDisplayName(originalFormat)
          $('#originalInfo').textContent = `尺寸：${img.width} × ${img.height} px  |  大小：${formatFileSize(blob.size)}  |  格式：${formatName}`
          
          // 重置压缩状态
          compressedDataUrl = null
          $('#compressedImg').src = ''
          $('#compressedInfo').textContent = '--'
          $('#copyBtn').disabled = true
          $('#saveBtn').disabled = true
          
          // 更新空状态
          updatePreviewEmptyState()
          toast('图片粘贴成功')
        }
      }
    } catch (error) {
      console.error('粘贴失败:', error)
    }
  }
})

// 2. 保持纵横比联动
$('#width').addEventListener('input', () => {
  if (!$('#keepRatio').checked || !originalFile) return
  const targetWidth = parseInt($('#width').value)
  if (!targetWidth || targetWidth <= 0) return
  $('#height').value = Math.round(targetWidth / aspectRatio)
})

$('#height').addEventListener('input', () => {
  if (!$('#keepRatio').checked || !originalFile) return
  const targetHeight = parseInt($('#height').value)
  if (!targetHeight || targetHeight <= 0) return
  $('#width').value = Math.round(targetHeight * aspectRatio)
})

// 3. 执行图片压缩
$('#compressBtn').addEventListener('click', async () => {
  if (!originalFile) {
    toast('请先加载图片', 2500)
    return
  }

  // 校验参数
  const quality = parseInt($('#quality').value)
  const targetWidth = parseInt($('#width').value)
  const targetHeight = parseInt($('#height').value)
  const outputFormat = $('#outputFormat').value

  if (isNaN(quality) || quality < 0 || quality > 100) {
    toast('压缩质量请输入0-100之间的整数', 2500)
    return
  }
  if (isNaN(targetWidth) || targetWidth <= 0 || isNaN(targetHeight) || targetHeight <= 0) {
    toast('宽高请输入正整数', 2500)
    return
  }

  try {
    // 确定输出 MIME 类型
    const isIcoFormat = outputFormat === 'image/x-icon'
    let targetMimeType = outputFormat === 'original' ? originalFormat : outputFormat
    
    // ICO 格式特殊处理：先压缩为 PNG，然后转换为 ICO
    if (isIcoFormat) {
      targetMimeType = 'image/png'
    }
    
    // 压缩配置
    const compressOptions = {
      maxWidthOrHeight: Math.max(targetWidth, targetHeight),
      width: targetWidth,
      height: targetHeight,
      useWebWorker: true,
      initialQuality: quality / 100,
      alwaysKeepResolution: true,
      fileType: targetMimeType
    }

    // 执行压缩
    const compressedFile = await imageCompression(originalFile, compressOptions)
    
    // 生成预览地址（blob URL）
    compressedBlobUrl = URL.createObjectURL(compressedFile)
    
    // 获取压缩后的尺寸
    const compressedImg = new Image()
    await new Promise((resolve, reject) => {
      compressedImg.src = compressedBlobUrl
      compressedImg.onload = resolve
      compressedImg.onerror = reject
    })
    
    // ICO 格式：生成真正的 ICO 文件
    let actualFileSize = compressedFile.size  // 默认使用压缩后的 PNG 大小
    if (isIcoFormat) {
      // 加载为 data URL
      const pngDataUrl = await loadImageAsDataUrl(compressedBlobUrl)
      // 转换为 ICO，生成多个标准尺寸条目
      const icoBlob = await dataUrlToMultiSizeIcoBlob(pngDataUrl, compressedImg.width, compressedImg.height)
      actualFileSize = icoBlob.size  // 使用 ICO 实际大小
      compressedBlobUrl = URL.createObjectURL(icoBlob)
      compressedMimeType = 'image/x-icon'
      compressedDataUrl = pngDataUrl // 保存 PNG 用于复制
      // 显示预览（使用 PNG 预览，因为 ICO 预览可能不兼容）
      $('#compressedImg').src = pngDataUrl
    } else {
      // 其他格式：正常转换
      const dataUrl = await loadImageAsDataUrlWithFormat(compressedBlobUrl, targetMimeType, quality / 100)
      compressedDataUrl = dataUrl
      compressedMimeType = targetMimeType
      // 显示压缩图
      $('#compressedImg').src = compressedBlobUrl
    }
    
    $('#compressedImg').style.display = 'block'

    // 更新压缩图信息
    const formatName = getFormatDisplayName(isIcoFormat ? 'image/x-icon' : targetMimeType)
    $('#compressedInfo').textContent = `尺寸：${compressedImg.width} × ${compressedImg.height} px  |  大小：${formatFileSize(actualFileSize)}  |  格式：${formatName}`
    // 启用操作按钮
    $('#copyBtn').disabled = false
    $('#saveBtn').disabled = false
    // 更新空状态
    updatePreviewEmptyState()
    toast('图片压缩成功')
  } catch (error) {
    toast('压缩失败，请重试', 3000)
    console.error(error)
  }
})

// 4. 复制到剪贴板
$('#copyBtn').addEventListener('click', async () => {
  if (!compressedDataUrl) return
  try {
    const result = await window.electron.copyToClipboard(compressedDataUrl)
    if (result && result.success !== false) {
      toast('已复制到剪贴板')
    } else {
      toast(result?.message || '复制失败，请重试', 3000)
    }
  } catch (error) {
    toast('复制失败，请重试', 3000)
    console.error(error)
  }
})

// 5. 保存到本地
$('#saveBtn').addEventListener('click', () => {
  if (!compressedDataUrl && !compressedBlobUrl) return
  
  const ext = getExtensionFromMimeType(compressedMimeType)
  
  // ICO 格式：使用 blob URL 下载
  if (compressedMimeType === 'image/x-icon' && compressedBlobUrl) {
    const downloadLink = document.createElement('a')
    downloadLink.href = compressedBlobUrl
    downloadLink.download = `compressed-image-${Date.now()}.${ext}`
    downloadLink.click()
  } else if (compressedDataUrl) {
    const downloadLink = document.createElement('a')
    downloadLink.href = compressedDataUrl
    downloadLink.download = `compressed-image-${Date.now()}.${ext}`
    downloadLink.click()
  }
  toast('图片已保存')
})

// -------------------------- 全屏预览功能 --------------------------
let currentZoom = 1

/**
 * 打开全屏预览
 */
/**
 * 全屏预览滚轮缩放处理
 * @param {WheelEvent} e 滚轮事件
 */
function handleFullscreenWheel(e) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  zoomImage(delta)
}

function openFullscreenPreview() {
  if (!compressedDataUrl) return
  
  const modal = $('#fullscreenModal')
  const img = $('#fullscreenImage')
  
  img.src = compressedDataUrl
  img.style.transform = `scale(${currentZoom})`
  $('#zoomLevel').textContent = `${Math.round(currentZoom * 100)}%`
  
  modal.classList.add('show')
  document.body.style.overflow = 'hidden'
  
  // 添加滚轮事件监听
  $('#fullscreenModal').addEventListener('wheel', handleFullscreenWheel, { passive: false })
}

/**
 * 关闭全屏预览
 */
function closeFullscreenPreview() {
  const modal = $('#fullscreenModal')
  modal.classList.remove('show')
  document.body.style.overflow = ''
  
  // 移除滚轮事件监听
  $('#fullscreenModal').removeEventListener('wheel', handleFullscreenWheel)
}

/**
 * 缩放图片
 * @param {number} delta 缩放增量
 */
function zoomImage(delta) {
  const img = $('#fullscreenImage')
  currentZoom = Math.max(0.25, Math.min(3, currentZoom + delta))
  img.style.transform = `scale(${currentZoom})`
  $('#zoomLevel').textContent = `${Math.round(currentZoom * 100)}%`
}

/**
 * 重置缩放
 */
function resetZoom() {
  const img = $('#fullscreenImage')
  currentZoom = 1
  img.style.transform = `scale(${currentZoom})`
  $('#zoomLevel').textContent = '100%'
}

// 压缩后图片点击事件
$('#compressedImg').addEventListener('click', () => {
  if (compressedDataUrl) {
    openFullscreenPreview()
  }
})

// 全屏预览关闭按钮
$('#fullscreenClose').addEventListener('click', closeFullscreenPreview)

// 全屏遮罩点击关闭
$('#fullscreenOverlay').addEventListener('click', closeFullscreenPreview)

// 缩放控制按钮
$('#zoomOutBtn').addEventListener('click', () => zoomImage(-0.25))
$('#zoomInBtn').addEventListener('click', () => zoomImage(0.25))
$('#zoomResetBtn').addEventListener('click', resetZoom)

// ESC键关闭全屏预览 和 Enter键触发压缩
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('#fullscreenModal').classList.contains('show')) {
    closeFullscreenPreview()
  }
  
  // Enter键触发压缩
  if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
    // 检查是否在输入框中
    const activeElement = document.activeElement
    if (activeElement.tagName !== 'INPUT') {
      $('#compressBtn').click()
    }
  }
})