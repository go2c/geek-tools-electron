const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');

// AI Inpainting 模块 - 使用 ONNX Runtime 运行 LaMa 模型
let lamaSession = null;
let modelPath = null;
let ort = null;
let modelInfo = null; // 存储模型的输入输出信息

// 模型路径
function getModelPath() {
  if (!modelPath) {
    // 支持多个可能的模型文件名
    const possibleNames = ['lama_fp32.onnx', 'lama.onnx', 'lama_fp16.onnx', 'big-lama'];

    // 1. 优先从 HOME 环境变量下的 models/ 目录查找
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    if (homeDir) {
      for (const name of possibleNames) {
        const p = path.join(homeDir, 'models', name);
        if (fs.existsSync(p)) {
          modelPath = p;
          console.log('找到模型 (HOME/models):', p);
          break;
        }
      }
    }

    // 2. 回退到项目目录内的 models/（兼容旧路径）
    if (!modelPath) {
      for (const name of possibleNames) {
        const p = path.join(__dirname, 'models', name);
        if (fs.existsSync(p)) {
          modelPath = p;
          console.log('找到模型 (项目内 models):', p);
          break;
        }
      }
    }

    // 3. 默认路径（文件不存在时给出明确提示）
    if (!modelPath) {
      modelPath = path.join(homeDir || __dirname, 'models', 'lama_fp32.onnx');
      console.log('未找到模型文件，默认路径:', modelPath);
    }
  }
  return modelPath;
}

// 检查模型是否存在
function isModelAvailable() {
  return fs.existsSync(getModelPath());
}

// 初始化 ONNX Runtime
async function initONNX() {
  if (lamaSession) return true;
  
  if (!isModelAvailable()) {
    console.log('LaMa 模型未找到，请下载模型文件');
    return false;
  }
  
  try {
    // 让出主线程，避免卡死 UI
    await new Promise(resolve => setImmediate(resolve));
    ort = await import('onnxruntime-node');
    console.log('正在加载 LaMa 模型...');
    
    lamaSession = await ort.InferenceSession.create(getModelPath(), {
      executionProviders: ['cpu'] // Electron 环境使用 CPU
    });
    
    // 获取模型的输入输出信息
    modelInfo = {
      inputs: lamaSession.inputNames,
      outputs: lamaSession.outputNames
    };
    console.log('模型输入:', modelInfo.inputs);
    console.log('模型输出:', modelInfo.outputs);
    console.log('LaMa 模型加载成功');
    
    return true;
  } catch (error) {
    console.error('ONNX 初始化失败:', error);
    return false;
  }
}

// 解码 Base64 图像为 Buffer
function decodeBase64Image(base64) {
  const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
  return Buffer.from(base64Data, 'base64');
}

/**
 * 将图片数据转换为 CHW 格式的 Float32Array
 * @param {Buffer} rgbaData - RGBA 格式的像素数据
 * @param {number} size - 目标尺寸 (512)
 * @returns {Float32Array} CHW 格式的图像数据 [1, 3, H, W]
 */
function imageToCHWTensor(rgbaData, size) {
  const float32Data = new Float32Array(3 * size * size);
  
  // HWC -> CHW 转换 (并归一化到 0-1)
  for (let i = 0; i < size * size; i++) {
    const pixelIdx = i * 4;
    // RGB 通道分离
    float32Data[i] = rgbaData[pixelIdx] / 255.0;                         // R
    float32Data[i + size * size] = rgbaData[pixelIdx + 1] / 255.0;       // G
    float32Data[i + 2 * size * size] = rgbaData[pixelIdx + 2] / 255.0;  // B
  }
  
  return float32Data;
}

/**
 * 将掩码数据转换为单通道 Float32Array
 * @param {Buffer} rgbaData - RGBA 格式的掩码数据
 * @param {number} size - 目标尺寸 (512)
 * @returns {Float32Array} 单通道掩码 [1, 1, H, W]
 */
function maskToTensor(rgbaData, size) {
  const float32Data = new Float32Array(size * size);

  // lama_fp32.onnx: 1 = 修复区域(白色涂抹区), 0 = 保留区域
  for (let i = 0; i < size * size; i++) {
    const pixelIdx = i * 4;
    const brightness = (rgbaData[pixelIdx] + rgbaData[pixelIdx + 1] + rgbaData[pixelIdx + 2]) / 3;
    float32Data[i] = brightness > 125 ? 1.0 : 0.0;
  }

  return float32Data;
}

