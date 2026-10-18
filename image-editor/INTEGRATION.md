# 图片编辑模块：miniPaint v4.14.3（候选，尚未发布）

## 复用而非重写

- 上游：<https://github.com/viliusle/miniPaint>，MIT。
- 固定版本：`v4.14.3`。
- 直接使用上游的 `dist/bundle.js`，Git Blob SHA-1：`c16451f1ee5d0c56d24eb83c51a79875eec8b754`。未改动打包文件，所有必要图标一起复制。
- 原作者 MIT 文本：`image-editor/MIT-LICENSE.txt`；构建依赖授权声明：`image-editor/dist/bundle.js.LICENSE.txt`。
- 浏览器集成复用**上游官方示例**：<https://github.com/viliusle/miniPaint/blob/v4.14.3/examples/open-edit-save.html>，调用其 `Layers.insert`、`Layers.get_dimensions`、`Layers.convert_layers_to_canvas`；额外桥接代码仅管文件交换和另存，不实现任何画笔、图层或滤镜。
- 上游未使用第三方在线图片编辑站点，本项目在编辑器页面进一步限制 `connect-src 'none'`，图片仅以本机 `blob:` URL 交给同源 iframe，默认输出新 PNG，不覆盖原件。

## 浏览器入口与验收规则

上传 PNG/JPG/JPEG/WebP/BMP/AVIF 后点击“编辑图片”；选择图层、画笔、裁剪、文字、滤镜等 miniPaint 自带功能；完成后点击外部“另存 PNG”得到新文件。原有格式转换操作保持不变。

当前保护边界：单文件最多 22 MB；移动设备 1200 万像素、电脑 2800 万像素；输出画布最多 3000 万像素；不宣称 HEIC、动图帧、CMYK、所有字体、超大图片、专业图层格式完全保真。iPhone 的低内存和离线编辑需以 Safari 真机测试为准。

## 隔离验收

- `npm test`：原格式能力与 PDF 预览回归不变，新增固定上游哈希、许可文件、同源编辑桥及离线资源完整性校验。
- `node checks/image-editor-e2e.cjs`：使用隔离 Chrome / Playwright，在本机服务打开图片，调用 miniPaint 官方图层 API 对蓝色原图叠加红色图层，保存 PNG 后验证像素确实改变、尺寸和 MIME 正确、原图 SHA-256 不变、没有外网请求，并断网重开编辑器。
- GitHub Actions 负责持续验收，不需要 Remote Desktop Commander。未通过完整验收前不合并正式版。

## 未覆盖

PDF 原文字修改需要另行验证 ONLYOFFICE 或其他成熟文档引擎。此 PR 不安装 Stirling PDF、ONLYOFFICE、大型 Docker 服务，也不启动 AI 智能规划。
