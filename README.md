# 许愿格式工厂 · Wish Format Factory

一款在浏览器里完成文件转换的开源本地优先工具。打开网页、上传文件、用中文描述目标，程序依据格式能力表选择处理流程；有歧义时要求用户明确选择。

## 手机端与离线

通过 HTTPS 打开 GitHub Pages 网站，等待页面显示“离线资源已缓存”。这只是浏览器离线资源就绪提示，**不等于 iPhone Safari 真机飞行模式验收通过**。iPhone 请用 Safari 的分享菜单选择「添加到主屏幕」，再打开已添加的应用。已经缓存过的图片/PDF/XMind 操作可在没有网络时继续使用；个别音频编码格式会受 iOS 浏览器兼容性限制。长时间不用可能被系统清理离线缓存，需重新联网加载。

**这是纯静态浏览器版本，不运行任何服务器上传端点。用户的文件处理数据不上传至本站。** 输入文件在浏览器内处理，下载也在本机完成。首次安装、更新、缓存恢复需要联网。

## 目前支持

- 图片：常见格式互转、压缩、批量转换、图片合并成 PDF。
- PDF：提取单页、指定范围、最后一页或倒数第 N 页；逐页拆分成独立 PDF、删除指定页、全篇倒序、转图片与多文件合并；**离线提取可复制文字**，可导出 TXT 或 Markdown（不提供 OCR，扫描件会提示不能提取）。
- XMind：导出 Markdown（主题层级）、PNG、JPG、SVG、PDF，**不会完全复制 XMind 原始样式**。
- 音频：浏览器支持的音视频可提取成 MP3/WAV；iOS 的编解码器能力需真机验收。
- 多义指令：例如“把六页拿出来”，会让用户确认是第六页还是前六页。
- 上传文件后不预先替用户决定输出格式；示例建议随 Word、PDF、图片、XMind、音视频文件类别动态调整。
- 支持 iPhone Web Share 文件分享能力的浏览器中，输出结果增加「分享到文件」入口；不支持时保留常规下载。

## 重要边界

- **Word/Excel/PPT → PDF、Word 指定页导出**在 iPhone 独立离线版仍不可用。用户可在 iPhone 安装 Tailscale、登录自己的同一私有网络，通过 Windows 电脑 Tailscale Serve 提供的 HTTPS 私有地址使用完整版；仅限已授权设备联网时使用。文件直接发送给自己的电脑，不经过第三方在线转换网站。
- 当前静态版使用已测试的离线意图解析规则；Qwen 本地语言模型只在用户自己 Windows 电脑的完整版本运行，本网站**不调用在线大语言模型**。
- 浏览器内 LibreOffice WASM 已在 Windows Chromium 成功转换 DOCX→PDF；但 WebKit 实验中初始化后打开同一文件卡住超过 115 秒、峰值内存较高，因此目前没有将它发布为 iPhone 独立转换功能。GitHub Pages 的跨源隔离可通过 Service Worker 方案处理，但不能解决已发现的 WebKit 文档加载和内存问题。
- 不声称任意文件格式均能互转，不支持时会明确报错。

## 本地开发

静态文件位于仓库根目录，可使用任何支持 MIME 类型的本地 HTTP 服务运行。依赖组件及打包入口 `media-entry.mjs`、`xmind-entry.mjs` 可通过 `npm ci` 后调用 esbuild 重新打包；具体版本锁定在 `package-lock.json`。如重新打包，注意按上游开源许可证保留授权信息。

## 致谢与许可证

应用界面与调用逻辑采用 MIT 许可证。所含第三方组件依其自身许可证使用，见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

## v0.7 基础格式与压缩包处理

### 格式识别与转换范围

