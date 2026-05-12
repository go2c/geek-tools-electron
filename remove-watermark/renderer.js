// 全局变量
let originalFile = null;
let originalImage = null;
let originalWidth = 0;
let originalHeight = 0;
let maskCanvas = null;
let maskCtx = null;
let brushSize = 20;

// AI 模式相关变量
let aiModeEnabled = true;  // 是否启用 AI 模式
let aiModelReady = false;   // AI 模型是否就绪

// ==================== AI 模式功能 ====================

/**
 * 检查 AI 模型状态
 */
async function checkAIModel() {
    if (typeof window.watermarkAI !== 'undefined') {
        try {
            const status = await window.watermarkAI.checkModel();
            console.log('AI 模型完整状态:', JSON.stringify(status, null, 2));
            
            // 使用 modelLoaded 字段判断模型是否真正加载完成
            aiModelReady = status.available || status.modelLoaded === true;
            
            const aiBtn = document.getElementById('aiModeBtn');
            if (aiBtn) {
                if (aiModelReady) {
                    aiBtn.title = 'LaMa 模型已就绪';
                    aiBtn.style.opacity = '1';
                    aiBtn.classList.add('active');
                    const hint = document.getElementById('modeHint');
                    if (hint) hint.textContent = 'AI 已启用，涂抹水印后点击去除';
                } else {
                    aiBtn.title = status.message || 'AI 模型未就绪';
                    aiBtn.style.opacity = '0.6';
                    const hint = document.getElementById('modeHint');
                    if (hint) hint.textContent = status.message || 'AI 模型加载中...';
                }
            }
            
            console.log('AI 模型状态:', status.message);
            console.log('aiModelReady 设置为:', aiModelReady);
            
            return status;
        } catch (e) {
            console.error('检查 AI 模型失败:', e);
            return { available: false, message: 'API 不可用: ' + e.message };
        }
    }
    return { available: false, message: 'AI API 未加载' };
}

/**
 * 启用/禁用 AI 模式
 */
async function toggleAIMode() {
    aiModeEnabled = !aiModeEnabled;
    
    if (aiModeEnabled && !aiModelReady) {
        const status = await checkAIModel();
        if (!status.available) {
            aiModeEnabled = false;
            showToast('AI 模型未就绪', 'error');
            return;
        }
    }
    
    const aiBtn = document.getElementById('aiModeBtn');
    if (aiBtn) {
        aiBtn.classList.toggle('active', aiModeEnabled);
        aiBtn.innerHTML = aiModeEnabled 
            ? '<span class="icon">✅</span>AI 已启用'
            : '<span class="icon">🤖</span>启用 AI 深度修复';
    }
    
    const hint = document.getElementById('modeHint');
    if (hint) {
        hint.textContent = aiModeEnabled 
            ? 'AI 模式已启用，将使用 LaMa 深度学习模型修复'
            : '涂抹水印区域后点击去除水印';
    }
    
    console.log('AI 模式:', aiModeEnabled ? '已启用' : '已禁用');
}

/**
 * 使用 AI 执行去水印
 */
async function performAIInpaint(srcCanvas, maskCanvas) {
    if (!aiModelReady) {
        showToast('AI 模型未就绪', 'error');
        return null;
    }
    
    try {
        showToast('正在使用 AI 深度修复...', 'success');
        
        const imageBase64 = srcCanvas.toDataURL('image/png');
        const maskBase64 = maskCanvas.toDataURL('image/png');
        
        const result = await window.watermarkAI.inpaint(imageBase64, maskBase64, originalWidth, originalHeight);
        
        if (result.success) {
            return result.result;
        } else {
            showToast('AI 修复失败: ' + result.error, 'error');
            return null;
        }
    } catch (e) {
        console.error('AI 修复异常:', e);
        showToast('AI 修复异常', 'error');
        return null;
    }
}

/**
 * 初始化 AI 模式
 */
function initAIMode() {
    const aiBtn = document.getElementById('aiModeBtn');
    if (aiBtn) {
        aiBtn.addEventListener('click', toggleAIMode);
    }
    // 初始化时检查 AI 模型状态
    checkAIModel();
    
    // 定期检查模型状态直到加载完成
    const checkInterval = setInterval(async () => {
        if (aiModelReady) {
            clearInterval(checkInterval);
            return;
        }
        await checkAIModel();
    }, 2000); // 每2秒检查一次
    
    // 最多检查30秒
    setTimeout(() => clearInterval(checkInterval), 30000);
}

/**
 * 切换到涂抹模式
 */
function switchToBrushMode() {
    currentMode = 'brush';
    document.getElementById('brushModeBtn').classList.add('active');
    document.getElementById('rectModeBtn').classList.remove('active');
    document.getElementById('modeHint').textContent = '点击图片区域涂抹水印';
    
    const wrapper = document.getElementById('originalPreview');
    wrapper.style.cursor = 'crosshair';
    
    // 移除框选矩形
    if (selectionRectElement) {
        selectionRectElement.remove();
        selectionRectElement = null;
    }
    
    console.log('切换到涂抹模式');
}

/**
 * 切换到框选模式
 */
function switchToRectMode() {
    currentMode = 'rect';
    document.getElementById('brushModeBtn').classList.remove('active');
    document.getElementById('rectModeBtn').classList.add('active');
    document.getElementById('modeHint').textContent = '框选水印文字区域，系统将自动检测并清除';
    
    const wrapper = document.getElementById('originalPreview');
    wrapper.style.cursor = 'crosshair';
    
    console.log('切换到框选模式');
}

/**
 * 处理鼠标按下事件
 */
function handleWrapperMouseDown(e) {
    if (!originalImage || currentMode !== 'rect') return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = originalWidth / rect.width;
    const scaleY = originalHeight / rect.height;
    
    rectStartX = (e.clientX - rect.left) * scaleX;
    rectStartY = (e.clientY - rect.top) * scaleY;
    isSelectingRect = true;
    
    console.log(`框选开始: (${rectStartX}, ${rectStartY})`);
}

/**
 * 处理鼠标移动事件
 */
function handleWrapperMouseMove(e) {
    if (!isSelectingRect || currentMode !== 'rect') return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = originalWidth / rect.width;
    const scaleY = originalHeight / rect.height;
    
    const currentX = (e.clientX - rect.left) * scaleX;
    const currentY = (e.clientY - rect.top) * scaleY;
    
    // 更新或创建框选矩形元素
    updateSelectionRectUI(e.currentTarget, rectStartX, rectStartY, currentX, currentY, rect.width, rect.height);
}

/**
 * 处理鼠标释放事件
 */
function handleWrapperMouseUp(e) {
    if (!isSelectingRect || currentMode !== 'rect') return;
    
    isSelectingRect = false;
    
    const wrapper = e.currentTarget;
    const rect = wrapper.getBoundingClientRect();
    const scaleX = originalWidth / rect.width;
    const scaleY = originalHeight / rect.height;
    
    const endX = (e.clientX - rect.left) * scaleX;
    const endY = (e.clientY - rect.top) * scaleY;
    
    // 保存选区
    selectionRect = {
        x1: Math.min(rectStartX, endX),
        y1: Math.min(rectStartY, endY),
        x2: Math.max(rectStartX, endX),
        y2: Math.max(rectStartY, endY)
    };
    
    // 确保选区有一定大小
    if (selectionRect.x2 - selectionRect.x1 > 10 && selectionRect.y2 - selectionRect.y1 > 10) {
        console.log(`框选完成: (${selectionRect.x1}, ${selectionRect.y1}) -> (${selectionRect.x2}, ${selectionRect.y2})`);
        
        // 自动检测并处理文字水印
        autoDetectAndInpaintText(selectionRect);
    } else {
        console.log('选区太小，取消');
        if (selectionRectElement) {
            selectionRectElement.remove();
            selectionRectElement = null;
        }
        selectionRect = null;
    }
}

/**
 * 处理鼠标离开事件
 */
function handleWrapperMouseLeave(e) {
    if (isSelectingRect) {
        isSelectingRect = false;
        if (selectionRectElement) {
            selectionRectElement.remove();
            selectionRectElement = null;
        }
    }
}

/**
 * 更新框选矩形的UI显示
 */
function updateSelectionRectUI(wrapper, x1, y1, x2, y2, displayWidth, displayHeight) {
    if (!selectionRectElement) {
        selectionRectElement = document.createElement('div');
        selectionRectElement.className = 'selection-rect';
        wrapper.appendChild(selectionRectElement);
    }
    
    // 转换为显示坐标
    const scaleX = displayWidth / originalWidth;
    const scaleY = displayHeight / originalHeight;
    
    const displayX1 = Math.min(x1, x2) * scaleX;
    const displayY1 = Math.min(y1, y2) * scaleY;
    const displayX2 = Math.max(x1, x2) * scaleX;
    const displayY2 = Math.max(y1, y2) * scaleY;
    
    selectionRectElement.style.left = displayX1 + 'px';
    selectionRectElement.style.top = displayY1 + 'px';
    selectionRectElement.style.width = (displayX2 - displayX1) + 'px';
    selectionRectElement.style.height = (displayY2 - displayY1) + 'px';
}

/**
 * 自动检测并修复选区中的文字水印
 */
function autoDetectAndInpaintText(rect) {
    console.log('自动检测选区中的文字水印...');
    
    if (!originalImage) {
        showToast('请先加载图片');
        return;
    }
    
    // 创建原图画布
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = originalWidth;
    srcCanvas.height = originalHeight;
    const srcCtx = srcCanvas.getContext('2d');
    srcCtx.drawImage(originalImage, 0, 0);
    
    // 分析选区中的内容
    const analysis = analyzeSelectionForText(srcCanvas, rect);
    console.log('选区分析结果:', analysis);
    
    if (analysis.hasText) {
        showToast(`检测到疑似文字水印，正在清除...`);
        
        // 创建掩码
        const maskCanvas = createTextMask(srcCanvas, rect, analysis);
        
        // 执行修复
        performInpaintForText(srcCanvas, maskCanvas, rect);
    } else {
        showToast('选区中未检测到明显文字水印特征');
    }
}

/**
 * 分析选区中是否包含文字水印
 */
function analyzeSelectionForText(srcCanvas, rect) {
    const srcCtx = srcCanvas.getContext('2d');
    
    // 扩展选区以包含上下文
    const padding = 10;
    const x1 = Math.max(0, rect.x1 - padding);
    const y1 = Math.max(0, rect.y1 - padding);
    const x2 = Math.min(originalWidth, rect.x2 + padding);
    const y2 = Math.min(originalHeight, rect.y2 + padding);
    
    const width = x2 - x1;
    const height = y2 - y1;
    
    const imageData = srcCtx.getImageData(x1, y1, width, height);
    const data = imageData.data;
    
    // 分析颜色分布
    let colors = [];
    for (let i = 0; i < data.length; i += 4) {
        colors.push({
            r: data[i],
            g: data[i + 1],
            b: data[i + 2],
            brightness: (data[i] + data[i + 1] + data[i + 2]) / 3
        });
    }
    
    // 计算亮度分布的标准差
    const brightnesses = colors.map(c => c.brightness);
    const mean = brightnesses.reduce((a, b) => a + b, 0) / brightnesses.length;
    const variance = brightnesses.reduce((a, b) => a + (b - mean) ** 2, 0) / brightnesses.length;
    const stdDev = Math.sqrt(variance);
    
    // 计算颜色唯一值数量（文字通常颜色较单一）
    const uniqueColors = new Set();
    for (const c of colors) {
        uniqueColors.add(`${Math.round(c.r / 10)}-${Math.round(c.g / 10)}-${Math.round(c.b / 10)}`);
    }
    const colorVariety = uniqueColors.size / colors.length;
    
    // 检测边缘密度（文字有明显的边缘）
    let edgeCount = 0;
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;
            const brightness = data[idx];
            const neighborBrightness = (
                data[(y - 1) * width * 4] +
                data[(y + 1) * width * 4] +
                data[y * width * 4 + 4] +
                data[y * width * 4 - 4]
            ) / 4;
            
            if (Math.abs(brightness - neighborBrightness) > 30) {
                edgeCount++;
            }
        }
    }
    const edgeDensity = edgeCount / (width * height);
    
    // 综合判断
    const hasText = (stdDev > 15 && stdDev < 80) && 
                    (colorVariety < 0.3 || edgeDensity > 0.05);
    
    console.log(`分析: 标准差=${stdDev.toFixed(1)}, 颜色多样性=${colorVariety.toFixed(3)}, 边缘密度=${edgeDensity.toFixed(4)}`);
    console.log(`文字水印检测结果: ${hasText ? '是' : '否'}`);
    
    return {
        hasText,
        stdDev,
        colorVariety,
        edgeDensity,
        bounds: { x1, y1, x2, y2 }
    };
}

/**
 * 创建文字水印掩码
 */
