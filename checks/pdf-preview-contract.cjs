'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
test('PDF preview module is valid JS and uses bundled PDF.js',()=>{
 const code=read('pdf-preview.js');
 assert.doesNotThrow(()=>new vm.Script(code,{filename:'pdf-preview.js'}));
 assert.match(code,/import\('\.\/vendor\/pdf\.min\.mjs'\)/);
 assert.match(code,/isEvalSupported:\s*false/);
 assert.match(code,/file\.arrayBuffer\(\)/);
 assert.match(code,/window\.WishPdfPreview\s*=\s*\{open\}/);
 assert.doesNotMatch(code,/https?:\/\/|fetch\(/);
});
test('preview is integrated after existing PDF module, offline cached, and offers page actions',()=>{
 const html=read('index.html'),app=read('app.js'),sw=read('sw.js');
 const pdfPos=html.indexOf('src="./pdf-extra.js"'),previewPos=html.indexOf('src="./pdf-preview.js"'),appPos=html.indexOf('src="./app.js"');
 assert.ok(pdfPos>=0&&previewPos>pdfPos&&appPos>previewPos);
 const ids=['pdfPreviewDialog','pdfPreviewFilename','pdfPreviewPrevious','pdfPreviewNext','pdfPreviewPage','pdfPreviewZoomIn','pdfPreviewZoomOut','pdfPreviewCanvas','pdfPreviewDelete','pdfPreviewExtract','pdfPreviewStatus','pdfPreviewTitle','pdfPreviewActionSeparator','pdfPreviewFootnote'];
 for(const id of ids)assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(app,/WishPdfPreview\.open\(f/);
 assert.match(app,/op:'pdf_delete'/);
 assert.match(app,/WishPdf\.extract\(f,\[page\]/);
 assert.match(sw,/'pdf-preview\.js'/);
 assert.match(sw,/wish-factory-static-v17/);
});