- 目前内置 73 种输入扩展名的分类表，覆盖 Word / Excel / PPT 的传统格式与 OOXML 格式、Markdown / TXT、PDF、XMind、图片及常见音视频。**识别扩展名不等于能够任意互转**，完整能力以实际转换器返回为准。
- Windows 完整版：LibreOffice 负责办公文档转 PDF，FFmpeg 负责音视频，浏览器引擎负责 PDF、图片和 XMind；Markdown/TXT 可转 PDF、HTML 或纯文本。
- 宏启用文档 DOCM / DOTM / XLSM / XLTM / PPTM / PPSM / POTM 会识别类型，但默认拒绝自动打开和转换。XLSB、部分旧格式与模板格式尚未通过真实原生文件的完整验收，不承诺无损。
- DOCX、XLSX、PPTX → PDF 已用实际文件验证；MD、TXT → PDF/HTML 的实际内容也已抽检。PDF → 可编辑 Word 仍未支持。
- MP4、MP3、MOV、M4V 等文件会被识别；Windows 上音视频转换依赖 FFmpeg 与原文件内真实存在的编码流。

### 上传压缩包

- **ZIP**：手机/浏览器版可在本地安全解包，逐个下载内部文件，或直接选择某个文件继续处理。不使用服务器上传解压。
- **ZIP / 7Z / RAR**：Windows 完整版可安全展开并识别多种文件；支持内部文档/图片批量转换为 PDF，或内部音视频批量转 MP3。未匹配、出错或未知的文件原样保留，结果 ZIP 包含 `转换报告.txt` 与 `转换报告.json`，文件夹层级保留。
- 安全限制：Windows 当前单包不超过 120MB、展开后总量不超过 320MB、单文件不超过 90MB、最多 80 个文件。浏览器 ZIP 解包单包不超过 90MB、总展开量不超过 100MB、单文件不超过 30MB、最多 80 个文件。
- 加密或损坏的压缩包、危险路径、同名文件冲突、符号链接、超大解压等会明确拒绝；嵌套压缩包原样保留，不自动无限递归解压。
- 这些限制旨在保护本机安全与运行内存。手机纯静态版暂不直接解压 RAR / 7Z，也暂不把多类混合文件自动跨引擎批量转换；这些操作需 Windows 完整版。

### 离线 OCR

- 已在 Windows 的 Chromium/WebKit 浏览器自动识别中英文图片与扫描版 PDF。首次下载/缓存 Tesseract.js 与训练数据约 33MB 后再可离线使用。
- OCR 识别结果请复核金额、专有名词和表格布局。扫描 PDF 单次最多 12 页，扫描文字不等于完整排版重建。
## v0.8 Windows 完整版（2026-10-18）

**优先修补转换链路，不包含 AI 智能规划升级。** QLS 和 RTX3070 的 Windows 后端现在新增：

- LibreOffice 原生的 Word / Excel / PPT **同类别双向转换**。实际支持的输出组合由 `office-engine.cjs` 的白名单限制并检查输出文件结构。例：DOCX ↔ ODT、XLSX ↔ ODS、PPTX ↔ ODP；DOCX→DOC/RTF/TXT/HTML，XLSX→XLS/CSV，PPTX→PPT。
- **PDF（含文字层）→可编辑 DOCX**：复用 Artifex pdf2docx + PyMuPDF，隔离于浏览器端，限制 25MB / 30 页；复杂排版、表格、图表与字体可能变化，不承诺无损。扫描件需先 OCR。
- **Markdown ↔ Word**：复用 Pandoc 3.12.1；Word 带嵌入图片时输出 ZIP，包含 Markdown 和图片。Word→HTML 若产生伴随图片也一并打包，避免图片丢失。
- **指定页纠错**：Word“最后一页、倒数第二页”现在会先转换为 PDF，再按实际页数解析并提取。
- **真实文件校验**：除了后缀，检查 DOCX/XLSX/PPTX 内部结构；宏启用格式默认拒绝；XLSX 伪装成 XLSB 被拒绝。
- **不会改变 iPhone 独立离线版的 Office 限制**。静态浏览器依然不能在 iPhone 本机运行 LibreOffice / pdf2docx / Pandoc，只能依赖已有的安全 Windows 服务。

完整测试方向、失真与数据丢失警告见 [FORMAT_SUPPORT_V08.md](FORMAT_SUPPORT_V08.md)。公开 GitHub 仓库只发布无私密数据的浏览器前端，不包含 Windows 后端密钥、用户样本、模型、Pandoc 及 Python 虚拟环境。