/**
 * 将模型输出转换为 RGBA 图像数据
 * 注意：lama_fp32.onnx 输出值范围是 [0, 255]（不是 [0,1]），直接取整即可
 * @param {Tensor} outputTensor - 模型输出的 Tensor
 * @param {number} size - 目标尺寸 (512)
 * @returns {Buffer} RGBA 格式的像素数据
 */
function tensorToRGBA(outputTensor, size) {
  const outputData = outputTensor.data;
  const rgbaData = Buffer.alloc(size * size * 4);

  for (let i = 0; i < size * size; i++) {
    // 输出值已在 [0,255] 范围，直接 clamp+round
    const r = Math.max(0, Math.min(255, Math.round(outputData[i])));
    const g = Math.max(0, Math.min(255, Math.round(outputData[i + size * size])));
    const b = Math.max(0, Math.min(255, Math.round(outputData[i + 2 * size * size])));

    const pixelIdx = i * 4;
    rgbaData[pixelIdx]     = r;
    rgbaData[pixelIdx + 1] = g;
    rgbaData[pixelIdx + 2] = b;
    rgbaData[pixelIdx + 3] = 255;
  }

  return rgbaData;
}

// AI 去水印主函数
async function aiInpaint(imageBase64, maskBase64, originalWidth, originalHeight) {
  console.log('=== AI 去水印开始 ===');
  console.log('原始尺寸:', originalWidth, 'x', originalHeight);
  
  if (!lamaSession) {
    console.log('模型未初始化，开始初始化...');
    // 使用 setImmediate 让出主线程，避免 UI 卡死
    await new Promise(resolve => setImmediate(resolve));
    const initialized = await initONNX();
    if (!initialized) {
      throw new Error('AI 模型未初始化');
    }
    console.log('模型初始化完成');
  }
  
  if (!modelInfo || !modelInfo.inputs || modelInfo.inputs.length === 0) {
    throw new Error('模型信息无效，请检查模型文件');
  }
  console.log('模型输入:', modelInfo.inputs);
  console.log('模型输出:', modelInfo.outputs);
  
  // 动态导入 jimp v1（用于图像解码）
  let JimpLib;
  try {
    JimpLib = require('jimp');
  } catch (e) {
    throw new Error('缺少 jimp 库，请运行: npm install jimp');
  }
  // jimp v1 使用具名导出 { Jimp }
  const Jimp = JimpLib.Jimp || JimpLib;
  
  // 解码 Base64 图像
  const imageBuffer = decodeBase64Image(imageBase64);
  const maskBuffer = decodeBase64Image(maskBase64);
  
  // jimp v1: Jimp.read(buffer) 需要 PNG/JPEG 格式才能自动识别 MIME
  // 直接用 fromBuffer 并指定 MIME
  const image = await Jimp.fromBuffer(imageBuffer);
  const mask = await Jimp.fromBuffer(maskBuffer);
  
  // jimp v1: width/height 是属性，不再是 getWidth()/getHeight() 方法
  const width = image.width;
  const height = image.height;
  
  console.log(`输入图像尺寸: ${width}x${height}`);
  
  // 缩放到 512x512 (LaMa 模型输入尺寸)
  // jimp v1: resize({ w, h }) 而不是 resize(w, h)
  const modelSize = 512;
  image.resize({ w: modelSize, h: modelSize });
  mask.resize({ w: modelSize, h: modelSize });
  
  // 提取 RGBA 数据
  const imageBitmap = image.bitmap.data;
  const maskBitmap = mask.bitmap.data;
  
  // 检查掩码数据
  let maskNonZero = 0;
  for (let i = 0; i < maskBitmap.length; i += 4) {
    if ((maskBitmap[i] + maskBitmap[i+1] + maskBitmap[i+2]) / 3 > 125) maskNonZero++;
  }
  console.log('掩码中需要修复的像素数:', maskNonZero, '/', modelSize * modelSize);
  
  if (maskNonZero === 0) {
    throw new Error('掩码为空：请先涂抹水印区域');
  }
  
  // 转换为 Tensor 格式
  const imageTensorData = imageToCHWTensor(imageBitmap, modelSize);
  const maskTensorData = maskToTensor(maskBitmap, modelSize);
  
  // 安全计算范围（避免大数组展开导致栈溢出）
  let imgMin = Infinity, imgMax = -Infinity, mskMin = Infinity, mskMax = -Infinity;
  for (let i = 0; i < imageTensorData.length; i++) {
    if (imageTensorData[i] < imgMin) imgMin = imageTensorData[i];
    if (imageTensorData[i] > imgMax) imgMax = imageTensorData[i];
  }
  for (let i = 0; i < maskTensorData.length; i++) {
    if (maskTensorData[i] < mskMin) mskMin = maskTensorData[i];
    if (maskTensorData[i] > mskMax) mskMax = maskTensorData[i];
  }
  console.log('图像张量范围:', imgMin.toFixed(3), '~', imgMax.toFixed(3));
  console.log('掩码张量范围:', mskMin.toFixed(3), '~', mskMax.toFixed(3));
  
  // 创建 ONNX Tensor
  const imageTensor = new ort.Tensor('float32', imageTensorData, [1, 3, modelSize, modelSize]);
  const maskTensor = new ort.Tensor('float32', maskTensorData, [1, 1, modelSize, modelSize]);
  
  // 构建输入 feeds（使用模型的真实输入名称）
  const feeds = {};
  feeds[modelInfo.inputs[0]] = imageTensor; // 通常第一个是 image
  if (modelInfo.inputs.length > 1) {
    feeds[modelInfo.inputs[1]] = maskTensor; // 第二个是 mask
    console.log('使用双输入模式:', modelInfo.inputs[0], '+', modelInfo.inputs[1]);
  } else {
    // 如果只有一个输入，尝试组合 image 和 mask
    console.log('模型只有一个输入:', modelInfo.inputs[0]);
  }
  
  // 执行推理
  console.log('开始 AI 推理...');
  const results = await lamaSession.run(feeds);
  
  // 获取输出（使用模型的真实输出名称）
  const outputName = modelInfo.outputs[0];
  const outputTensor = results[outputName];
  
  console.log('推理完成，输出形状:', JSON.stringify(outputTensor.dims));
  
  // ─── 步骤1：将模型输出（完整修复图）转换为 RGBA ──────────────────
  // 模型已经输出完整图像，掩码区域已被正确修复，直接用即可
  const inpaintedRGBA = tensorToRGBA(outputTensor, modelSize);

  // ─── 步骤2：将修复图缩放回原始尺寸 ──────────────────────────────
  const outputImage = Jimp.fromBitmap({ data: inpaintedRGBA, width: modelSize, height: modelSize });
  outputImage.resize({ w: originalWidth, h: originalHeight });

  // ─── 步骤3：导出为 Base64 ─────────────────────────────────────────
  const resultBase64 = await outputImage.getBase64('image/png');

  console.log('AI 修复完成');
  return resultBase64;
}