function createTextMask(srcCanvas, rect, analysis) {
    const srcCtx = srcCanvas.getContext('2d');
    
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = originalWidth;
    maskCanvas.height = originalHeight;
    const maskCtx = maskCanvas.getContext('2d');
    
    // 填充白色掩码（需要修复的区域）
    maskCtx.fillStyle = 'white';
    
    // 获取原图和背景颜色对比
    const sampleData = srcCtx.getImageData(
        analysis.bounds.x1, 
        analysis.bounds.y1, 
        analysis.bounds.x2 - analysis.bounds.x1, 
        analysis.bounds.y2 - analysis.bounds.y1
    );
    
    // 分析水印颜色（通常比背景更亮或更暗）
    let lightPixels = 0, darkPixels = 0;
    const data = sampleData.data;
    
    for (let i = 0; i < data.length; i += 4) {
        const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
        if (brightness > 180) lightPixels++;
        if (brightness < 75) darkPixels++;
    }
    
    const isLightWatermark = lightPixels > darkPixels;
    console.log(`水印类型: ${isLightWatermark ? '亮色' : '暗色'}`);
    
    // 使用颜色阈值检测文字区域
    const detectData = srcCtx.getImageData(
        analysis.bounds.x1,
        analysis.bounds.y1,
        analysis.bounds.x2 - analysis.bounds.x1,
        analysis.bounds.y2 - analysis.bounds.y1
    );
    const detectArr = detectData.data;
    
    // 创建精确的掩码
    const maskImageData = maskCtx.createImageData(originalWidth, originalHeight);
    const maskArr = maskImageData.data;
    
    const threshold = isLightWatermark ? 180 : 75;
    
    for (let y = analysis.bounds.y1; y < analysis.bounds.y2; y++) {
        for (let x = analysis.bounds.x1; x < analysis.bounds.x2; x++) {
            const detectIdx = ((y - analysis.bounds.y1) * (analysis.bounds.x2 - analysis.bounds.x1) + (x - analysis.bounds.x1)) * 4;
            const brightness = (detectArr[detectIdx] + detectArr[detectIdx + 1] + detectArr[detectIdx + 2]) / 3;
            
            const maskIdx = (y * originalWidth + x) * 4;
            
            // 检测符合水印颜色特征的像素
            if (isLightWatermark && brightness > threshold) {
                maskArr[maskIdx] = 255;
                maskArr[maskIdx + 1] = 255;
                maskArr[maskIdx + 2] = 255;
                maskArr[maskIdx + 3] = 255;
            } else if (!isLightWatermark && brightness < threshold) {
                maskArr[maskIdx] = 255;
                maskArr[maskIdx + 1] = 255;
                maskArr[maskIdx + 2] = 255;
                maskArr[maskIdx + 3] = 255;
            }
        }
    }
    
    maskCtx.putImageData(maskImageData, 0, 0);
    
    // 膨胀掩码以包含水印边缘
    if (opencvReady && typeof cv !== 'undefined') {
        const maskMat = cv.imread(maskCanvas);
        const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
        const dilated = new cv.Mat();
        cv.dilate(maskMat, dilated, kernel);
        cv.imshow(maskCanvas, dilated);
        
        maskMat.delete();
        dilated.delete();
        kernel.delete();
    }
    
    return maskCanvas;
}

/**
 * 对文字水印执行修复
 */
async function performInpaintForText(srcCanvas, maskCanvas, rect) {
    showToast('正在处理...', 'success');
    
    let resultCanvas;
    
    // 优先使用 AI 模式（如果启用且可用）
    if (aiModeEnabled && aiModelReady) {
        console.log('使用 AI 深度修复模式...');
        const aiResult = await performAIInpaint(srcCanvas, maskCanvas);
        if (aiResult) {
            // 将 Base64 转换为 Canvas
            const img = new Image();
            img.src = aiResult;
            await new Promise(resolve => img.onload = resolve);
            
            resultCanvas = document.createElement('canvas');
            resultCanvas.width = originalWidth;
            resultCanvas.height = originalHeight;
            const ctx = resultCanvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
        }
    }
    
    // 使用 OpenCV 修复（如果没有 AI 结果或 AI 未启用）
    if (opencvReady && typeof cv !== 'undefined') {
        try {
            console.log('使用OpenCV强力修复...');
            
            const srcMat = cv.imread(srcCanvas);
            const maskMat = cv.imread(maskCanvas);
            
            // 转换为灰度掩码
            const grayMask = new cv.Mat();
            cv.cvtColor(maskMat, grayMask, cv.COLOR_RGBA2GRAY);
            
            // 二值化
            const binaryMask = new cv.Mat();
            cv.threshold(grayMask, binaryMask, 125, 255, cv.THRESH_BINARY);
            
            // 形态学闭运算填充小孔洞
            const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
            const closedMask = new cv.Mat();
            cv.morphologyEx(binaryMask, closedMask, cv.MORPH_CLOSE, kernel);
            
            // 膨胀掩码
            const dilatedMask = new cv.Mat();
            cv.dilate(closedMask, dilatedMask, kernel);
            
            // 大半径修复
            const result = new cv.Mat();
            cv.inpaint(srcMat, dilatedMask, result, 15, cv.INPAINT_TELEA);
            
            resultCanvas = document.createElement('canvas');
            resultCanvas.width = originalWidth;
            resultCanvas.height = originalHeight;
            cv.imshow(resultCanvas, result);
            
            // 清理
            srcMat.delete();
            maskMat.delete();
            grayMask.delete();
            binaryMask.delete();
            closedMask.delete();
            dilatedMask.delete();
            result.delete();
            kernel.delete();
            
            console.log('OpenCV修复完成');
        } catch (e) {
            console.error('OpenCV修复失败:', e);
        }
    }
    
    // 保底：使用传统方法
    if (!resultCanvas) {
        console.log('使用传统方法修复...');
        resultCanvas = inpaintWithImprovedTraditional(srcCanvas, maskCanvas);
    }
    
    if (!resultCanvas) {
        resultCanvas = srcCanvas;
    }
    
    // 显示结果
    displayResult(resultCanvas);
    showToast('文字水印清除完成');
}

/**
 * 显示修复结果
 */
async function displayResult(resultCanvas) {
    const resultDataUrl = resultCanvas.toDataURL('image/png');
    resultImg.src = resultDataUrl;
    resultEmpty.style.display = 'none';
    resultImg.style.display = 'block';
    viewResultBtn.style.display = 'block';
    
    const blob = await fetch(resultDataUrl).then(res => res.blob());
    resultInfo.textContent = `尺寸：${originalWidth} × ${originalHeight} | 大小：${formatFileSize(blob.size)}`;
    
    copyResultBtn.disabled = false;
    saveResultBtn.disabled = false;
}

// ==================== 水印类型检测 ====================

/**
 * 分析掩码区域特征，判断水印类型
 * @returns {object} { type, confidence, details }
 */
function detectWatermarkType(srcCanvas, maskCanvas) {
    const srcCtx = srcCanvas.getContext('2d');
    const maskCtx = maskCanvas.getContext('2d');
    const width = originalWidth;
    const height = originalHeight;
    
    const srcData = srcCtx.getImageData(0, 0, width, height);
    const maskData = maskCtx.getImageData(0, 0, width, height);
    
    let maskPixels = [];
    let totalPixels = 0;
    
    // 收集掩码区域像素
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            if (maskData.data[idx] > 128) {
                maskPixels.push({
                    x, y,
                    r: srcData.data[idx],
                    g: srcData.data[idx + 1],
                    b: srcData.data[idx + 2]
                });
            }
            totalPixels++;
        }
    }
    
    if (maskPixels.length === 0) {
        return { type: 'unknown', confidence: 0, details: {} };
    }
    
    // 计算掩码区域大小比例
    const maskRatio = maskPixels.length / totalPixels;
    
    // 计算掩码区域的颜色统计
    let sumR = 0, sumG = 0, sumB = 0;
    let minR = 255, maxR = 0;
    let minG = 255, maxG = 0;
    let minB = 255, maxB = 0;
    
    for (const p of maskPixels) {
        sumR += p.r;
        sumG += p.g;
        sumB += p.b;
        minR = Math.min(minR, p.r);
        maxR = Math.max(maxR, p.r);
        minG = Math.min(minG, p.g);
        maxG = Math.max(maxG, p.g);
        minB = Math.min(minB, p.b);
        maxB = Math.max(maxB, p.b);
    }
    
    const avgR = sumR / maskPixels.length;
    const avgG = sumG / maskPixels.length;
    const avgB = sumB / maskPixels.length;
    const avgBrightness = (avgR + avgG + avgB) / 3;
    
    // 计算颜色范围（判断是否均匀）
    const colorRange = {
        r: maxR - minR,
        g: maxG - minG,
        b: maxB - minB
    };
    const totalRange = colorRange.r + colorRange.g + colorRange.b;
    
    // 分析周围背景颜色
    let bgSumR = 0, bgSumG = 0, bgSumB = 0, bgCount = 0;
    const bgSearchRadius = 50;
    
    for (const p of maskPixels) {
        // 在掩码边缘搜索背景
        for (let dy = -bgSearchRadius; dy <= bgSearchRadius; dy += 10) {
            for (let dx = -bgSearchRadius; dx <= bgSearchRadius; dx += 10) {
                const nx = p.x + dx;
                const ny = p.y + dy;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const nIdx = (ny * width + nx) * 4;
                    if (maskData.data[nIdx] < 50) { // 非掩码区域
                        bgSumR += srcData.data[nIdx];
                        bgSumG += srcData.data[nIdx + 1];
                        bgSumB += srcData.data[nIdx + 2];
                        bgCount++;
                    }
                }
            }
        }
    }
    
    const bgAvgR = bgCount > 0 ? bgSumR / bgCount : 128;
    const bgAvgG = bgCount > 0 ? bgSumG / bgCount : 128;
    const bgAvgB = bgCount > 0 ? bgSumB / bgCount : 128;
    const bgBrightness = (bgAvgR + bgAvgG + bgAvgB) / 3;
    
    // 判断水印类型
    let type = 'unknown';
    let confidence = 0.5;
    
    // 1. 判断是亮色水印还是暗色水印
    const isLightWatermark = avgBrightness > 127;
    
    // 2. 计算水印与背景的对比度
    const contrast = Math.abs(avgBrightness - bgBrightness);
    
    // 3. 判断颜色均匀性（文字水印通常颜色较均匀）
    const isUniformColor = totalRange < 60;
    
    // 4. 文字水印特征：区域较小，颜色均匀，对比度适中
    if (maskRatio < 0.1 && isUniformColor && contrast > 20) {
        if (isLightWatermark) {
            type = 'lightTextWatermark'; // 白色/灰色文字水印
            confidence = 0.8;
        } else {
            type = 'darkTextWatermark'; // 深色文字水印
            confidence = 0.8;
        }
    }
    // 5. 半透明渐变水印：颜色范围大，区域较大
    else if (maskRatio > 0.05 && totalRange > 100) {
        type = 'gradientWatermark';
        confidence = 0.7;
    }
    // 6. 重复图案水印
    else if (maskRatio > 0.2) {
        type = 'patternWatermark';
        confidence = 0.6;
    }
    
    console.log(`水印检测结果: 类型=${type}, 置信度=${confidence.toFixed(2)}, 掩码比例=${(maskRatio * 100).toFixed(2)}%`);
    console.log(`  平均颜色: RGB(${avgR.toFixed(0)}, ${avgG.toFixed(0)}, ${avgB.toFixed(0)})`);
    console.log(`  背景颜色: RGB(${bgAvgR.toFixed(0)}, ${bgAvgG.toFixed(0)}, ${bgAvgB.toFixed(0)})`);
    console.log(`  对比度: ${contrast.toFixed(1)}, 颜色范围: ${totalRange.toFixed(0)}`);
    
    return {
        type,
        confidence,
        details: {
            maskRatio,
            avgBrightness,
            bgBrightness,
            contrast,
            isUniformColor,
            isLightWatermark,
            colorRange: totalRange
        }
    };
}

// ==================== 半透明水印专用算法 ====================

/**
 * 半透明文字水印去除
 * 原理：水印是叠加在原图上的，通过周围像素推断原始颜色
 */
