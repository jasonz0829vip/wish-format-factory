# 许愿格式工厂 v0.8 — 基础格式真实验收矩阵

更新时间：2026-10-18（截至本轮实验，实际结果以设备和文件内容为准）。

**范围定义**：识别到文件扩展名 ≠ 能够转换；识别≠还原保真；已经验证的方向如下，未列出的组合不会冒充成功。

## Windows QLS、RTX3070 已验收的方向

| 输入 | 输出 | 引擎 | 验收 |
|---|---|---|---|
| DOCX | PDF、ODT、DOC、RTF、TXT、HTML | LibreOffice | QLS 真实双页文档；输出结构/页数检查 |
| ODT | DOCX | LibreOffice | QLS 真实互转 |
| XLSX | PDF、ODS、XLS、CSV | LibreOffice | QLS 真实双工作表样本 |
| ODS | XLSX | LibreOffice | QLS 真实互转 |
| CSV | XLSX | LibreOffice | QLS 内容与容器校验 |
| PPTX | PDF、ODP、PPT | LibreOffice | QLS 真实双页演示 |
| ODP | PPTX | LibreOffice | QLS 真实互转 |
| PDF（有可复制文字） | 可编辑 DOCX | pdf2docx + PyMuPDF | 两台 Windows 真实文件验证；复杂版式不保证还原 |
| Markdown (.md) | DOCX | Pandoc 3.12.1 | 两台 Windows 实测 |
| DOCX | Markdown (.md) | Pandoc 3.12.1 | 两台 Windows 实测；含图片则输出 ZIP，包含 MD + 相对路径媒体资源 |
| MD / TXT | PDF / HTML / TXT | markdown-it、LibreOffice 等 | v0.7 已验收 |
| PDF | 按页提取/合并/删页/倒序/图片或文字 | PDF.js、pdf-lib、Tesseract.js | v0.4-v0.7 已验收 |
| JPG / PNG / WebP 等 | 互转、转 PDF、OCR | 浏览器/Canvas/PDF 引擎 | 部分格式已实测 |
| MP4 / MOV / M4V / MP3 | MP3、WAV、MOV、M4V、AAC、Opus 等已测目标 | FFmpeg | 已检查真实媒体流与输出容器 |
| ZIP | 读内部文档/图片/视频，批量转 PDF/MP3 并保留其他原件 | JSZip、LibreOffice、FFmpeg | 两台 Windows 实测 |
| 7Z / RAR5 | 安全解压/批处理 | 7-Zip | QLS 实测，RTX 完整处理亦做过端到端验收 |

## 重要限制和安全保护

- **Office CSV 导出是单表数据导出**：多工作表、公式、样式无法在 CSV 中完整保存。CSV 不是原工作簿备份。
- **PDF → DOCX 不是无损还原**：图表、复杂表格、字体与排版可能变化；扫描件没有文字层时需先 OCR，不会输出假可编辑文件。
- **DOCM、XLSM、PPTM 等含宏后缀**默认拒绝自动转换；已检查真实文件类型，改后缀伪装成 XLSB 不算验证 XLSB。
- Word→Markdown 遇到图片会将 MD 与媒体文件一起打包，防止只给文字而丢图片；缺失的 Markdown 图片引用会报错。
- **手机独立离线版**仍不能运行 Windows 版 LibreOffice、Pandoc 或 pdf2docx。Office 任务在手机端明确提示需要自己的 Windows 服务。
- 安全限制：拒绝危险压缩路径、可疑链接、加密文件、过大展开内容。原件不修改。含宏、受保护和特殊文件需谨慎。
- 73 种输入扩展名属于分类识别范围；**真实有效的转换方向比这个数字少得多**。真正的 XLSB、复杂旧模板/动画演示等仍没有完整专项验收。
- 未实现：PDF→结构化可编辑 XLSX/PPTX、视频任意格式互转、通用多步骤批处理、所有格式无损互转。不要称为覆盖世界所有格式。

## 技术与许可证说明

后端复用 LibreOffice（MPL-2.0）、Pandoc 3.12.1（GPL-2.0）、pdf2docx 0.5.13（MIT，依赖 PyMuPDF 1.28.2，AGPL-3.0 或商业许可证）、FFmpeg、7-Zip 等成熟软件。**桌面后端的 Python 虚拟环境、模型文件和 Pandoc 可执行程序未发布到静态公开网站**。如需分发 Windows 安装包，应另行核查上游许可证义务。

QA 方式：合成含中文、跨页、表格、公式、嵌入图片的真实 DOCX/XLSX/PPTX/MD/PDF；检查 HTTP 结果、输出容器、页数、文档文字、解压结果，分别确认成功及拒绝条件。基础识别和执行优先，AI 智能规划仍未开始。

## 新增实际验收：Markdown / Word、HTML 嵌入图片

- QLS：Markdown→DOCX 与 DOCX→Markdown，实际输出和内容验证通过；带图片的 DOCX→Markdown 输出 ZIP，包含 document.md 与 `assets/media/image1.png`，MD 图片引用为相对路径。
- QLS：带图片的 DOCX→HTML 会附带 PNG；现打包成 ZIP（`document.html` 与 `assets/`），没有图片丢失问题。
- RTX3070：使用 Pandoc 3.12.1 完成 Markdown→DOCX→Markdown 往返并验证原文标题/中文存在。
- 中文 Word 倒数第二页（2 页文档）现正确输出第 1 页；自动化 UI 实测通过。Office 并不承诺与 Microsoft Office 完全一致的分页与保真。
- Markdown 文档引用缺失外部图片时，会明确拒绝直接生成 Word；用户应补全依赖素材。
- 两台机器的 PDF→DOCX 后端均采用隔离 Python 环境；网络服务仅面向本机/自有私有访问权限，不上传至第三方在线转换商。
