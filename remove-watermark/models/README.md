# AI 去水印模型

本目录用于存放 LaMa (Large Mask Inpainting) AI 模型。

## 下载模型

### 步骤 1：下载模型文件

访问以下链接下载模型（约 500MB）：

**官方下载地址：**
https://github.com/advimman/lama/releases/download/lama-model/big-lama

**国内镜像（如果有）：**
- 待补充

### 步骤 2：放置模型文件

1. 将下载的文件重命名为 `lama.onnx`
2. 将文件放到本目录：
   ```
   remove-watermark/
   └── models/
       └── lama.onnx  ← 将文件放这里
   ```

### 步骤 3：重启应用

重启 "Geek Tools" 应用，AI 去水印功能即可使用。

## 使用方法

1. 打开去水印工具
2. 上传包含水印的图片
3. 点击 **"AI 增强"** 按钮启用 AI 模式
4. 使用涂抹或框选工具选择水印区域
5. 点击 **"去除水印"**

## 技术说明

- **模型**: LaMa (Large Mask Inpainting)
- **输入尺寸**: 512x512
- **推理后端**: ONNX Runtime (CPU)
- **输出**: 无痕修复的图像

## 模型来源

LaMa 模型由 [advimman/lama](https://github.com/advimman/lama) 提供。

许可协议: [模型许可](https://github.com/advimman/lama#license)