// 检查模型状态
function checkModelStatus() {
  const fileExists = isModelAvailable();
  const modelLoaded = lamaSession !== null;
  // available 只要求模型文件存在，实际加载在 aiInpaint 时进行
  const available = fileExists;
  
  let message;
  if (!fileExists) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
    message = `模型文件未找到，请将 lama_fp32.onnx 放至 ${homeDir}/models/ 目录`;
  } else if (!modelLoaded) {
    message = '模型文件已就绪，点击后将加载模型...';
  } else {
    message = '模型已加载，可以启用 AI 增强';
  }
  
  return {
    available,
    fileExists,
    modelLoaded,
    path: getModelPath(),
    message,
    modelInfo: modelInfo || null
  };
}

// 注册 IPC Handler
module.exports = function() {
  // 模型改为按需加载，不在启动时初始化
  // initONNX() 将在首次调用 aiInpaint 时执行

  // 检查模型状态
  ipcMain.handle('watermark-ai:check-model', async () => {
    return checkModelStatus();
  });
  
  // AI 去水印
  ipcMain.handle('watermark-ai:inpaint', async (event, { imageBase64, maskBase64, width, height }) => {
    try {
      console.log('收到 AI 去水印请求');
      const result = await aiInpaint(imageBase64, maskBase64, width, height);
      return { success: true, result };
    } catch (error) {
      console.error('AI 去水印失败:', error);
      return { success: false, error: error.message };
    }
  });
  
  // 获取模型信息
  ipcMain.handle('watermark-ai:get-model-info', async () => {
    return {
      name: 'LaMa (Large Mask Inpainting)',
      size: '~200MB (FP32)',
      inputs: modelInfo?.inputs || [],
      outputs: modelInfo?.outputs || [],
      instructions: [
        '1. 下载 LaMa ONNX 模型（lama_fp32.onnx 或 lama.onnx）',
        '2. 将文件放到 %HOME%/models/ 目录（如 C:/Users/你的用户名/models/lama_fp32.onnx）',
        '3. 重启应用即可使用 AI 去水印'
      ]
    };
  });
  
  console.log('AI 去水印模块已注册');
};
