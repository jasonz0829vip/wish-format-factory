# Office 可视化预览与 PDF 原文字实验（v0.10.3 候选）

**本功能仍在 stacked Draft PR 阶段，正式 v0.10.1 不变。**

## A. 用户可以实际使用的预览流程（依赖自有 Windows 转换服务）

1. 上传已批准、可转 PDF 的 Word、Excel、PPT 文档，点击“预览文档”。
2. 复用现有本机 `api/convert` + LibreOffice 生成 PDF 预览副本；不新增文档后端。
3. 将 PDF 副本交给已验收的 Mozilla PDF.js 可视化阅读器浏览、翻页、缩放。
4. 这是 **Office 只读预览**：关闭原 Office 文件页操作按钮；原文件仍保存在上传列表中，不被修改。
5. 自有 Windows / Tailscale 私有服务不可达或未配对时明确失败。手机独立离线 PWA 不能离线执行 Office 渲染。宏启用文档继续拒绝。

**测试范围区分：** GitHub Chromium 浏览器端可用模拟转换端点验证路由、回显、文档类型、原文件 SHA-256、错误回应和只读属性；但模拟端点的成功并不能证明两台 Windows 实际 LibreOffice 转换或复杂文档保真。Windows 现场验收后才可以发布。

## B. PDF“修改原有文字”实验（不代表全面 PDF 编辑）

实验文件：`experiments/draw_pdf_text_probe.py`；用于 GitHub Linux Runner 隔离验证。

- 复用成熟 LibreOffice Draw 原生 PDF 导入/导出及 UNO；不是自行写 PDF 格式解析器。
- **与 PDF 原文件流级别编辑不同**：Draw 把 PDF 对象重新构建成可编辑对象，编辑后重新导出新的 PDF。字体、空格、位置、图片、页眉或签名可能变化。
- 对单个 TextShape 的完整、唯一文本匹配执行一次替换；重复命中、无文字层、扫描 PDF、拆分字形、过大文件、无效路径均拒绝，绝不替换“看上去像”但不确定的文字。
- 原文件不可覆盖；按成功生成的 PDF 重新提取文字、确认旧文字消失、新文字存在、未编辑页保留及文件 SHA-256 不变。
- 用两页中文 PDF 验证，在 GitHub Actions 的独立 job 中检查成功替换、重复内容拒绝和无匹配拒绝。
- **上线阻碍**：Windows UNO 运行时、中文多字体、真实合同/表格/扫描件、保真阈值、电子签名/权限限制等都未验证。绝不能将这一实验作为正式“PDF 编辑器”入口。

## C. GitHub 已核对的成熟完整编辑方案

- [Stirling PDF](https://github.com/Stirling-Tools/Stirling-PDF)：其官方文档 [Content and editing](https://docs.stirlingpdf.com/Functionality/Content-Editing/) 确认 PDF Text Editor 支持原有文本和图片的修改；它是 **Open Core**。需要隔离部署并验证完整免费能力后，才考虑进项目。不得自动上传用户 PDF 到公共云。
- [ONLYOFFICE Docs Community](https://github.com/ONLYOFFICE/DocumentServer)：同时覆盖 Word/Excel/PPT/PDF 浏览器编辑，遵守 **AGPLv3**、需保留社区版品牌，官方 Docker 文档建议至少 4GB RAM 与 40GB 可用磁盘；社区版不含完整移动 Web 体验。需要单独算资源和品牌许可，不直接装至 RTX3070/QLS。
- [Univer](https://docs.univer.ai/guides/sheets/features/import-export)：编辑 UI 可用，但官方 XLSX 导入导出依赖 Pro / 后端能力；不适合作为“完全免费、高保真 XLSX 编辑”的默认捷径。

## D. 发布前硬验收

- GitHub 持续集成全通过；
- QLS、RTX3070 上真实 Word/Excel/PPT 渲染与浏览；
- 中文、图片、表格、公式、字体、高 DPI、手机屏幕保真；
- 漏洞风险：宏文档拒绝、伪造 PDF MIME 拒绝、私有 API 不外泄；
- 保存必须产生新文件，提供原始及编辑后内容对照；
- 另建完整富文本编辑器的隔离评估 PR，**不在本分支伪造“直接编辑”能力**。