function removeSemiTransparentWatermark(srcCanvas, maskCanvas) {
    console.log('使用半透明水印专用算法...');
    
    const srcCtx = srcCanvas.getContext('2d');
    const maskCtx = maskCanvas.getContext('2d');
    const width = originalWidth;
    const height = originalHeight;
    
    const srcData = srcCtx.getImageData(0, 0, width, height);
    const maskData = maskCtx.getImageData(0, 0, width, height);
    
    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = width;
    resultCanvas.height = height;
    const resultCtx = resultCanvas.getContext('2d');
    resultCtx.drawImage(srcCanvas, 0, 0);
    const resultData = resultCtx.getImageData(0, 0, width, height);
    
    // 步骤1: 分析掩码区域的颜色分布，估算水印颜色
    const maskColors = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            if (maskData.data[idx] > 128) {
                maskColors.push({
                    r: srcData.data[idx],
                    g: srcData.data[idx + 1],
                    b: srcData.data[idx + 2]
                });
            }
        }
    }
    
    if (maskColors.length === 0) {
        console.log('没有掩码区域');
        return resultCanvas;
    }
    
    // 计算掩码区域的平均颜色（代表水印的混合色）
    let avgR = 0, avgG = 0, avgB = 0;
    for (const c of maskColors) {
        avgR += c.r;
        avgG += c.g;
        avgB += c.b;
    }
    avgR /= maskColors.length;
    avgG /= maskColors.length;
    avgB /= maskColors.length;
    
    console.log(`检测到水印颜色: RGB(${avgR.toFixed(0)}, ${avgG.toFixed(0)}, ${avgB.toFixed(0)})`);
    
    // 判断水印类型（亮色还是暗色）
    const isLightWatermark = (avgR + avgG + avgB) / 3 > 127;
    
    // 步骤2: 创建掩码边界图 - 标记每个像素到边界的距离
    const distToEdge = new Float32Array(width * height).fill(Infinity);
    const isMask = new Uint8Array(width * height);
    
    for (let i = 0; i < width * height; i++) {
        const idx = i * 4;
        isMask[i] = maskData.data[idx] > 128 ? 1 : 0;
    }
    
    // BFS计算到边界的距离
    const queue = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (isMask[idx]) {
                // 检查是否是边界像素
                let isBoundary = false;
                const neighbors = [[-1,0],[1,0],[0,-1],[0,1]];
                for (const [dx, dy] of neighbors) {
                    const nx = x + dx, ny = y + dy;
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        if (!isMask[ny * width + nx]) {
                            isBoundary = true;
                            break;
                        }
                    }
                }
                if (isBoundary) {
                    distToEdge[idx] = 0;
                    queue.push(idx);
                }
            }
        }
    }
    
    // BFS传播
    while (queue.length > 0) {
        const idx = queue.shift();
        const y = Math.floor(idx / width);
        const x = idx % width;
        const dist = distToEdge[idx];
        
        const neighbors = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
        for (const [dx, dy] of neighbors) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nIdx = ny * width + nx;
                const newDist = dist + 1;
                if (newDist < distToEdge[nIdx]) {
                    distToEdge[nIdx] = newDist;
                    queue.push(nIdx);
                }
            }
        }
    }
    
    // 步骤3: 从边界向内填充颜色
    const maxDist = Math.max(...distToEdge) || 1;
    const searchRadius = Math.max(repairRadius * 3, 20);
    
    console.log(`最大填充距离: ${maxDist}, 搜索半径: ${searchRadius}`);
    
    // 多轮迭代填充
    const iterations = Math.min(5, Math.ceil(maxDist / 5));
    
    for (let iter = 0; iter < iterations; iter++) {
        const currentRadius = Math.floor(searchRadius * (iter + 1) / iterations);
        
        // 收集所有掩码像素，按距离排序
        const maskPixels = [];
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                if (isMask[idx]) {
                    maskPixels.push({ x, y, dist: distToEdge[idx] });
                }
            }
        }
        maskPixels.sort((a, b) => a.dist - b.dist);
        
        // 处理每个掩码像素
        for (const pixel of maskPixels) {
            const { x, y } = pixel;
            const idx = (y * width + x) * 4;
            
            // 在周围非掩码区域找最佳匹配
            let bestR = 0, bestG = 0, bestB = 0;
            let totalWeight = 0;
            let sampleCount = 0;
            
            // 螺旋向外搜索
            const maxSteps = currentRadius * currentRadius;
            for (let step = 1; step < maxSteps; step++) {
                if (sampleCount >= 60) break;
                
                const angle = step * 0.618; // 黄金角，分布更均匀
                const r = Math.sqrt(step);
                if (r > currentRadius) break;
                
                const nx = Math.round(x + r * Math.cos(angle));
                const ny = Math.round(y + r * Math.sin(angle));
                
                if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                
                const nIdx = ny * width + nx;
                
                // 只从非掩码区域采样
                if (!isMask[nIdx]) {
                    const nPixelIdx = nIdx * 4;
                    
                    // 空间距离权重
                    const spaceDist = r;
                    const spaceWeight = Math.exp(-spaceDist * spaceDist / (2 * currentRadius * currentRadius));
                    
                    // 颜色权重（避免采样到和水印颜色相似的区域）
                    const colorDist = Math.abs(srcData.data[nPixelIdx] - avgR) +
                                     Math.abs(srcData.data[nPixelIdx + 1] - avgG) +
                                     Math.abs(srcData.data[nPixelIdx + 2] - avgB);
                    // 如果水印是亮色（白/灰），优先选择暗色区域
                    // 如果水印是暗色，优先选择亮色区域
                    const watermarkContrast = isLightWatermark ? 
                        (255 - colorDist) / 3 : colorDist / 3;
                    const colorWeight = Math.exp(-watermarkContrast * watermarkContrast / 200);
                    
                    const weight = spaceWeight * (0.5 + 0.5 * colorWeight);
                    
                    bestR += srcData.data[nPixelIdx] * weight;
                    bestG += srcData.data[nPixelIdx + 1] * weight;
                    bestB += srcData.data[nPixelIdx + 2] * weight;
                    totalWeight += weight;
                    sampleCount++;
                }
            }
            
            // 更新结果
            if (totalWeight > 0) {
                // 距离越远，混合程度越大（从原图逐渐过渡到填充）
                const blendStrength = Math.min(0.95, distToEdge[y * width + x] / (maxDist * 0.5) + 0.3);
                
                const filledR = bestR / totalWeight;
                const filledG = bestG / totalWeight;
                const filledB = bestB / totalWeight;
                
                // 边缘混合
                resultData.data[idx] = srcData.data[idx] * (1 - blendStrength) + filledR * blendStrength;
                resultData.data[idx + 1] = srcData.data[idx + 1] * (1 - blendStrength) + filledG * blendStrength;
                resultData.data[idx + 2] = srcData.data[idx + 2] * (1 - blendStrength) + filledB * blendStrength;
            }
        }
        
        console.log(`迭代 ${iter + 1}/${iterations} 完成`);
    }
    
    // 步骤4: 边缘羽化
    smoothMaskEdges(resultData, maskData, width, height, 2);
    
    resultCtx.putImageData(resultData, 0, 0);
    return resultCanvas;
}

/**
 * 边缘羽化 - 平滑掩码边界
 */
function smoothMaskEdges(resultData, maskData, width, height, featherSize = 2) {
    const tempData = new Uint8ClampedArray(resultData.data);
    
    for (let y = featherSize; y < height - featherSize; y++) {
        for (let x = featherSize; x < width - featherSize; x++) {
            const idx = (y * width + x) * 4;
            const maskVal = maskData.data[idx];
            
            // 只处理掩码边缘区域
            if (maskVal > 30 && maskVal < 225) {
                let sumR = 0, sumG = 0, sumB = 0, count = 0;
                
                // 在非掩码邻域内加权平均
                for (let dy = -featherSize; dy <= featherSize; dy++) {
                    for (let dx = -featherSize; dx <= featherSize; dx++) {
                        const nx = x + dx;
                        const ny = y + dy;
                        const nIdx = (ny * width + nx) * 4;
                        
                        if (maskData.data[nIdx] < 30) {
                            const weight = 1 / (1 + Math.abs(dx) + Math.abs(dy));
                            sumR += tempData[nIdx] * weight;
                            sumG += tempData[nIdx + 1] * weight;
                            sumB += tempData[nIdx + 2] * weight;
                            count += weight;
                        }
                    }
                }
                
                if (count > 0) {
                    // 边缘强度：越靠近掩码中心越强
                    const edgeStrength = Math.abs(128 - maskVal) / 128;
                    const blend = edgeStrength * 0.5;
                    
                    resultData.data[idx] = tempData[idx] * (1 - blend) + (sumR / count) * blend;
                    resultData.data[idx + 1] = tempData[idx + 1] * (1 - blend) + (sumG / count) * blend;
                    resultData.data[idx + 2] = tempData[idx + 2] * (1 - blend) + (sumB / count) * blend;
                }
            }
        }
    }
}

// 全屏预览相关变量
let fullscreenScale = 1;
let fullscreenOffsetX = 0;
let fullscreenOffsetY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let fullscreenMaskCanvas = null;
let fullscreenMaskCtx = null;
let fullscreenCanvas = null;
let fullscreenCtx = null;

// DOM元素
const originalPreview = document.getElementById('originalPreview');
const originalImg = document.getElementById('originalImg');

const originalEmpty = document.getElementById('originalEmpty');
const originalInfo = document.getElementById('originalInfo');

const resultPreview = document.getElementById('resultPreview');
const resultImg = document.getElementById('resultImg');
const resultEmpty = document.getElementById('resultEmpty');
const resultInfo = document.getElementById('resultInfo');

const pasteBtn = document.getElementById('pasteBtn');
const removeBtn = document.getElementById('removeBtn');
const clearBtn = document.getElementById('clearBtn');
const removeOriginalBtn = document.getElementById('removeOriginalBtn');
const copyResultBtn = document.getElementById('copyResultBtn');
const saveResultBtn = document.getElementById('saveResultBtn');
const viewOriginalBtn = document.getElementById('viewOriginalBtn');
const viewResultBtn = document.getElementById('viewResultBtn');

const brushSizeSlider = document.getElementById('brushSize');
const brushSizeValue = document.getElementById('brushSizeValue');
const repairRadiusSlider = document.getElementById('repairRadius');
const repairRadiusValue = document.getElementById('repairRadiusValue');

const backBtn = document.getElementById('backBtn');
const toast = document.getElementById('toast');
const opencvStatus = document.getElementById('opencvStatus');

const fullscreenModal = document.getElementById('fullscreenModal');
const fullscreenCanvasEl = document.getElementById('fullscreenCanvas');
const fullscreenCanvasContainer = document.getElementById('fullscreenCanvasContainer');
const clearFullscreenBtn = document.getElementById('clearFullscreenBtn');
const confirmFullscreenBtn = document.getElementById('confirmFullscreenBtn');
const closeFullscreenBtn = document.getElementById('closeFullscreenBtn');

// OpenCV加载完成回调
function onOpenCvReady() {
    opencvReady = true;
    opencvStatus.textContent = 'OpenCV.js 加载完成，可以使用高级算法';
    opencvStatus.classList.add('ready');
    opencvStatus.style.display = 'block';
    setTimeout(() => {
        opencvStatus.style.display = 'none';
    }, 3000);
}

// 显示提示框
function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 处理图片加载
function handleImageLoad(srcImg) {
    originalWidth = srcImg.width;
    originalHeight = srcImg.height;
    
    console.log('图片加载完成:', originalWidth, originalHeight);
    
    // 隐藏空状态，显示图片
    originalEmpty.style.display = 'none';
    originalImg.src = srcImg.src;
    originalImg.style.display = 'block';
    
    // 显示查看大图按钮
    viewOriginalBtn.style.display = 'block';
    
    // 创建掩码画布
    maskCanvas = document.createElement('canvas');
    maskCtx = maskCanvas.getContext('2d');
    maskCanvas.width = originalWidth;
    maskCanvas.height = originalHeight;
    
    // 更新图片信息
    if (originalFile) {
        originalInfo.textContent = `尺寸：${originalWidth} × ${originalHeight} | 大小：${formatFileSize(originalFile.size)}`;
    } else {
        originalInfo.textContent = `尺寸：${originalWidth} × ${originalHeight} | 大小：-`;
    }
    
    // 启用按钮
    removeBtn.disabled = false;
    clearBtn.disabled = false;
    removeOriginalBtn.disabled = false;
    
    // 清空结果
    clearResult();
    
    showToast('图片加载成功');
}

// 清除涂抹
function clearDrawing() {
    if (!maskCtx) return;
    
    // 清除掩码画布
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    
    // 清除全屏画布（如果存在）
    if (fullscreenMaskCtx) {
        fullscreenMaskCtx.clearRect(0, 0, fullscreenMaskCanvas.width, fullscreenMaskCanvas.height);
        updateFullscreenCanvas();
    }
    
    // 清空结果
    clearResult();
    showToast('已清除涂抹');
}

// 清空结果
function clearResult() {
    resultEmpty.style.display = 'flex';
    resultImg.style.display = 'none';
    resultImg.src = '';
    resultInfo.textContent = '尺寸：- | 大小：-';
    copyResultBtn.disabled = true;
    saveResultBtn.disabled = true;
}

// ==================== 改进的去水印算法 ====================

/**
 * FFT频率域水印检测与去除（适用于周期性水印）
 * 水印通常是重复的图案，在频率域中会形成明显的峰值
 */
