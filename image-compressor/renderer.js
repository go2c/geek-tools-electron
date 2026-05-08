// 全局变量
let originalFile = null
let compressedDataUrl = null
let aspectRatio = 1

// DOM选择器
const $ = selector => document.querySelector(selector)

// -------------------------- 工具函数 --------------------------
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
 * 加载图片文件（File对象）到预览区
 * @param {File} file 图片文件对象
 */
function loadImageFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    toast('请选择有效的图片文件', 2500)
    return
  }
  
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
      
      // 更新原图信息
      $('#originalInfo').textContent = `尺寸：${img.width} × ${img.height} px  |  大小：${formatFileSize(file.size)}`
      
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
  const originalPlaceholder = $('#originalPlaceholder')
  const originalImg = $('#originalImg')
  
  if (originalFile) {
    originalEmpty.style.display = 'none'
    originalPlaceholder.style.display = 'none'
    originalImg.style.display = 'block'
  } else {
    originalEmpty.style.display = 'flex'
    originalPlaceholder.style.display = 'block'
    originalImg.style.display = 'none'
  }
  
  const compressedEmpty = $('#compressedEmpty')
  const compressedPlaceholder = $('#compressedPlaceholder')
  const compressedImg = $('#compressedImg')
  
  if (compressedDataUrl) {
    compressedEmpty.style.display = 'none'
    compressedPlaceholder.style.display = 'none'
    compressedImg.style.display = 'block'
  } else {
    compressedEmpty.style.display = 'flex'
    compressedPlaceholder.style.display = 'block'
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
    const dataUrl = await window.electron.pasteImage()
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
      originalFile = new File([blob], 'clipboard-image.png', { type: blob.type })
      
      // 更新原图信息
      $('#originalInfo').textContent = `尺寸：${img.width} × ${img.height} px  |  大小：${formatFileSize(blob.size)}`
      
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
  // 如果已经有图片，显示拖拽提示
  if (originalFile) {
    $('#dropZone').classList.add('active')
    return
  }
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
      const dataUrl = await window.electron.pasteImage()
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
          originalFile = new File([blob], 'clipboard-image.png', { type: blob.type })
          
          // 更新原图信息
          $('#originalInfo').textContent = `尺寸：${img.width} × ${img.height} px  |  大小：${formatFileSize(blob.size)}`
          
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

  if (isNaN(quality) || quality < 0 || quality > 100) {
    toast('压缩质量请输入0-100之间的整数', 2500)
    return
  }
  if (isNaN(targetWidth) || targetWidth <= 0 || isNaN(targetHeight) || targetHeight <= 0) {
    toast('宽高请输入正整数', 2500)
    return
  }

  try {
    // 压缩配置
    const compressOptions = {
      maxWidthOrHeight: Math.max(targetWidth, targetHeight),
      width: targetWidth,
      height: targetHeight,
      useWebWorker: true,
      initialQuality: quality / 100,
      alwaysKeepResolution: true
    }

    // 执行压缩
    const compressedFile = await imageCompression(originalFile, compressOptions)
    // 生成预览地址
    compressedDataUrl = URL.createObjectURL(compressedFile)
    // 显示压缩图
    $('#compressedImg').src = compressedDataUrl
    $('#compressedImg').style.display = 'block'

    // 获取压缩后图片尺寸
    const compressedImg = new Image()
    compressedImg.src = compressedDataUrl
    compressedImg.onload = () => {
      // 更新压缩图信息
      $('#compressedInfo').textContent = `尺寸：${compressedImg.width} × ${compressedImg.height} px  |  大小：${formatFileSize(compressedFile.size)}`
      // 启用操作按钮
      $('#copyBtn').disabled = false
      $('#saveBtn').disabled = false
      // 更新空状态
      updatePreviewEmptyState()
      toast('图片压缩成功')
    }
  } catch (error) {
    toast('压缩失败，请重试', 3000)
    console.error(error)
  }
})

// 4. 复制到剪贴板
$('#copyBtn').addEventListener('click', async () => {
  if (!compressedDataUrl) return
  try {
    await window.electron.copyToClipboard(compressedDataUrl)
    toast('已复制到剪贴板')
  } catch (error) {
    toast('复制失败，请重试', 3000)
    console.error(error)
  }
})

// 5. 保存到本地
$('#saveBtn').addEventListener('click', () => {
  if (!compressedDataUrl) return
  const downloadLink = document.createElement('a')
  downloadLink.href = compressedDataUrl
  downloadLink.download = `compressed-image-${Date.now()}.jpg`
  downloadLink.click()
  toast('图片已保存')
})