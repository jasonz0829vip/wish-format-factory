'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('Office preview reuses own Windows PDF conversion and existing PDF.js renderer',()=>{
 const app=read('app.js'),preview=read('pdf-preview.js'),css=read('style.css');
 assert.match(app,/async function previewOfficeFile\(/);
 assert.match(app,/await convertByWindows\(\{target:'pdf',source:'office',op:'office_convert'\},\[file\]\)/);
 assert.match(app,/header!=='%PDF-'/);
 assert.match(app,/readOnlyNote:/);
 assert.match(app,/WishPdfPreview\.open\(preview,\{sourceName:file\.name,readOnlyNote:/);
 assert.match(preview,/callbacks\.readOnlyNote \|\|/);
 assert.match(css,/\.officePreviewFileButton/);
 assert.doesNotThrow(()=>new vm.Script(app,{filename:'app.js'}));
});
test('Office preview excludes macros and never changes the uploaded Office object',()=>{
 const app=read('app.js');
 assert.match(app,/officeExt\.has\(ext\(f\)\)&&window\.WishFormats\.canConvert\(f\.name,'pdf'\)/);
 assert.match(app,/文件暂限|预览目前限/);
 const block=app.slice(app.indexOf('async function previewOfficeFile('),app.indexOf('function updateFiles(next)'));
 assert.doesNotMatch(block,/\.write\(|FileWriter|localStorage\.setItem|\/api\/save|fetch\(/);
 assert.match(block,/new File\(\[rendered\.blob\]/);
});