function removeWatermarkByFFT(srcCanvas, maskCanvas) {
    const srcCtx = srcCanvas.getContext('2d');
    const width = originalWidth;
    const height = originalHeight;
    
    const srcData = srcCtx.getImageData(0, 0, width, height);
    const maskData = maskCanvas.getContext('2d').getImageData(0, 0, width, height);
    
    // 创建结果画布
    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = width;
    resultCanvas.height = height;
    const resultCtx = resultCanvas.getContext('2d');
    resultCtx.drawImage(srcCanvas, 0, 0);
    const resultData = resultCtx.getImageData(0, 0, width, height);
    
    // 检测掩码区域是否有周期性水印特征
    const maskPixels = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            if (maskData.data[idx] > 128) {
                maskPixels.push({ x, y, r: srcData.data[idx], g: srcData.data[idx + 1], b: srcData.data[idx + 2] });
            }
        }
    }
    
    if (maskPixels.length === 0) return resultCanvas;
    
    // 分析掩码区域的颜色分布，估算水印颜色
    let avgR = 0, avgG = 0, avgB = 0;
    for (const p of maskPixels) {
        avgR += p.r;
        avgG += p.g;
        avgB += p.b;
    }
    avgR /= maskPixels.length;
    avgG /= maskPixels.length;
    avgB /= maskPixels.length;
    
    // 计算水印区域的方差，判断是否为半透明覆盖
    let variance = 0;
    for (const p of maskPixels) {
        variance += Math.pow(p.r - avgR, 2) + Math.pow(p.g - avgG, 2) + Math.pow(p.b - avgB, 2);
    }
    variance /= (maskPixels.length * 3);
    
    // 低方差表示水印颜色比较均匀，可能是半透明文字水印
    const isSemiTransparent = variance < 400;
    
    console.log(`FFT分析: 水印类型=${isSemiTransparent ? '半透明' : '覆盖型'}, 方差=${variance.toFixed(2)}`);
    
    // 对每个掩码像素进行处理
    for (const p of maskPixels) {
        const idx = (p.y * width + p.x) * 4;
        
        // 分析周围非掩码区域的颜色
        const neighbors = [];
        const searchRadius = Math.max(repairRadius * 3, 30);
        
        for (let dy = -searchRadius; dy <= searchRadius; dy += 3) {
            for (let dx = -searchRadius; dx <= searchRadius; dx += 3) {
                const nx = p.x + dx;
                const ny = p.y + dy;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const nIdx = (ny * width + nx) * 4;
                    // 只考虑非掩码区域
                    if (maskData.data[nIdx] < 80) {
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist > 5 && dist < searchRadius) {
                            neighbors.push({
                                r: srcData.data[nIdx],
                                g: srcData.data[nIdx + 1],
                                b: srcData.data[nIdx + 2],
                                dist: dist,
                                weight: 1 / (1 + dist * 0.1)
                            });
                        }
                    }
                }
            }
        }
        
        if (neighbors.length > 0) {
            // 加权平均周围的颜色
            let sumR = 0, sumG = 0, sumW = 0;
            for (const n of neighbors) {
                sumR += n.r * n.weight;
                sumG += n.g * n.weight;
                sumB += n.b * n.weight;
                sumW += n.weight;
            }
            
            if (sumW > 0) {
                // 如果是半透明水印，估算原始颜色
                if (isSemiTransparent) {
                    // 假设水印是叠加的：result = original * alpha + watermark * (1-alpha)
                    // 简化处理：用邻居颜色替换
                    resultData.data[idx] = sumR / sumW;
                    resultData.data[idx + 1] = sumG / sumW;
                    resultData.data[idx + 2] = sumB / sumW;
                } else {
                    // 直接替换
                    resultData.data[idx] = sumR / sumW;
                    resultData.data[idx + 1] = sumG / sumW;
                    resultData.data[idx + 2] = sumB / sumW;
                }
            }
        }
    }
    
    resultCtx.putImageData(resultData, 0, 0);
    
    // 边缘羽化处理（平滑过渡）
    const featheredCanvas = featherMaskEdges(srcCanvas, maskCanvas, 3);
    if (featheredCanvas) {
        const srcCtx2 = featheredCanvas.getContext('2d');
        const featheredData = srcCtx2.getImageData(0, 0, width, height);
        resultCtx.putImageData(featheredData, 0, 0);
    }
    
    return resultCanvas;
}

/**
 * 边缘羽化：平滑掩码边界
 */
function featherMaskEdges(srcCanvas, maskCanvas, featherAmount = 3) {
    const maskCtx = maskCanvas.getContext('2d');
    const width = originalWidth;
    const height = originalHeight;
    
    const maskData = maskCtx.getImageData(0, 0, width, height);
    
    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = width;
    resultCanvas.height = height;
    const resultCtx = resultCanvas.getContext('2d');
    resultCtx.drawImage(srcCanvas, 0, 0);
    const resultData = resultCtx.getImageData(0, 0, width, height);
    
    // 对掩码边缘区域进行混合
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const maskVal = maskData.data[idx];
            
            // 只处理边缘区域
            if (maskVal > 20 && maskVal < 220) {
                // 计算边缘强度
                let edgeStrength = Math.min(1, Math.abs(128 - maskVal) / 128);
                
                if (edgeStrength > 0.1) {
                    // 找最近的非掩码像素
                    let nearestNonMask = null;
                    let minDist = featherAmount * 2;
                    
                    for (let r = 1; r < featherAmount * 2 && r <= minDist; r++) {
                        for (let dy = -r; dy <= r; dy++) {
                            for (let dx = -r; dx <= r; dx++) {
                                if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                                const nx = x + dx;
                                const ny = y + dy;
                                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                    const nIdx = (ny * width + nx) * 4;
                                    if (maskData.data[nIdx] < 30) {
                                        const dist = Math.sqrt(dx * dx + dy * dy);
                                        if (dist < minDist) {
                                            minDist = dist;
                                            nearestNonMask = {
                                                r: resultData.data[nIdx],
                                                g: resultData.data[nIdx + 1],
                                                b: resultData.data[nIdx + 2]
                                            };
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    if (nearestNonMask) {
                        const blend = edgeStrength * (1 - minDist / (featherAmount * 2));
                        resultData.data[idx] = resultData.data[idx] * (1 - blend) + nearestNonMask.r * blend;
                        resultData.data[idx + 1] = resultData.data[idx + 1] * (1 - blend) + nearestNonMask.g * blend;
                        resultData.data[idx + 2] = resultData.data[idx + 2] * (1 - blend) + nearestNonMask.b * blend;
                    }
                }
            }
        }
    }
    
    resultCtx.putImageData(resultData, 0, 0);
    return resultCanvas;
}

/**
 * 多尺度修复：从低分辨率到高分辨率逐步修复
 */
function inpaintMultiScale(srcCanvas, maskCanvas) {
    const scales = [0.25, 0.5, 1.0]; // 从小到大处理
    let currentCanvas = null;
    
    for (const scale of scales) {
        console.log(`多尺度处理: scale=${scale}`);
        
        // 创建缩放后的画布
        const scaledWidth = Math.max(1, Math.floor(originalWidth * scale));
        const scaledHeight = Math.max(1, Math.floor(originalHeight * scale));
        
        const scaledSrc = document.createElement('canvas');
        scaledSrc.width = scaledWidth;
        scaledSrc.height = scaledHeight;
        const scaledSrcCtx = scaledSrc.getContext('2d');
        scaledSrcCtx.drawImage(srcCanvas, 0, 0, scaledWidth, scaledHeight);
        
        const scaledMask = document.createElement('canvas');
        scaledMask.width = scaledWidth;
        scaledMask.height = scaledHeight;
        const scaledMaskCtx = scaledMask.getContext('2d');
        scaledMaskCtx.drawImage(maskCanvas, 0, 0, scaledWidth, scaledHeight);
        
        // 在当前尺度上修复
        const scaledResult = inpaintSmartPatch(scaledSrc, scaledMask, Math.max(3, Math.floor(repairRadius * scale)));
        
        // 如果不是最后一层，放大结果
        if (scale < 1.0) {
            currentCanvas = document.createElement('canvas');
            currentCanvas.width = originalWidth;
            currentCanvas.height = originalHeight;
            const currentCtx = currentCanvas.getContext('2d');
            
            // 放大到下一层
            const nextScaleIdx = scales.indexOf(scale) + 1;
            if (nextScaleIdx < scales.length) {
                const nextScale = scales[nextScaleIdx];
                const nextWidth = Math.floor(originalWidth * nextScale);
                const nextHeight = Math.floor(originalHeight * nextScale);
                
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = nextWidth;
                tempCanvas.height = nextHeight;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(scaledResult, 0, 0, nextWidth, nextHeight);
                
                // 双线性插值放大
                currentCtx.imageSmoothingEnabled = true;
                currentCtx.imageSmoothingQuality = 'high';
                currentCtx.drawImage(tempCanvas, 0, 0, nextWidth, nextHeight, 0, 0, originalWidth, originalHeight);
            }
        } else {
            currentCanvas = scaledResult;
        }
    }
    
    return currentCanvas || srcCanvas;
}

/**
 * 智能Patch修复：改进的Criminisi算法
 */
function inpaintSmartPatch(srcCanvas, maskCanvas, radius = 10) {
    const maskCtx = maskCanvas.getContext('2d');
    const width = srcCanvas.width;
    const height = srcCanvas.height;
    
    const maskData = maskCtx.getImageData(0, 0, width, height);
    
    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = width;
    resultCanvas.height = height;
    const resultCtx = resultCanvas.getContext('2d');
    resultCtx.drawImage(srcCanvas, 0, 0);
    const resultData = resultCtx.getImageData(0, 0, width, height);
    
    // 计算掩码距离图
    const distMap = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (maskData.data[idx * 4] > 128) {
                distMap[idx] = 0;
            } else {
                distMap[idx] = 999;
            }
        }
    }
    
    // 计算距离变换
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (distMap[idx] > 0) {
                if (x > 0) distMap[idx] = Math.min(distMap[idx], distMap[idx - 1] + 1);
                if (y > 0) distMap[idx] = Math.min(distMap[idx], distMap[idx - width] + 1);
            }
        }
    }
    for (let y = height - 1; y >= 0; y--) {
        for (let x = width - 1; x >= 0; x--) {
            const idx = y * width + x;
            if (distMap[idx] > 0) {
                if (x < width - 1) distMap[idx] = Math.min(distMap[idx], distMap[idx + 1] + 1);
                if (y < height - 1) distMap[idx] = Math.min(distMap[idx], distMap[idx + width] + 1);
            }
        }
    }
    
    // 找到掩码边界像素
    const boundaryPixels = [];
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            if (maskData.data[idx * 4] > 128) {
                // 检查是否为边界像素
                const neighbors = [
                    maskData.data[(y - 1) * width + x] > 128,
                    maskData.data[(y + 1) * width + x] > 128,
                    maskData.data[y * width + (x - 1)] > 128,
                    maskData.data[y * width + (x + 1)] > 128
                ];
                if (neighbors.some(n => !n)) {
                    boundaryPixels.push({ x, y, confidence: 1 / (1 + distMap[idx]) });
                }
            }
        }
    }
    
    // 按置信度排序
    boundaryPixels.sort((a, b) => b.confidence - a.confidence);
    
    // 修复循环
    const patchSize = Math.max(radius, 3);
    const maxIterations = Math.min(boundaryPixels.length, 500);
    
    for (let iter = 0; iter < maxIterations; iter++) {
        const target = boundaryPixels[iter];
        if (!target) break;
        
        // 在源区域中找到最佳匹配块
        let bestPatch = null;
        let bestSSD = Infinity;
        
        const searchRadius = Math.max(width, height) / 2;
        
        // 随机采样搜索以提高速度
        const sampleCount = Math.min(200, Math.floor(searchRadius * searchRadius / 100));
        
        for (let s = 0; s < sampleCount; s++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * searchRadius;
            const sx = Math.round(target.x + Math.cos(angle) * dist);
            const sy = Math.round(target.y + Math.sin(angle) * dist);
            
            // 确保patch在有效范围内
            if (sx - patchSize < 0 || sx + patchSize >= width || sy - patchSize < 0 || sy + patchSize >= height) continue;
            
            // 计算SSD
            let ssd = 0;
            let validPixels = 0;
            
            for (let py = -patchSize; py <= patchSize; py++) {
                for (let px = -patchSize; px <= patchSize; px++) {
                    const pxIdx = ((target.y + py) * width + (target.x + px)) * 4;
                    const sxIdx = ((sy + py) * width + (sx + px)) * 4;
                    
                    // 只考虑非掩码像素
                    if (maskData.data[pxIdx] < 80) {
                        const diffR = resultData.data[pxIdx] - resultData.data[sxIdx];
                        const diffG = resultData.data[pxIdx + 1] - resultData.data[sxIdx + 1];
                        const diffB = resultData.data[pxIdx + 2] - resultData.data[sxIdx + 2];
                        ssd += diffR * diffR + diffG * diffG + diffB * diffB;
                        validPixels++;
                    }
                }
            }
            
            if (validPixels > 0 && ssd < bestSSD) {
                bestSSD = ssd;
                bestPatch = { x: sx, y: sy };
            }
        }
        
        // 复制最佳patch到目标位置
        if (bestPatch) {
            for (let py = -patchSize; py <= patchSize; py++) {
                for (let px = -patchSize; px <= patchSize; px++) {
                    const tx = target.x + px;
                    const ty = target.y + py;
                    if (tx < 0 || tx >= width || ty < 0 || ty >= height) continue;
                    
                    const tIdx = (ty * width + tx) * 4;
                    const sIdx = ((bestPatch.y + py) * width + (bestPatch.x + px)) * 4;
                    
                    // 只复制掩码区域
                    if (maskData.data[tIdx] > 128) {
                        resultData.data[tIdx] = resultData.data[sIdx];
                        resultData.data[tIdx + 1] = resultData.data[sIdx + 1];
                        resultData.data[tIdx + 2] = resultData.data[sIdx + 2];
                    }
                }
            }
        }
    }
    
    // 后续平滑处理
    smoothBoundary(resultData, maskData, width, height);
    
    resultCtx.putImageData(resultData, 0, 0);
    return resultCanvas;
}

/**
 * 平滑边界过渡
 */
