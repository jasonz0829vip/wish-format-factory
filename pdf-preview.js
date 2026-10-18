/* 基于现有 Mozilla PDF.js，PDF 离线可视化阅读。修改页码继续使用现有 pdf-lib。 */
(function () {
  'use strict';
  const dialog = document.getElementById('pdfPreviewDialog');
  if (!dialog) return;
  const el = id => document.getElementById(id);
  const canvas = el('pdfPreviewCanvas');
  const status = el('pdfPreviewStatus');
  const previous = el('pdfPreviewPrevious');
  const next = el('pdfPreviewNext');
  const zoomOut = el('pdfPreviewZoomOut');
  const zoomIn = el('pdfPreviewZoomIn');
  const deletePage = el('pdfPreviewDelete');
  const actionSeparator = el('pdfPreviewActionSeparator');
  const footnote = el('pdfPreviewFootnote');
  const extractPage = el('pdfPreviewExtract');
  const label = el('pdfPreviewPage');
  const zoomLabel = el('pdfPreviewZoomValue');
  let documentRef = null, loadingTask = null, renderTask = null;
  let currentFile = null, callbacks = {};
  let pageNo = 1, zoom = 1, openingId = 0, renderId = 0, actionBusy = false;

  function announce(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('pdfPreviewError', isError);
  }

  function refresh() {
    const total = documentRef ? documentRef.numPages : 0;
    label.textContent = total ? '第 ' + pageNo + ' / ' + total + ' 页' : '正在打开…';
    zoomLabel.textContent = Math.round(zoom * 100) + '%';
    previous.disabled = actionBusy || !total || pageNo <= 1;
    next.disabled = actionBusy || !total || pageNo >= total;
    zoomOut.disabled = actionBusy || !total || zoom <= .6;
    zoomIn.disabled = actionBusy || !total || zoom >= 2;
    deletePage.disabled = actionBusy || total <= 1 || typeof callbacks.onDelete !== 'function';
    extractPage.disabled = actionBusy || !total || typeof callbacks.onExtract !== 'function';
  }

  async function dispose() {
    const disposalToken = ++renderId;
    const running = renderTask;
    renderTask = null;
    if (running) {
      try { running.cancel(); await running.promise; } catch (_) { /* render cancellation */ }
    }
    const oldLoading = loadingTask, oldDocument = documentRef;
    loadingTask = null;
    documentRef = null;
    if (oldLoading) { try { await oldLoading.destroy(); } catch (_) { /* already closed */ } }
    if (oldDocument) { try { await oldDocument.destroy(); } catch (_) { /* already closed */ } }
    // A newer preview may already have opened while an old render was shutting down.
    // Never clear the newer session's canvas after a stale asynchronous cleanup.
    if (disposalToken === renderId) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 1;
      canvas.height = 1;
    }
  }

  async function paint(target) {
    const renderToken = ++renderId;
    const old = renderTask;
    renderTask = null;
    if (old) { try { old.cancel(); await old.promise; } catch (_) { /* canceled */ } }
    if (!documentRef || renderToken !== renderId || !dialog.open) return;
    const nextPage = Math.max(1, Math.min(documentRef.numPages, target));
    pageNo = nextPage;
    refresh();
    announce('正在渲染第 ' + nextPage + ' 页…');
    let page = null;
    try {
      page = await documentRef.getPage(nextPage);
      if (renderToken !== renderId || !dialog.open) return;
      const unscaled = page.getViewport({scale: 1});
      const availableWidth = Math.max(220, Math.min(900, dialog.clientWidth - 50));
      const fitScale = Math.min(1.6, Math.max(.25, availableWidth / unscaled.width));
      const cssScale = fitScale * zoom;
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2,
        2400 / (unscaled.width * cssScale), 2900 / (unscaled.height * cssScale)));
      const viewport = page.getViewport({scale: cssScale * dpr});
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = Math.ceil(unscaled.width * cssScale) + 'px';
      canvas.style.height = Math.ceil(unscaled.height * cssScale) + 'px';
      const ctx = canvas.getContext('2d', {alpha: false});
      if (!ctx) throw new Error('设备无法创建 PDF 预览画布');
      const task = page.render({canvasContext: ctx, viewport, background: 'white'});
      renderTask = task;
      await task.promise;
      if (renderToken === renderId && dialog.open) announce(callbacks.readOnlyNote || 'PDF 在本机浏览器中预览，尚未修改原件。');
      if (renderTask === task) renderTask = null;
    } catch (error) {
      if (renderToken === renderId) announce('页面渲染失败：' + String(error.message || error).slice(0, 160), true);
    } finally {
      if (page) { try { page.cleanup(); } catch (_) { /* page already released */ } }
    }
  }

  async function open(file, handlers = {}) {
    if (!file || !/\.pdf$/i.test(file.name)) throw new Error('请选择一个 PDF 文件');
    const opening = ++openingId;
    currentFile = file;
    callbacks = handlers;
    pageNo = 1;
    zoom = 1;
    actionBusy = false;
    const officeMode = !!handlers.readOnlyNote;
    const title = officeMode ? '文档只读预览' : 'PDF 页面预览';
    el('pdfPreviewTitle').textContent = title;
    el('pdfPreviewFilename').textContent = handlers.sourceName || file.name;
    dialog.setAttribute('aria-label', title);
    extractPage.hidden = officeMode;
    deletePage.hidden = officeMode;
    actionSeparator.hidden = officeMode;
    footnote.hidden = officeMode;
    if (!dialog.open) dialog.showModal();
    refresh();
    announce('正在读取 PDF…');
    await dispose();
    if (opening !== openingId || !dialog.open) return;
    if (file.size > 50 * 1024 * 1024) {
      announce('此预览窗口最多处理 50MB PDF；原有格式转换功能不受影响。', true);
      return;
    }
    try {
      const pdfjs = await import('./vendor/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', document.baseURI).href;
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (opening !== openingId || !dialog.open) return;
      loadingTask = pdfjs.getDocument({data: bytes, isEvalSupported: false, useSystemFonts: true});
      const loaded = await loadingTask.promise;
      if (opening !== openingId || !dialog.open) {
        await loaded.destroy();
        return;
      }
      documentRef = loaded;
      await paint(1);
    } catch (error) {
      if (opening === openingId) announce('无法预览此 PDF：' + String(error.message || error).slice(0, 180), true);
    } finally {
      refresh();
    }
  }

  async function act(kind) {
    if (actionBusy || !documentRef || !currentFile) return;
    const operation = kind === 'delete' ? callbacks.onDelete : callbacks.onExtract;
    if (typeof operation !== 'function') return;
    actionBusy = true;
    refresh();
    announce(kind === 'delete' ? '正在生成删除当前页后的新 PDF…' : '正在提取当前页…');
    try {
      await operation(pageNo);
      if (dialog.open) dialog.close();
    } catch (error) {
      announce('操作失败：' + String(error.message || error).slice(0, 180), true);
    } finally {
      actionBusy = false;
      refresh();
    }
  }

  previous.addEventListener('click', () => { if (documentRef && pageNo > 1) void paint(pageNo - 1); });
  next.addEventListener('click', () => { if (documentRef && pageNo < documentRef.numPages) void paint(pageNo + 1); });
  zoomOut.addEventListener('click', () => { zoom = Math.max(.6, Math.round((zoom - .2) * 10) / 10); void paint(pageNo); });
  zoomIn.addEventListener('click', () => { zoom = Math.min(2, Math.round((zoom + .2) * 10) / 10); void paint(pageNo); });
  deletePage.addEventListener('click', () => void act('delete'));
  extractPage.addEventListener('click', () => void act('extract'));
  el('pdfPreviewClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    // HTMLDialogElement fires "close" asynchronously; if another PDF was opened
    // immediately, this event belongs to the previous session.
    if (dialog.open) return;
    ++openingId;
    callbacks = {};
    currentFile = null;
    void dispose().catch(() => {});
  });
  dialog.addEventListener('keydown', event => {
    if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement) return;
    if (event.key === 'ArrowLeft' && documentRef && pageNo > 1) { event.preventDefault(); void paint(pageNo - 1); }
    if (event.key === 'ArrowRight' && documentRef && pageNo < documentRef.numPages) { event.preventDefault(); void paint(pageNo + 1); }
  });

  window.WishPdfPreview = {open};
})();