'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),formats=require(path.join(root,'formats.js'));
const context={window:{WishFormats:formats}};
vm.runInNewContext(fs.readFileSync(path.join(root,'planner.js'),'utf8'),context,{timeout:2500});
const plan=context.window.WishPlanner.intent;
const cases=[
 ['sample.docx','转成 ODT','office_convert','odt'],
 ['sample.docx','转成 RTF','office_convert','rtf'],
 ['sample.docx','转成 HTML','office_convert','html'],
 ['sample.xlsx','转成 CSV','office_convert','csv'],
 ['sample.xlsx','转成 ODS','office_convert','ods'],
 ['sample.pptx','转成 ODP','office_convert','odp'],
 ['sample.pptx','转成 PDF','office_convert','pdf'],
 ['sample.pdf','PDF 表格转成 Excel','pdf_tables_to_xlsx','xlsx'],
 ['sample.pdf','转成 DOCX','pdf_to_docx','docx'],
 ['sample.pdf','把 PDF 转成 Word','pdf_to_docx','docx'],
 ['sample.docx','提取倒数第二页保存为 PDF','office_pages','pdf'],
 ['sample.zip','解压里面的文件','archive_unpack','zip'],
 ['sample.zip','把里面的文件转换成 PDF','archive_convert','pdf'],
 ['sample.rar','解压看看里面','archive_unpack','zip'],
 ['sample.md','转成 Word','text_convert','docx'],
 ['sample.m4v','转成 MP3','media_browser','mp3'],
 ['sample.mov','转成 MP4','media_server','mp4'],
 ['sample.pdf','删除第六页','pdf_delete','pdf'],
 ['sample.pdf','删第六页','pdf_delete','pdf'],
 ['sample.pdf','删前六页','pdf_delete','pdf'],
 ['sample.pdf','删六页','choice',null],
 ['sample.docx','删除第六页','reject',null],
 ['sample.docx','合并两份Word','reject',null],
 ['sample.xlsx','转成 DOCX','reject',null],
 ['sample.docm','转成 PDF','reject',null],
 ['sample.xmind','导出成 Markdown','xmind','markdown'],
 ['sample.png','识别图片上的文字','choice',null],
 ['sample.pdf','第六页单独导出','pdf_pages','pdf'],
 ['sample.exe','转成 PDF','reject',null]
];
test('registered input extensions are unique and cover at least 73',()=>{
 assert.ok(formats.recognised.length>=73);
 assert.equal(new Set(formats.recognised).size,formats.recognised.length);
 for(const ext of formats.recognised)assert.ok(formats.category(ext),ext);
 for(const ext of ['docm','xlsm','pptm','potm'])assert.equal(formats.canConvert('file.'+ext,'pdf'),false);
});
for(const [file,phrase,expectedOp,target]of cases){
 test(file+' · '+phrase,()=>{
  const actual=plan(phrase,[{name:file}]);
  if(expectedOp==='reject'){assert.equal(actual.ok,false);assert.ok(!actual.needsChoice);return;}
  if(expectedOp==='choice'){
   assert.equal(actual.needsChoice,true);
   if(phrase==='删六页'){assert.ok(actual.options?.every(x=>x.label.includes('删除')));}
   return;
  }
  assert.equal(actual.ok,true,JSON.stringify(actual));
  assert.equal(actual.op,expectedOp);
  assert.equal(actual.target,target);
  if(phrase==='提取倒数第二页保存为 PDF')assert.equal(actual.fromEnd,2);
 }
 );
}