function smoothBoundary(resultData, maskData, width, height) {
    const iterations = 2;
    
    for (let iter = 0; iter < iterations; iter++) {
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = (y * width + x) * 4;
                
                // 检查是否为掩码边缘
                const isMaskEdge = maskData.data[idx] > 50 && maskData.data[idx] < 200;
                
                if (isMaskEdge) {
                    let sumR = 0, sumG = 0, sumB = 0, count = 0;
                    
                    // 计算周围非掩码像素的加权平均
                    for (let dy = -2; dy <= 2; dy++) {
                        for (let dx = -2; dx <= 2; dx++) {
                            const nx = x + dx;
                            const ny = y + dy;
                            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                const nIdx = (ny * width + nx) * 4;
                                if (maskData.data[nIdx] < 50) {
                                    const weight = 1 / (1 + Math.abs(dx) + Math.abs(dy));
                                    sumR += resultData.data[nIdx] * weight;
                                    sumG += resultData.data[nIdx + 1] * weight;
                                    sumB += resultData.data[nIdx + 2] * weight;
                                    count += weight;
                                }
                            }
                        }
                    }
                    
                    if (count > 0) {
                        const blend = 0.3;
                        resultData.data[idx] = resultData.data[idx] * (1 - blend) + (sumR / count) * blend;
                        resultData.data[idx + 1] = resultData.data[idx + 1] * (1 - blend) + (sumG / count) * blend;
                        resultData.data[idx + 2] = resultData.data[idx + 2] * (1 - blend) + (sumB / count) * blend;
                    }
                }
            }
        }
    }
}

/**
 * 改进的OpenCV修复算法（专门针对文字水印优化）
 */
function inpaintWithOpenCVImproved(srcCanvas, maskCanvas) {
    try {
        // 读取原图
        const srcMat = cv.imread(srcCanvas);
        
        // 关键修复：将掩码转换为单通道灰度图
        const maskMat = cv.imread(maskCanvas);
        const grayMask = new cv.Mat();
        cv.cvtColor(maskMat, grayMask, cv.COLOR_RGBA2GRAY);
        
        // 二值化掩码（阈值125）
        const binaryMask = new cv.Mat();
        cv.threshold(grayMask, binaryMask, 125, 255, cv.THRESH_BINARY);
        
        // 形态学处理：平滑掩码边缘
        const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
        
        // 轻微膨胀掩码（包含水印边缘）
        const dilatedMask = new cv.Mat();
        cv.dilate(binaryMask, dilatedMask, kernel);
        
        // 高斯模糊掩码（羽化边缘，避免硬边界）
        const blurredMask = new cv.Mat();
        cv.GaussianBlur(dilatedMask, blurredMask, new cv.Size(5, 5), 0);
        
        // 执行修复 - 使用Telea算法，效果更好
        // 半径增大到15像素，更好地填充文字笔画区域
        const inpaintRadius = Math.max(repairRadius * 2, 15);
        const result = new cv.Mat();
        console.log(`OpenCV inpaint: 半径=${inpaintRadius}, 使用Telea算法`);
        cv.inpaint(srcMat, blurredMask, result, inpaintRadius, cv.INPAINT_TELEA);
        
        // 创建结果画布
        const resultCanvas = document.createElement('canvas');
        resultCanvas.width = originalWidth;
        resultCanvas.height = originalHeight;
        cv.imshow(resultCanvas, result);
        
        // 释放资源
        srcMat.delete();
        maskMat.delete();
        grayMask.delete();
        binaryMask.delete();
        dilatedMask.delete();
        blurredMask.delete();
        result.delete();
        kernel.delete();
        
        return resultCanvas;
    } catch (error) {
        console.error('OpenCV修复失败:', error);
        return null;
    }
}

/**
 * 改进的OpenCV修复算法v2 - 使用Navier-Stokes方法
 */
function inpaintWithOpenCVNS(srcCanvas, maskCanvas) {
    try {
        // 读取原图
        const srcMat = cv.imread(srcCanvas);
        
        // 转换掩码为单通道灰度图
        const maskMat = cv.imread(maskCanvas);
        const grayMask = new cv.Mat();
        cv.cvtColor(maskMat, grayMask, cv.COLOR_RGBA2GRAY);
        
        // 二值化
        const binaryMask = new cv.Mat();
        cv.threshold(grayMask, binaryMask, 125, 255, cv.THRESH_BINARY);
        
        // 形态学闭运算 - 填充小孔洞
        const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
        const closedMask = new cv.Mat();
        cv.morphologyEx(binaryMask, closedMask, cv.MORPH_CLOSE, kernel);
        
        // 执行Navier-Stokes修复
        const inpaintRadius = Math.max(repairRadius * 2, 15);
        const result = new cv.Mat();
        console.log(`OpenCV Navier-Stokes inpaint: 半径=${inpaintRadius}`);
        cv.inpaint(srcMat, closedMask, result, inpaintRadius, cv.INPAINT_NS);
        
        // 创建结果画布
        const resultCanvas = document.createElement('canvas');
        resultCanvas.width = originalWidth;
        resultCanvas.height = originalHeight;
        cv.imshow(resultCanvas, result);
        
        // 释放资源
        srcMat.delete();
        maskMat.delete();
        grayMask.delete();
        binaryMask.delete();
        closedMask.delete();
        result.delete();
        kernel.delete();
        
        return resultCanvas;
    } catch (error) {
        console.error('OpenCV Navier-Stokes修复失败:', error);
        return null;
    }
}

/**
 * 强力迭代修复算法 - 专门针对顽固半透明文字水印
 * 原理：多次迭代修复，逐步扩大修复范围，每次检测残留并处理
 */
function inpaintWithIteration(srcCanvas, maskCanvas) {
    console.log('使用强力迭代修复算法...');
    
    const srcCtx = srcCanvas.getContext('2d');
    const maskCtx = maskCanvas.getContext('2d');
    const width = originalWidth;
    const height = originalHeight;
    
    // 创建结果画布
    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = width;
    resultCanvas.height = height;
    const resultCtx = resultCanvas.getContext('2d');
    
    // 复制原图作为起点
    resultCtx.drawImage(srcCanvas, 0, 0);
    
    // 迭代修复 - 最多3次
    const iterations = 3;
    let currentMaskCanvas = maskCanvas;
    
    for (let iter = 0; iter < iterations; iter++) {
        console.log(`迭代 ${iter + 1}/${iterations}`);
        
        // 获取当前掩码
        const currentMaskData = maskCtx.getImageData(0, 0, width, height);
        const currentSrcData = srcCtx.getImageData(0, 0, width, height);
        const currentResultData = resultCtx.getImageData(0, 0, width, height);
        
        // 扩展掩码区域（包含水印边缘的残留）
        const expandedMask = expandMaskForWatermark(currentSrcData, currentMaskData, width, height);
        
        // 检测水印颜色（从掩码区域分析）
        const watermarkColor = detectWatermarkColor(currentSrcData, currentMaskData, width, height);
        console.log(`检测到水印颜色: RGB(${watermarkColor.r}, ${watermarkColor.g}, ${watermarkColor.b})`);
        
        // 从掩码区域内部向外传播颜色
        const filledData = propagateColorFromBoundary(
            currentResultData, 
            expandedMask, 
            width, 
            height, 
            watermarkColor,
            iter
        );
        
        // 应用修复结果
        resultCtx.putImageData(filledData, 0, 0);
        
        console.log(`迭代 ${iter + 1} 完成`);
    }
    
    // 最后用OpenCV做一次精修（如果可用）
    if (opencvReady && typeof cv !== 'undefined') {
        console.log('使用OpenCV进行最终精修...');
        
        // 创建扩展掩码
        const finalMask = cv.imread(maskCanvas);
        const grayFinal = new cv.Mat();
        cv.cvtColor(finalMask, grayFinal, cv.COLOR_RGBA2GRAY);
        const binaryFinal = new cv.Mat();
        cv.threshold(grayFinal, binaryFinal, 125, 255, cv.THRESH_BINARY);
        
        // 膨胀掩码以包含残留
        const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
        const dilatedFinal = new cv.Mat();
        cv.dilate(binaryFinal, dilatedFinal, kernel);
        
        // 使用resultCanvas作为源
        const srcMat = cv.imread(resultCanvas);
        
        // 大半径修复
        const finalResult = new cv.Mat();
        cv.inpaint(srcMat, dilatedFinal, finalResult, 21, cv.INPAINT_TELEA);
        
        // 写回结果
        cv.imshow(resultCanvas, finalResult);
        
        // 清理
        srcMat.delete();
        finalMask.delete();
        grayFinal.delete();
        binaryFinal.delete();
        dilatedFinal.delete();
        finalResult.delete();
        kernel.delete();
    }
    
    return resultCanvas;
}

/**
 * 扩展掩码以包含水印残留
 */
function expandMaskForWatermark(srcData, maskData, width, height) {
    const expanded = new Uint8ClampedArray(width * height);
    
    // 先复制原掩码
    for (let i = 0; i < width * height; i++) {
        const idx = i * 4;
        expanded[i] = maskData.data[idx] > 128 ? 255 : 0;
    }
    
    // 分析掩码区域与周围区域的颜色差异，扩展掩码
    const expandRadius = 5;
    
    for (let y = expandRadius; y < height - expandRadius; y++) {
        for (let x = expandRadius; x < width - expandRadius; x++) {
            const idx = y * width + x;
            
            // 如果这个像素不在掩码中，检查它是否可能是水印残留
            if (expanded[idx] === 0) {
                const pixelIdx = idx * 4;
                const centerR = srcData.data[pixelIdx];
                const centerG = srcData.data[pixelIdx + 1];
                const centerB = srcData.data[pixelIdx + 2];
                
                // 在周围掩码区域中找相似颜色的像素
                let maskNeighborCount = 0;
                let maskNeighborSumR = 0, maskNeighborSumG = 0, maskNeighborSumB = 0;
                let nonMaskNeighborCount = 0;
                let nonMaskNeighborSumR = 0, nonMaskNeighborSumG = 0, nonMaskNeighborSumB = 0;
                
                for (let dy = -3; dy <= 3; dy++) {
                    for (let dx = -3; dx <= 3; dx++) {
                        const nx = x + dx, ny = y + dy;
                        const nIdx = ny * width + nx;
                        const nPixelIdx = nIdx * 4;
                        
                        if (expanded[nIdx] > 128) {
                            maskNeighborCount++;
                            maskNeighborSumR += srcData.data[nPixelIdx];
                            maskNeighborSumG += srcData.data[nPixelIdx + 1];
                            maskNeighborSumB += srcData.data[nPixelIdx + 2];
                        } else {
                            nonMaskNeighborCount++;
                            nonMaskNeighborSumR += srcData.data[nPixelIdx];
                            nonMaskNeighborSumG += srcData.data[nPixelIdx + 1];
                            nonMaskNeighborSumB += srcData.data[nPixelIdx + 2];
                        }
                    }
                }
                
                if (maskNeighborCount > 5 && nonMaskNeighborCount > 5) {
                    const avgMaskR = maskNeighborSumR / maskNeighborCount;
                    const avgMaskG = maskNeighborSumG / maskNeighborCount;
                    const avgMaskB = maskNeighborSumB / maskNeighborCount;
                    const avgNonMaskR = nonMaskNeighborSumR / nonMaskNeighborCount;
                    const avgNonMaskG = nonMaskNeighborSumG / nonMaskNeighborCount;
                    const avgNonMaskB = nonMaskNeighborSumB / nonMaskNeighborCount;
                    
                    // 如果当前像素更接近掩码区域的颜色，可能是残留
                    const distToMask = Math.abs(centerR - avgMaskR) + Math.abs(centerG - avgMaskG) + Math.abs(centerB - avgMaskB);
                    const distToNonMask = Math.abs(centerR - avgNonMaskR) + Math.abs(centerG - avgNonMaskG) + Math.abs(centerB - avgNonMaskB);
                    
                    if (distToMask < distToNonMask * 0.7) {
                        expanded[idx] = 180; // 软扩展
                    }
                }
            }
        }
    }
    
    return expanded;
}

/**
 * 检测水印的主要颜色
 */
function detectWatermarkColor(srcData, maskData, width, height) {
    let sumR = 0, sumG = 0, sumB = 0;
    let count = 0;
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            if (maskData.data[idx] > 128) {
                sumR += srcData.data[idx];
                sumG += srcData.data[idx + 1];
                sumB += srcData.data[idx + 2];
                count++;
            }
        }
    }
    
    return {
        r: count > 0 ? Math.round(sumR / count) : 255,
        g: count > 0 ? Math.round(sumG / count) : 255,
        b: count > 0 ? Math.round(sumB / count) : 255
    };
}

/**
 * 从边界向内传播颜色
 */
