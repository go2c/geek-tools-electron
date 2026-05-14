# 🛠️ Geek Tools

一个集成了多个实用工具的桌面应用，基于 Electron 开发。

## ✨ 功能特性

### 📊 Excel 智能处理工具
- **合并单元格**：根据指定列合并相邻的相同值
- **取消合并**：将合并的单元格内容填充到每一行
- **分组统计**：按指定列分组并统计数量、求和或平均值
- **统计方式可选**：支持 Count、Sum、Average 等常见统计方式

### 🖼️ 图片压缩工具
- 支持拖拽和剪贴板导入图片
- 可调节压缩质量（0-100）
- 自定义输出尺寸，支持保持纵横比
- 支持多种输出格式，包括 PNG、JPEG、WebP、GIF、BMP 和 ICO
- 全屏预览压缩结果，支持滚轮缩放
- 一键复制到剪贴板或保存到本地

### ✨ 图片去水印工具
- 支持拖拽和剪贴板导入图片
- 鼠标涂抹标记水印区域
- 智能修复算法去除水印
- 优化了“去除水印”按钮的加载体验，避免界面卡死
- 可调节画笔大小和透明度
- 一键复制到剪贴板或保存到本地

## 🛠️ 技术栈

- **框架**: Electron 30
- **语言**: JavaScript (ES6+)
- **样式**: CSS3
- **依赖**:
  - `xlsx` - Excel 文件处理
  - `browser-image-compression` - 图片压缩

## 📦 安装与运行

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm start
```

### 打包构建

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

## 📖 使用说明

### Excel 工具
1. 点击「选择文件」按钮选择 Excel 文件（支持 .xlsx 和 .xls 格式）
2. 选择要处理的列
3. 选择操作类型：合并单元格 / 取消合并 / 分组统计
4. 如果选择“分组统计”，再选择统计方式：数量、求和或平均值
5. 点击「开始处理」按钮
6. 处理完成后会在原文件目录生成新文件

### 图片压缩工具
1. 通过拖拽、剪贴板粘贴或点击选择图片
2. 调整压缩参数（质量、尺寸）
3. 选择输出格式（支持 PNG、JPEG、WebP、GIF、BMP、ICO）
4. 点击「开始压缩」或按 Enter 键
5. 查看压缩结果，支持全屏预览和缩放
6. 复制或保存压缩后的图片

### 图片去水印工具
1. 通过拖拽、剪贴板粘贴或点击选择图片
2. 使用鼠标在原图上涂抹水印区域
3. 调整画笔大小和透明度（可选）
4. 点击「去除水印」或按 Enter 键
5. 复制或保存去水印后的图片

### AI 模型准备（可选增强）
- 去水印工具支持 LaMa 大模型加速修复。
- 请下载 LaMa ONNX 模型文件，例如 `lama_fp32.onnx` 或 `lama.onnx`。
- 将模型文件保存到你的用户目录下的 `models` 目录：
  - Windows: `C:\Users\<你的用户名>\models\lama_fp32.onnx`
  - macOS / Linux: `~/models/lama_fp32.onnx`
- 程序会优先从 `HOME/models/` 或 `USERPROFILE/models/` 中加载模型；若未找到则会回退检查 `remove-watermark/models/`。
- 如果模型未找到，工具仍可使用传统算法去水印，但 AI 模型可提供更好的修复效果。

## 📁 项目结构

```
geek-tools-electron/
├── index.html                 # 主页面（工具集首页）
├── main.js                    # Electron 主进程入口
├── preload.js                 # 预加载脚本（暴露API）
├── package.json               # 项目配置
├── excel-tool/                # Excel 工具子应用
│   ├── index.html             # 渲染页面
│   ├── renderer.js            # 渲染进程逻辑
│   └── main-api.js            # 主进程API（文件选择、Excel处理）
├── image-compressor/          # 图片压缩工具子应用
│   ├── index.html             # 渲染页面
│   ├── renderer.js            # 渲染进程逻辑
│   └── main-api.js            # 主进程API（剪贴板操作）
└── remove-watermark/          # 图片去水印工具子应用
    ├── index.html             # 渲染页面
    ├── main-api.js            # 主进程API（AI 模型加载、去水印处理）
    ├── opencv.js              # OpenCV WebAssembly 库
    └── renderer.js            # 渲染进程逻辑
```

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📧 联系方式

如有问题或建议，请通过 Issue 联系。

---

**享受使用！** 🚀