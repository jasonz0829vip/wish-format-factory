/* Offline image editing uses unmodified upstream miniPaint v4.14.3 (MIT).
 * API bridge follows https://github.com/viliusle/miniPaint/blob/v4.14.3/examples/open-edit-save.html
 * Input never leaves this origin; changes are exported into a new PNG file.
 */
(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const dialog = byId('imageEditorDialog');
  if (!dialog) return;
  const frame = byId('imageEditorFrame');
  const save = byId('imageEditorSave');
  const status = byId('imageEditorStatus');
  const fileLabel = byId('imageEditorFilename');
  let openId = 0, sourceUrl = null, originalFile = null, onSave = null, ready = false, saving = false;

  function message(text, failed = false) {
    status.textContent = text;
    status.classList.toggle('imageEditorError', failed);
  }
  function controls() { save.disabled = !ready || saving; }
  function cleanup() {
    ++openId;
    ready = false; saving = false;
    controls();
    onSave = null; originalFile = null;
    if (sourceUrl) { URL.revokeObjectURL(sourceUrl); sourceUrl = null; }
    frame.src = 'about:blank';
    fileLabel.textContent = '';
  }
  function loadFrame(id) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        frame.removeEventListener('load', onLoad);
        reject(new Error('图片编辑器加载超时'));
      }, 20000);
      function onLoad() {
        clearTimeout(timeout);
        if (id !== openId || !dialog.open) { resolve(null); return; }
        const child = frame.contentWindow;
        if (!child || !child.Layers || !child.FileOpen) {
          reject(new Error('图片编辑器没有正常启动；请确认离线资源已缓存'));
          return;
        }
        resolve(child);
      }
      frame.addEventListener('load', onLoad, {once:true});
      frame.src = new URL('./image-editor/index.html', document.baseURI).href;
    });
  }
  async function open(file, onOutput) {
    if (!file || !/\.(png|jpe?g|webp|bmp|avif)$/i.test(file.name))
      throw new Error('图片编辑目前仅接受 PNG、JPG、WebP、BMP、AVIF');
    if (file.size > 22 * 1024 * 1024)
      throw new Error('单张图片暂限 22MB，请先使用已有压缩功能');
    if (dialog.open) dialog.close();
    const id = ++openId;
    originalFile = file;
    onSave = onOutput;
    fileLabel.textContent = file.name;
    ready = false; saving = false; controls();
    dialog.showModal();
    message('正在加载本地 miniPaint 编辑器…');
    try {
      const child = await loadFrame(id);
      if (!child || id !== openId || !dialog.open) return;
      sourceUrl = URL.createObjectURL(file);
      const img = new Image();
      img.src = sourceUrl;
      await img.decode();
      if (id !== openId || !dialog.open) return;
      const pixels = img.naturalWidth * img.naturalHeight;
      const limit = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 12000000 : 28000000;
      if (!pixels || pixels > limit) throw new Error('图片像素超过编辑器安全上限，请先缩小图片尺寸');
      const safeName = file.name.replace(/[<>&"']/g, '_').slice(0, 160);
      await child.Layers.insert({
        name: safeName, type: 'image', data: img,
        width: img.naturalWidth, height: img.naturalHeight,
        width_original: img.naturalWidth, height_original: img.naturalHeight
      });
      if (id !== openId || !dialog.open) return;
      const dims = child.Layers.get_dimensions();
      if (!dims.width || !dims.height) throw new Error('编辑器没有生成有效画布');
      ready = true; controls();
      message('已加载 ' + dims.width + ' × ' + dims.height + '。编辑完成后点击「另存 PNG」；原图保持不变。');
    } catch (error) {
      if (id === openId && dialog.open) message('加载失败：' + String(error.message || error).slice(0, 170), true);
    }
  }
  async function exportPng() {
    if (!ready || saving || !originalFile || !dialog.open || typeof onSave !== 'function') return;
    saving = true; controls();
    const id = openId;
    message('正在将编辑结果转换成 PNG…');
    try {
      const child = frame.contentWindow;
      if (!child || !child.Layers) throw new Error('编辑会话已结束');
      const dim = child.Layers.get_dimensions();
      const width = Number(dim.width), height = Number(dim.height);
      if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 ||
        width * height > 30000000) throw new Error('修改后的图片尺寸超出浏览器导出限制');
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('浏览器无法创建导出画布');
      // This is miniPaint's documented layer rendering API, not a custom editor engine.
      child.Layers.convert_layers_to_canvas(ctx);
      const blob = await new Promise((resolve, reject) =>
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('导出 PNG 失败')), 'image/png'));
      if (id !== openId || !dialog.open) return;
      if (blob.type !== 'image/png' || blob.size < 30) throw new Error('编辑器没有生成有效 PNG');
      const name = originalFile.name.replace(/\.[^.]+$/, '') + '-已编辑.png';
      await onSave(blob, name);
      if (id === openId && dialog.open) dialog.close();
    } catch (error) {
      if (id === openId && dialog.open) message('保存失败：' + String(error.message || error).slice(0, 160), true);
    } finally {
      saving = false; controls();
    }
  }
  save.addEventListener('click', () => { void exportPng(); });
  byId('imageEditorClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', cleanup);
  window.WishImageEditor = {open};
})();