function propagateColorFromBoundary(resultData, expandedMask, width, height, watermarkColor, iteration) {
    const data = resultData.data;
    const mask = expandedMask;
    
    // 计算每个掩码像素到边界的距离
    const distToEdge = new Float32Array(width * height).fill(Infinity);
    const isMask = new Uint8Array(width * height);
    
    for (let i = 0; i < width * height; i++) {
        isMask[i] = mask[i] > 50 ? 1 : 0;
    }
    
    // BFS计算距离
    const queue = [];
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            if (isMask[idx]) {
                // 检查是否是边界
                const neighbors = [[-1,0],[1,0],[0,-1],[0,1]];
                for (const [dx, dy] of neighbors) {
                    const nIdx = (y + dy) * width + (x + dx);
                    if (!isMask[nIdx]) {
                        distToEdge[idx] = 0;
                        queue.push(idx);
                        break;
                    }
                }
            }
        }
    }
    
    // BFS传播
    while (queue.length > 0) {
        const idx = queue.shift();
        const y = Math.floor(idx / width);
        const x = idx % width;
        const dist = distToEdge[idx];
        
        const neighbors = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
        for (const [dx, dy] of neighbors) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nIdx = ny * width + nx;
                if (dist + 1 < distToEdge[nIdx]) {
                    distToEdge[nIdx] = dist + 1;
                    queue.push(nIdx);
                }
            }
        }
    }
    
    // 从边界向内填充
    const maxDist = Math.max(...distToEdge.filter(d => d !== Infinity)) || 1;
    const searchRadius = Math.max(30, 50 - iteration * 10); // 迭代时减小搜索范围
    
    console.log(`最大填充距离: ${maxDist}, 搜索半径: ${searchRadius}`);
    
    // 处理所有掩码像素
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            
            if (!isMask[idx]) continue;
            
            const pixelIdx = idx * 4;
            const dist = distToEdge[idx];
            
            // 在边界外采样
            let sumR = 0, sumG = 0, sumB = 0, weightSum = 0;
            let sampleCount = 0;
            
            const maxSteps = searchRadius * searchRadius;
            for (let step = 1; step < maxSteps && sampleCount < 80; step++) {
                const angle = step * 0.618; // 黄金角
                const r = Math.sqrt(step);
                if (r > searchRadius) break;
                
                const nx = Math.round(x + r * Math.cos(angle));
                const ny = Math.round(y + r * Math.sin(angle));
                
                if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                
                const nIdx = ny * width + nx;
                if (isMask[nIdx]) continue; // 只从非掩码区域采样
                
                const nPixelIdx = nIdx * 4;
                
                // 空间距离权重
                const spaceWeight = Math.exp(-r * r / (2 * searchRadius * searchRadius));
                
                // 颜色权重 - 优先选择与水印颜色差异大的区域
                const nR = data[nPixelIdx];
                const nG = data[nPixelIdx + 1];
                const nB = data[nPixelIdx + 2];
                const colorDiff = Math.abs(nR - watermarkColor.r) + Math.abs(nG - watermarkColor.g) + Math.abs(nB - watermarkColor.b);
                const colorWeight = Math.exp(-colorDiff * colorDiff / 2000);
                
                const weight = spaceWeight * (0.6 + 0.4 * colorWeight);
                
                sumR += nR * weight;
                sumG += nG * weight;
                sumB += nB * weight;
                weightSum += weight;
                sampleCount++;
            }
            
            if (weightSum > 0) {
                const filledR = sumR / weightSum;
                const filledG = sumG / weightSum;
                const filledB = sumB / weightSum;
                
                // 混合强度取决于距离和迭代次数
                const blendStrength = Math.min(0.95, 0.5 + (dist / maxDist) * 0.4 + iteration * 0.1);
                
                data[pixelIdx] = data[pixelIdx] * (1 - blendStrength) + filledR * blendStrength;
                data[pixelIdx + 1] = data[pixelIdx + 1] * (1 - blendStrength) + filledG * blendStrength;
                data[pixelIdx + 2] = data[pixelIdx + 2] * (1 - blendStrength) + filledB * blendStrength;
            }
        }
    }
    
    return resultData;
}

// 使用高级纹理合成算法（基于 Criminisi 算法思想）
function inpaintWithTextureSynthesis(srcCanvas, maskCanvas) {
    const srcCtx = srcCanvas.getContext('2d');
    const maskCtx = maskCanvas.getContext('2d');
    
    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = originalWidth;
    resultCanvas.height = originalHeight;
    const resultCtx = resultCanvas.getContext('2d');
    
    // 复制原图
    resultCtx.drawImage(srcCanvas, 0, 0);
    
    const srcData = srcCtx.getImageData(0, 0, originalWidth, originalHeight);
    const maskData = maskCtx.getImageData(0, 0, originalWidth, originalHeight);
    const resultData = resultCtx.getImageData(0, 0, originalWidth, originalHeight);
    
    const width = originalWidth;
    const height = originalHeight;
    const radius = Math.max(repairRadius, 3);
    
    // 多次迭代修复，逐步扩大修复范围
    const iterations = 3;
    
    for (let iter = 0; iter < iterations; iter++) {
        const currentRadius = Math.floor(radius * (1 + iter * 0.5));
        
        // 创建优先级队列（优先修复边缘像素）
        const edgePixels = [];
        
        // 找到所有掩码边缘像素
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = (y * width + x) * 4;
                if (maskData.data[idx] > 128) {
                    // 检查是否为边缘像素（至少有一个非掩码邻居）
                    let isEdge = false;
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            if (dx === 0 && dy === 0) continue;
                            const nIdx = ((y + dy) * width + (x + dx)) * 4;
                            if (maskData.data[nIdx] <= 128) {
                                isEdge = true;
                                break;
                            }
                        }
                        if (isEdge) break;
                    }
                    if (isEdge) {
                        edgePixels.push({x, y});
                    }
                }
            }
        }
        
        // 按优先级排序（靠近中心的优先）
        const centerX = width / 2;
        const centerY = height / 2;
        edgePixels.sort((a, b) => {
            const distA = Math.sqrt((a.x - centerX) ** 2 + (a.y - centerY) ** 2);
            const distB = Math.sqrt((b.x - centerX) ** 2 + (b.y - centerY) ** 2);
            return distA - distB;
        });
        
        // 修复边缘像素
        for (const pixel of edgePixels) {
            const {x, y} = pixel;
            const idx = (y * width + x) * 4;
            
            // 计算最佳匹配块
            let bestMatchX = -1, bestMatchY = -1;
            let minDiff = Infinity;
            
            // 在非掩码区域搜索最佳匹配
            const searchRadius = currentRadius * 2;
            const blockSize = currentRadius;
            
            for (let sy = blockSize; sy < height - blockSize; sy += blockSize / 2) {
                for (let sx = blockSize; sx < width - blockSize; sx += blockSize / 2) {
                    // 跳过掩码区域
                    const sIdx = (sy * width + sx) * 4;
                    if (maskData.data[sIdx] > 128) continue;
                    
                    // 计算块差异
                    let diff = 0;
                    let count = 0;
                    
                    for (let dy = -blockSize; dy <= blockSize; dy++) {
                        for (let dx = -blockSize; dx <= blockSize; dx++) {
                            const px = x + dx;
                            const py = y + dy;
                            if (px < 0 || px >= width || py < 0 || py >= height) continue;
                            
                            // 检查当前像素是否已知
                            const curIdx = (py * width + px) * 4;
                            if (maskData.data[curIdx] > 128) continue;
                            
                            const srcIdx = ((sy + dy) * width + (sx + dx)) * 4;
                            diff += Math.abs(srcData.data[idx] - srcData.data[srcIdx]);
                            diff += Math.abs(srcData.data[idx + 1] - srcData.data[srcIdx + 1]);
                            diff += Math.abs(srcData.data[idx + 2] - srcData.data[srcIdx + 2]);
                            count++;
                        }
                    }
                    
                    if (count > 0 && diff / count < minDiff) {
                        minDiff = diff / count;
                        bestMatchX = sx;
                        bestMatchY = sy;
                    }
                }
            }
            
            // 使用最佳匹配填充
            if (bestMatchX >= 0 && bestMatchY >= 0) {
                for (let dy = -blockSize; dy <= blockSize; dy++) {
                    for (let dx = -blockSize; dx <= blockSize; dx++) {
                        const px = x + dx;
                        const py = y + dy;
                        if (px < 0 || px >= width || py < 0 || py >= height) continue;
                        
                        const destIdx = (py * width + px) * 4;
                        if (maskData.data[destIdx] > 128) {
                            const srcX = bestMatchX + dx;
                            const srcY = bestMatchY + dy;
                            if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
                                const srcIdx = (srcY * width + srcX) * 4;
                                // 距离加权混合
                                const dist = Math.sqrt(dx * dx + dy * dy);
                                const weight = Math.max(0, 1 - dist / blockSize);
                                resultData.data[destIdx] = resultData.data[destIdx] * (1 - weight) + srcData.data[srcIdx] * weight;
                                resultData.data[destIdx + 1] = resultData.data[destIdx + 1] * (1 - weight) + srcData.data[srcIdx + 1] * weight;
                                resultData.data[destIdx + 2] = resultData.data[destIdx + 2] * (1 - weight) + srcData.data[srcIdx + 2] * weight;
                                
                                // 更新掩码（标记为已修复）
                                if (iter === iterations - 1) {
                                    maskData.data[destIdx] = 0;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    resultCtx.putImageData(resultData, 0, 0);
    return resultCanvas;
}

// 使用改进的邻域修复（边缘感知的泊松混合）
function inpaintWithImprovedTraditional(srcCanvas, maskCanvas) {
    const srcCtx = srcCanvas.getContext('2d');
    const maskCtx = maskCanvas.getContext('2d');
    
    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = originalWidth;
    resultCanvas.height = originalHeight;
    const resultCtx = resultCanvas.getContext('2d');
    
    // 复制原图
    resultCtx.drawImage(srcCanvas, 0, 0);
    
    const srcData = srcCtx.getImageData(0, 0, originalWidth, originalHeight);
    const maskData = maskCtx.getImageData(0, 0, originalWidth, originalHeight);
    const resultData = resultCtx.getImageData(0, 0, originalWidth, originalHeight);
    
    const width = originalWidth;
    const height = originalHeight;
    const radius = Math.max(repairRadius, 5);
    
    // 步骤1: 计算距离变换 - 掩码中心到边缘的距离
    const distanceMap = new Float32Array(width * height);
    const dilatedMask = new Uint8Array(width * height);
    
    // 初始化膨胀掩码
    for (let i = 0; i < width * height; i++) {
        const idx = i * 4;
        dilatedMask[i] = maskData.data[idx] > 128 ? 255 : 0;
    }
    
    // 膨胀掩码并计算距离
    const dilateSize = Math.max(5, Math.floor(radius / 2));
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (dilatedMask[idx] === 0) {
                let minDist = dilateSize * 3;
                for (let dy = -dilateSize; dy <= dilateSize; dy++) {
                    for (let dx = -dilateSize; dx <= dilateSize; dx++) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const nIdx = ny * width + nx;
                            if (maskData.data[nIdx * 4] > 128) {
                                const dist = Math.sqrt(dx * dx + dy * dy);
                                if (dist < minDist) minDist = dist;
                            }
                        }
                    }
                }
                if (minDist < dilateSize * 3) {
                    dilatedMask[idx] = Math.min(255, Math.floor(255 * (1 - minDist / (dilateSize * 3))));
                    distanceMap[idx] = minDist;
                }
            } else {
                distanceMap[idx] = 0;
            }
        }
    }
    
    // 步骤2: 边缘感知的样例填充
    const sigmaSpace = Math.max(radius * 2, 15);
    const sigmaColor = 35;
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const pixelIdx = idx * 4;
            
            // 只处理掩码区域（包括膨胀区域）
            if (dilatedMask[idx] < 30) continue;
            
            let rSum = 0, gSum = 0, bSum = 0;
            let totalWeight = 0;
            let sampleCount = 0;
            
            // 搜索半径
            const maxSearch = Math.max(sigmaSpace * 3, radius * 2);
            
            // 预计算目标颜色
            const targetR = srcData.data[pixelIdx];
            const targetG = srcData.data[pixelIdx + 1];
            const targetB = srcData.data[pixelIdx + 2];
            
            // 螺旋向外搜索
            const maxSteps = Math.min(300, maxSearch * maxSearch);
            for (let step = 1; step < maxSteps; step++) {
                const angle = step * 0.5;
                const r = Math.sqrt(step);
                if (r > maxSearch) break;
                
                const nx = Math.round(x + r * Math.cos(angle));
                const ny = Math.round(y + r * Math.sin(angle));
                
                if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                
                const nIdx = ny * width + nx;
                const nPixelIdx = nIdx * 4;
                
                if (dilatedMask[nIdx] < 30) {
                    // 空间距离权重
                    const spaceDist = r * r;
                    const spaceWeight = Math.exp(-spaceDist / (2 * sigmaSpace * sigmaSpace));
                    
                    // 颜色相似度权重
                    const colorDist = Math.abs(targetR - srcData.data[nPixelIdx]) +
                                     Math.abs(targetG - srcData.data[nPixelIdx + 1]) +
                                     Math.abs(targetB - srcData.data[nPixelIdx + 2]);
                    const colorWeight = Math.exp(-(colorDist * colorDist) / (2 * sigmaColor * sigmaColor));
                    
                    // 结构感知
                    let structureWeight = 1;
                    for (let tdy = -1; tdy <= 1; tdy++) {
                        for (let tdx = -1; tdx <= 1; tdx++) {
                            if (tdx === 0 && tdy === 0) continue;
                            const tnx = nx + tdx;
                            const tny = ny + tdy;
                            if (tnx >= 0 && tnx < width && tny >= 0 && tny < height) {
                                const tnIdx = tny * width + tnx;
                                if (dilatedMask[tnIdx] < 30) {
                                    const tnPixelIdx = tnIdx * 4;
                                    const gradDist = Math.abs(srcData.data[nPixelIdx] - srcData.data[tnPixelIdx]);
                                    if (gradDist < 15) {
                                        structureWeight += 0.25;
                                    }
                                }
                            }
                        }
                    }
                    
                    const weight = spaceWeight * colorWeight * structureWeight;
                    
                    rSum += srcData.data[nPixelIdx] * weight;
                    gSum += srcData.data[nPixelIdx + 1] * weight;
                    bSum += srcData.data[nPixelIdx + 2] * weight;
                    totalWeight += weight;
                    sampleCount++;
                    
                    if (sampleCount >= 120) break;
                }
            }
            
            if (totalWeight > 0) {
                // 边缘羽化
                const edgeFactor = dilatedMask[idx] / 255;
                const blendFactor = Math.min(1, edgeFactor * 1.5);
                
                const newR = rSum / totalWeight;
                const newG = gSum / totalWeight;
                const newB = bSum / totalWeight;
                
                resultData.data[pixelIdx] = targetR * (1 - blendFactor) + newR * blendFactor;
                resultData.data[pixelIdx + 1] = targetG * (1 - blendFactor) + newG * blendFactor;
                resultData.data[pixelIdx + 2] = targetB * (1 - blendFactor) + newB * blendFactor;
                resultData.data[pixelIdx + 3] = 255;
            }
        }
    }
    
    // 步骤3: 泊松混合（平滑梯度过渡）
    for (let iter = 0; iter < 2; iter++) {
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = y * width + x;
                const centerVal = dilatedMask[idx];
                if (centerVal === 0) continue;
                
                let neighborCount = 0;
                let neighborSumR = 0, neighborSumG = 0, neighborSumB = 0;
                
                const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]];
                for (const [dx, dy] of neighbors) {
                    const nIdx = (y + dy) * width + (x + dx);
                    if (dilatedMask[nIdx] < 30) {
                        neighborSumR += resultData.data[nIdx * 4];
                        neighborSumG += resultData.data[nIdx * 4 + 1];
                        neighborSumB += resultData.data[nIdx * 4 + 2];
                        neighborCount++;
                    }
                }
                
                if (neighborCount > 0) {
                    const pixelIdx = idx * 4;
                    const strength = Math.min(0.25, centerVal / 600);
                    resultData.data[pixelIdx] = Math.max(0, Math.min(255, resultData.data[pixelIdx] + (neighborSumR / neighborCount - resultData.data[pixelIdx]) * strength));
                    resultData.data[pixelIdx + 1] = Math.max(0, Math.min(255, resultData.data[pixelIdx + 1] + (neighborSumG / neighborCount - resultData.data[pixelIdx + 1]) * strength));
                    resultData.data[pixelIdx + 2] = Math.max(0, Math.min(255, resultData.data[pixelIdx + 2] + (neighborSumB / neighborCount - resultData.data[pixelIdx + 2]) * strength));
                }
            }
        }
    }
    
    resultCtx.putImageData(resultData, 0, 0);
    return resultCanvas;
}

