# 第三方开源组件告知

本应用复用成熟项目。打包的第三方代码仍受原许可管辖，**不因本项目许可证变更其原许可**。

| 组件 | 本轮版本 | 许可证 | 上游 |
|---|---|---|---|
| Mediabunny | 1.61.6 | MPL-2.0 | https://github.com/Vanilagy/mediabunny |
| @mediabunny/mp3-encoder | 1.61.6 | MPL-2.0 | https://github.com/Vanilagy/mediabunny |
| markmap-lib, markmap-view | 0.18.12 | MIT | https://github.com/markmap/markmap |
| @ljheee/xmind-parser | 1.1.3 | MIT | https://github.com/ljheee/xmind-parser |
| pdf-lib | 1.17.1 | MIT | https://github.com/Hopding/pdf-lib |
| pdfjs-dist / PDF.js | 官方 OmniTools 锁定版本 | Apache-2.0 | https://github.com/mozilla/pdf.js |
| heic2any | 0.0.4 | MIT | https://github.com/alexcorvi/heic2any |
| JSZip | 3.10.1 | MIT 或 GPL-3.0-or-later，按 MIT 选项使用 | https://github.com/Stuk/jszip |

项目打包入口在仓库根目录（`media-entry.mjs`、`xmind-entry.mjs`），依赖清单和锁文件均提供，可据此重建浏览器打包内容。请查看上述上游仓库获取相关许可证和完整组件源文件。MPL-2.0 所覆盖文件的原许可证仍保持有效。

GitHub Pages 静态版本不包含私人电脑的服务端代码、配对码、测试用户文件或模型权重。

- Tesseract.js 6.0.1 / tesseract.js-core (Apache-2.0), https://github.com/naptha/tesseract.js
- Tesseract OCR / tessdata_fast English and Simplified Chinese models (Apache-2.0), https://github.com/tesseract-ocr/tessdata_fast
- Windows-only archive converter uses locally installed 7-Zip (LGPL-2.1; RAR extraction subject to original 7-Zip/unRAR licensing): https://www.7-zip.org/
- Windows-only Markdown conversion uses markdown-it 14.3.2 (MIT), https://github.com/markdown-it/markdown-it, and html-to-text 9.0.5 (MIT), https://github.com/html-to-text/node-html-to-text

## v0.8 Windows-only engine license reminder

- **Pandoc 3.12.1**, GPL-2.0: https://github.com/jgm/pandoc — separately installed on the user's Windows computer; no binary is distributed in this static repository.
- **pdf2docx 0.5.13**, MIT: https://github.com/ArtifexSoftware/pdf2docx — separately installed in an isolated Python environment.
- **PyMuPDF 1.28.2**, AGPL-3.0 or commercial: https://github.com/pymupdf/PyMuPDF — dependency used by pdf2docx. Redistributing a combined Windows product or offering this as a network service requires a separate license/compliance review.
- **LibreOffice**, MPL-2.0: https://www.libreoffice.org/ — reused as a separate, existing local office conversion process.

Publishing this PWA's MIT JavaScript does not relicense the upstream tools or their executable binaries.