// 去除水印
async function removeWatermark() {
    if (!originalImage || !maskCanvas) {
        showToast('请先涂抹水印区域', 'error');
        return;
    }
    
    // 创建原图画布
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = originalWidth;
    srcCanvas.height = originalHeight;
    const srcCtx = srcCanvas.getContext('2d');
    srcCtx.drawImage(originalImage, 0, 0);
    
    // 创建掩码画布副本
    const maskCanvasCopy = document.createElement('canvas');
    maskCanvasCopy.width = originalWidth;
    maskCanvasCopy.height = originalHeight;
    const maskCtxCopy = maskCanvasCopy.getContext('2d');
    maskCtxCopy.drawImage(maskCanvas, 0, 0);
    
    let resultCanvas = null;
    
    // 优先使用 AI 模式
    if (aiModeEnabled && aiModelReady) {
        console.log('使用 AI LaMa 深度修复...');
        const aiResult = await performAIInpaint(srcCanvas, maskCanvasCopy);
        if (aiResult) {
            const img = new Image();
            img.src = aiResult;
            await new Promise(resolve => img.onload = resolve);
            
            resultCanvas = document.createElement('canvas');
            resultCanvas.width = originalWidth;
            resultCanvas.height = originalHeight;
            const ctx = resultCanvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
        }
    }
    
    // 保底：使用传统方法
    if (!resultCanvas) {
        console.log('使用传统修复算法...');
        resultCanvas = inpaintWithImprovedTraditional(srcCanvas, maskCanvasCopy);
    }
    
    if (!resultCanvas) {
        resultCanvas = srcCanvas;
    }
    
    // 显示结果
    const resultDataUrl = resultCanvas.toDataURL('image/png');
    resultImg.src = resultDataUrl;
    resultEmpty.style.display = 'none';
    resultImg.style.display = 'block';
    viewResultBtn.style.display = 'block';
    
    const blob = await fetch(resultDataUrl).then(res => res.blob());
    resultInfo.textContent = `尺寸：${originalWidth} × ${originalHeight} | 大小：${formatFileSize(blob.size)}`;
    
    copyResultBtn.disabled = false;
    saveResultBtn.disabled = false;
    
    showToast(aiModeEnabled ? 'AI 深度修复完成' : '去水印完成');
}

// 复制到剪贴板
async function copyToClipboard(dataUrl) {
    try {
        const result = await window.electronAPI.copyImage(dataUrl);
        if (result.success) {
            showToast('图片已复制到剪贴板');
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        console.error('复制失败:', error);
        showToast('复制失败', 'error');
    }
}

// 保存图片
function saveImage(dataUrl) {
    const link = document.createElement('a');
    link.download = `watermark_removed_${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
}

// 全屏预览功能
function openFullscreen() {
    if (!originalImage) return;
    
    console.log('打开全屏模式:', originalWidth, originalHeight);
    
    // 创建全屏画布（用于绘制原图和掩码的合成）
    fullscreenCanvas = document.createElement('canvas');
    fullscreenCanvas.width = originalWidth;
    fullscreenCanvas.height = originalHeight;
    fullscreenCtx = fullscreenCanvas.getContext('2d');
    
    // 创建全屏掩码画布
    fullscreenMaskCanvas = document.createElement('canvas');
    fullscreenMaskCanvas.width = originalWidth;
    fullscreenMaskCanvas.height = originalHeight;
    fullscreenMaskCtx = fullscreenMaskCanvas.getContext('2d');
    
    // 如果已有掩码，复制到全屏掩码
    if (maskCanvas) {
        fullscreenMaskCtx.drawImage(maskCanvas, 0, 0);
    }
    
    // 显示模态框
    fullscreenModal.classList.add('show');
    document.body.style.overflow = 'hidden';
    
    // 等待模态框显示后，获取容器尺寸并设置 canvas
    setTimeout(() => {
        setupFullscreenCanvas();
    }, 50);
}

function setupFullscreenCanvas() {
    // 设置全屏显示画布的尺寸
    const containerRect = fullscreenCanvasContainer.getBoundingClientRect();
    fullscreenCanvasEl.width = containerRect.width;
    fullscreenCanvasEl.height = containerRect.height;
    
    console.log('容器尺寸:', containerRect.width, containerRect.height);
    console.log('原图尺寸:', originalWidth, originalHeight);
    
    // 设置初始缩放和偏移
    const scaleX = containerRect.width / originalWidth;
    const scaleY = containerRect.height / originalHeight;
    fullscreenScale = Math.min(scaleX, scaleY, 1);
    fullscreenOffsetX = (containerRect.width - originalWidth * fullscreenScale) / 2;
    fullscreenOffsetY = (containerRect.height - originalHeight * fullscreenScale) / 2;
    
    // 更新显示
    updateFullscreenCanvas();
    
    // 添加滚轮缩放事件
    fullscreenCanvasContainer.addEventListener('wheel', handleFullscreenWheel);
    
    console.log('全屏模式已打开，缩放:', fullscreenScale, '偏移:', fullscreenOffsetX, fullscreenOffsetY);
}

// 全屏模式的框选相关变量
let fsIsSelectingRect = false;
let fsRectStartX = 0;
let fsRectStartY = 0;
let fsSelectionRectElement = null;
let fsSelectionRect = null;

/**
 * 设置全屏模式的框选功能
 */
function setupFullscreenRectMode() {
    const container = document.getElementById('fullscreenCanvasContainer');
    if (!container) return;
    
    container.addEventListener('mousedown', handleFsMouseDown);
    container.addEventListener('mousemove', handleFsMouseMove);
    container.addEventListener('mouseup', handleFsMouseUp);
    container.addEventListener('mouseleave', handleFsMouseLeave);
}

function handleFsMouseDown(e) {
    if (currentMode !== 'rect') return;
    
    const container = document.getElementById('fullscreenCanvasContainer');
    const rect = container.getBoundingClientRect();
    
    fsRectStartX = e.clientX - rect.left;
    fsRectStartY = e.clientY - rect.top;
    fsIsSelectingRect = true;
    
    console.log(`全屏框选开始: (${fsRectStartX}, ${fsRectStartY})`);
}

function handleFsMouseMove(e) {
    if (!fsIsSelectingRect || currentMode !== 'rect') return;
    
    const container = document.getElementById('fullscreenCanvasContainer');
    const rect = container.getBoundingClientRect();
    
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    
    // 更新UI
    if (!fsSelectionRectElement) {
        fsSelectionRectElement = document.createElement('div');
        fsSelectionRectElement.className = 'selection-rect';
        fsSelectionRectElement.style.position = 'absolute';
        fsSelectionRectElement.style.pointerEvents = 'none';
        container.appendChild(fsSelectionRectElement);
    }
    
    const x1 = Math.min(fsRectStartX, currentX);
    const y1 = Math.min(fsRectStartY, currentY);
    const x2 = Math.max(fsRectStartX, currentX);
    const y2 = Math.max(fsRectStartY, currentY);
    
    fsSelectionRectElement.style.left = x1 + 'px';
    fsSelectionRectElement.style.top = y1 + 'px';
    fsSelectionRectElement.style.width = (x2 - x1) + 'px';
    fsSelectionRectElement.style.height = (y2 - y1) + 'px';
}

function handleFsMouseUp(e) {
    if (!fsIsSelectingRect || currentMode !== 'rect') return;
    
    fsIsSelectingRect = false;
    
    const container = document.getElementById('fullscreenCanvasContainer');
    const rect = container.getBoundingClientRect();
    
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;
    
    // 转换为原图坐标
    const imgX1 = Math.min(fsRectStartX, endX);
    const imgY1 = Math.min(fsRectStartY, endY);
    const imgX2 = Math.max(fsRectStartX, endX);
    const imgY2 = Math.max(fsRectStartY, endY);
    
    // 计算缩放比例
    const displayScaleX = originalWidth / rect.width;
    const displayScaleY = originalHeight / rect.height;
    
    fsSelectionRect = {
        x1: Math.round(imgX1 * displayScaleX),
        y1: Math.round(imgY1 * displayScaleY),
        x2: Math.round(imgX2 * displayScaleX),
        y2: Math.round(imgY2 * displayScaleY)
    };
    
    if (fsSelectionRect.x2 - fsSelectionRect.x1 > 10 && fsSelectionRect.y2 - fsSelectionRect.y1 > 10) {
        console.log(`全屏框选完成: (${fsSelectionRect.x1}, ${fsSelectionRect.y1}) -> (${fsSelectionRect.x2}, ${fsSelectionRect.y2})`);
        
        // 自动检测并处理
        autoDetectAndInpaintText(fsSelectionRect);
        
        // 关闭全屏
        closeFullscreenModal();
    } else {
        if (fsSelectionRectElement) {
            fsSelectionRectElement.remove();
            fsSelectionRectElement = null;
        }
        fsSelectionRect = null;
    }
}

function handleFsMouseLeave(e) {
    if (fsIsSelectingRect) {
        fsIsSelectingRect = false;
        if (fsSelectionRectElement) {
            fsSelectionRectElement.remove();
            fsSelectionRectElement = null;
        }
    }
}

function updateFullscreenCanvas() {
    if (!fullscreenCtx || !originalImage || !fullscreenMaskCtx) return;
    
    // 获取 canvas 的实际显示尺寸（CSS 渲染后的尺寸）
    const canvasRect = fullscreenCanvasEl.getBoundingClientRect();
    
    console.log('更新全屏画布:', fullscreenScale, fullscreenOffsetX, fullscreenOffsetY, 'canvas显示尺寸:', canvasRect.width, canvasRect.height);
    
    // 清空并绘制原图
    fullscreenCtx.clearRect(0, 0, originalWidth, originalHeight);
    fullscreenCtx.drawImage(originalImage, 0, 0);
    
    // 绘制掩码（使用更醒目的颜色和样式）
    fullscreenCtx.globalCompositeOperation = 'source-over';
    fullscreenCtx.globalAlpha = 0.6;
    fullscreenCtx.drawImage(fullscreenMaskCanvas, 0, 0);
    fullscreenCtx.globalAlpha = 1;
    
    // 显示到页面画布（使用实际显示尺寸）
    const ctx = fullscreenCanvasEl.getContext('2d');
    ctx.clearRect(0, 0, canvasRect.width, canvasRect.height);
    
    // 在指定位置绘制缩放后的图像
    ctx.drawImage(fullscreenCanvas, fullscreenOffsetX, fullscreenOffsetY, 
                  originalWidth * fullscreenScale, originalHeight * fullscreenScale);
}

function handleFullscreenWheel(e) {
    e.preventDefault();
    
    const rect = fullscreenCanvasContainer.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // 计算鼠标在原图上的位置
    const imageX = (mouseX - fullscreenOffsetX) / fullscreenScale;
    const imageY = (mouseY - fullscreenOffsetY) / fullscreenScale;
    
    // 调整缩放
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newScale = Math.max(0.1, Math.min(5, fullscreenScale + delta));
    
    // 计算新偏移，使鼠标位置保持不变
    fullscreenOffsetX = mouseX - imageX * newScale;
    fullscreenOffsetY = mouseY - imageY * newScale;
    
    fullscreenScale = newScale;
    updateFullscreenCanvas();
}

function closeFullscreen() {
    fullscreenModal.classList.remove('show');
    document.body.style.overflow = '';
    fullscreenCanvasContainer.removeEventListener('wheel', handleFullscreenWheel);
}

function clearFullscreenDrawing() {
    if (fullscreenMaskCtx) {
        fullscreenMaskCtx.clearRect(0, 0, fullscreenMaskCanvas.width, fullscreenMaskCanvas.height);
        updateFullscreenCanvas();
    }
}

function confirmFullscreenDrawing() {
    // 将全屏掩码复制到主掩码
    if (fullscreenMaskCanvas && maskCanvas) {
        maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
        maskCtx.drawImage(fullscreenMaskCanvas, 0, 0);
    }
    closeFullscreen();
}

// 全屏绘制事件
let isFullscreenDrawing = false;
let lastFullscreenX = 0;
let lastFullscreenY = 0;

fullscreenCanvasEl.addEventListener('mousedown', (e) => {
    e.stopPropagation(); // 阻止事件冒泡到容器
    isFullscreenDrawing = true;
    const rect = fullscreenCanvasEl.getBoundingClientRect();
    lastFullscreenX = (e.clientX - rect.left - fullscreenOffsetX) / fullscreenScale;
    lastFullscreenY = (e.clientY - rect.top - fullscreenOffsetY) / fullscreenScale;
    
    // 在掩码上绘制
    drawOnFullscreenMask(lastFullscreenX, lastFullscreenY, true);
});

fullscreenCanvasEl.addEventListener('mousemove', (e) => {
    if (!isFullscreenDrawing) return;
    
    const rect = fullscreenCanvasEl.getBoundingClientRect();
    const x = (e.clientX - rect.left - fullscreenOffsetX) / fullscreenScale;
    const y = (e.clientY - rect.top - fullscreenOffsetY) / fullscreenScale;
    
    // 在掩码上绘制
    drawOnFullscreenMask(x, y);
    
    lastFullscreenX = x;
    lastFullscreenY = y;
});

fullscreenCanvasEl.addEventListener('mouseup', (e) => {
    e.stopPropagation();
    isFullscreenDrawing = false;
});

fullscreenCanvasEl.addEventListener('mouseleave', () => {
    isFullscreenDrawing = false;
});

function drawOnFullscreenMask(x, y, isStart = false) {
    if (!fullscreenMaskCtx) return;
    
    // 使用明亮的洋红色绘制，便于在各种图片上看清涂抹区域
    fullscreenMaskCtx.strokeStyle = '#ff1493'; // 深粉色，更醒目
    fullscreenMaskCtx.lineWidth = brushSize;
    fullscreenMaskCtx.lineCap = 'round';
    fullscreenMaskCtx.lineJoin = 'round';
    
    if (isStart) {
        fullscreenMaskCtx.beginPath();
        fullscreenMaskCtx.moveTo(x, y);
    } else {
        fullscreenMaskCtx.lineTo(x, y);
        fullscreenMaskCtx.stroke();
    }
    
    updateFullscreenCanvas();
}

// 拖拽移动功能
// 拖拽移动功能（仅在点击空白区域时触发）
fullscreenCanvasContainer.addEventListener('mousedown', (e) => {
    // 只在点击容器空白区域时开始拖拽，点击 canvas 时不触发
    if (e.target === fullscreenCanvasContainer || e.target === fullscreenCanvasEl) {
        return;
    }
    isDragging = true;
    dragStartX = e.clientX - fullscreenOffsetX;
    dragStartY = e.clientY - fullscreenOffsetY;
});

fullscreenCanvasContainer.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    fullscreenOffsetX = e.clientX - dragStartX;
    fullscreenOffsetY = e.clientY - dragStartY;
    updateFullscreenCanvas();
});

fullscreenCanvasContainer.addEventListener('mouseup', () => {
    isDragging = false;
});

fullscreenCanvasContainer.addEventListener('mouseleave', () => {
    isDragging = false;
});

// 事件监听
pasteBtn.addEventListener('click', async () => {
    console.log('粘贴按钮被点击');
    try {
        const result = await window.electronAPI.pasteImage();
        console.log('粘贴结果:', result);
        if (result.success) {
            const img = new Image();
            img.onload = () => {
                originalImage = img;
                handleImageLoad(img);
            };
            img.onerror = () => {
                showToast('图片加载失败', 'error');
            };
            img.src = result.dataUrl;
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        console.error('粘贴失败:', error);
        showToast('粘贴失败', 'error');
    }
});

removeBtn.addEventListener('click', removeWatermark);
clearBtn.addEventListener('click', clearDrawing);

// 初始化 AI 模式
initAIMode();

// 移除已上传的图片
removeOriginalBtn.addEventListener('click', () => {
    // 重置所有状态
    originalFile = null;
    originalImage = null;
    originalWidth = 0;
    originalHeight = 0;
    maskCanvas = null;
    maskCtx = null;
    
    // 显示空状态
    originalEmpty.style.display = 'flex';
    originalImg.src = '';
    originalImg.style.display = 'none';
    originalInfo.textContent = '尺寸：- | 大小：-';
    
    // 隐藏查看大图按钮
    viewOriginalBtn.style.display = 'none';
    
    // 禁用按钮
    removeBtn.disabled = true;
    clearBtn.disabled = true;
    removeOriginalBtn.disabled = true;
    
    // 清空结果
    clearResult();
    
    showToast('图片已移除');
});

copyResultBtn.addEventListener('click', () => {
    if (resultImg.src) {
        copyToClipboard(resultImg.src);
    }
});

saveResultBtn.addEventListener('click', () => {
    if (resultImg.src) {
        saveImage(resultImg.src);
    }
});


closeFullscreenBtn.addEventListener('click', closeFullscreen);
clearFullscreenBtn.addEventListener('click', clearFullscreenDrawing);
confirmFullscreenBtn.addEventListener('click', confirmFullscreenDrawing);

// 画笔设置
brushSizeSlider.addEventListener('input', (e) => {
    brushSize = parseInt(e.target.value);
    brushSizeValue.textContent = brushSize;
});

repairRadiusSlider.addEventListener('input', (e) => {
    repairRadius = parseInt(e.target.value);
    repairRadiusValue.textContent = repairRadius;
});

// 返回按钮
backBtn.addEventListener('click', () => {
    window.electronAPI.navigateTo('home');
});

// 点击上传函数
function triggerFileUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            originalFile = file;
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    originalImage = img;
                    handleImageLoad(img);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    };
    input.click();
}

// 拖拽上传
originalPreview.addEventListener('dragover', (e) => {
    e.preventDefault();
    originalPreview.style.borderColor = '#667eea';
});

originalPreview.addEventListener('dragleave', () => {
    originalPreview.style.borderColor = '#dee2e6';
});

originalPreview.addEventListener('drop', (e) => {
    e.preventDefault();
    originalPreview.style.borderColor = '#dee2e6';
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('image/')) {
            originalFile = file;
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    originalImage = img;
                    handleImageLoad(img);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        } else {
            showToast('请选择图片文件', 'error');
        }
    }
});

// 点击查看大图按钮打开全屏模式
viewOriginalBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (originalImage) {
        openFullscreen();
    }
});

// 点击查看结果大图按钮打开结果全屏模式
viewResultBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (resultImg.src) {
        openResultFullscreen();
    }
});

// 结果图全屏查看功能（只读模式）
function openResultFullscreen() {
    if (!resultImg.src) return;
    
    // 创建结果全屏模态框
    const resultModal = document.createElement('div');
    resultModal.className = 'fullscreen-modal show';
    resultModal.id = 'resultFullscreenModal';
    resultModal.innerHTML = `
        <div class="fullscreen-header">
            <h2>去水印结果预览 (100%)</h2>
            <div class="fullscreen-actions">
                <button class="fullscreen-btn" id="downloadResultBtn">
                    <i class="anticon anticon-download"></i>下载
                </button>
                <button class="fullscreen-btn" id="closeResultFullscreenBtn">
                    <i class="anticon anticon-close"></i>关闭
                </button>
            </div>
        </div>
        <div class="fullscreen-canvas-container" id="resultFullscreenCanvasContainer">
            <img id="resultFullscreenImg" src="${resultImg.src}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
        </div>
        <div class="fullscreen-footer">
            滚轮缩放 | 拖拽移动
        </div>
    `;
    
    document.body.appendChild(resultModal);
    document.body.style.overflow = 'hidden';
    
    // 初始化缩放和拖拽
    let resultScale = 1;
    let resultOffsetX = 0;
    let resultOffsetY = 0;
    let isResultDragging = false;
    let resultDragStartX = 0;
    let resultDragStartY = 0;
    
    const container = resultModal.querySelector('#resultFullscreenCanvasContainer');
    const img = resultModal.querySelector('#resultFullscreenImg');
    
    // 居中图片
    function centerImage() {
        const containerRect = container.getBoundingClientRect();
        const imgRect = img.getBoundingClientRect();
        resultOffsetX = (containerRect.width - imgRect.width) / 2;
        resultOffsetY = (containerRect.height - imgRect.height) / 2;
        img.style.transform = `translate(${resultOffsetX}px, ${resultOffsetY}px) scale(${resultScale})`;
    }
    
    // 滚轮缩放
    container.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newScale = Math.max(0.1, Math.min(5, resultScale + delta));
        
        // 以鼠标位置为中心缩放
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const oldImgRect = img.getBoundingClientRect();
        const imgCenterX = oldImgRect.left + oldImgRect.width / 2 - rect.left;
        const imgCenterY = oldImgRect.top + oldImgRect.height / 2 - rect.top;
        
        resultScale = newScale;
        centerImage();
        
        // 调整偏移使缩放中心跟随鼠标
        requestAnimationFrame(() => {
            const newImgRect = img.getBoundingClientRect();
            const newImgCenterX = newImgRect.left + newImgRect.width / 2 - rect.left;
            const newImgCenterY = newImgRect.top + newImgRect.height / 2 - rect.top;
            
            resultOffsetX += imgCenterX - newImgCenterX;
            resultOffsetY += imgCenterY - newImgCenterY;
            img.style.transform = `translate(${resultOffsetX}px, ${resultOffsetY}px) scale(${resultScale})`;
        });
    });
    
    // 拖拽移动
    container.addEventListener('mousedown', (e) => {
        if (e.target === img) {
            isResultDragging = true;
            resultDragStartX = e.clientX - resultOffsetX;
            resultDragStartY = e.clientY - resultOffsetY;
            container.style.cursor = 'grabbing';
        }
    });
    
    container.addEventListener('mousemove', (e) => {
        if (!isResultDragging) return;
        resultOffsetX = e.clientX - resultDragStartX;
        resultOffsetY = e.clientY - resultDragStartY;
        img.style.transform = `translate(${resultOffsetX}px, ${resultOffsetY}px) scale(${resultScale})`;
    });
    
    container.addEventListener('mouseup', () => {
        isResultDragging = false;
        container.style.cursor = 'default';
    });
    
    container.addEventListener('mouseleave', () => {
        isResultDragging = false;
        container.style.cursor = 'default';
    });
    
    // 关闭按钮
    resultModal.querySelector('#closeResultFullscreenBtn').addEventListener('click', () => {
        resultModal.remove();
        document.body.style.overflow = '';
    });
    
    // 下载按钮
    resultModal.querySelector('#downloadResultBtn').addEventListener('click', () => {
        if (resultImg.src) {
            saveImage(resultImg.src);
        }
    });
    
    // ESC关闭
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            resultModal.remove();
            document.body.style.overflow = '';
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
    
    // 初始居中
    setTimeout(centerImage, 50);
}

// 点击预览区域（有图片时打开全屏，无图片时上传）
originalPreview.addEventListener('click', (e) => {
    // 忽略按钮点击
    if (e.target.closest('.card-actions') || e.target === viewOriginalBtn) return;
    
    if (originalImage) {
        openFullscreen();
    } else {
        triggerFileUpload();
    }
});

// 点击结果预览区域查看大图
resultPreview.addEventListener('click', (e) => {
    // 忽略按钮点击
    if (e.target.closest('.card-actions') || e.target === viewResultBtn) return;
    
    if (resultImg.src && resultImg.style.display !== 'none') {
        openResultFullscreen();
    }
});

// 调试：检查元素是否存在
console.log('originalEmpty:', originalEmpty);
console.log('pasteBtn:', pasteBtn);
console.log('viewOriginalBtn:', viewOriginalBtn);
console.log('originalPreview:', originalPreview);

// ESC关闭全屏
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && fullscreenModal.classList.contains('show')) {
        closeFullscreen();
    }
});