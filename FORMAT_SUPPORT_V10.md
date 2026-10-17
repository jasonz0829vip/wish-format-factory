# 许愿格式工厂 v0.10：真实 XLSB 和 PDF 表格→Excel 验收

2026-10-18 · QLS 与 RTX3070 两台 Windows 本地机；复用现有 LibreOffice、PyMuPDF、openpyxl、PDF.js 等成熟组件，不引入云转换或新 AI 模型。

## 原生 XLSB 验收，不是简单改后缀

真实样本来自 Pandas 官方仓库 pandas/tests/io/data/excel/test1.xlsb / test1.xls / test1.ods，均通过官方 Git blob SHA 校验。在两台电脑各自的本地完整转换服务执行。

| 原生输入 | 输出 | QLS | RTX3070 | 实际校验 |
|---|---|---|---|---|
| XLSB（二进制工作簿） | PDF | 通过 | 通过 | 4 页 PDF |
| XLSB | XLSX | 通过 | 通过 | 4 工作表，OOXML 结构有效 |
| XLSB | CSV | 通过 | 通过 | 有真实表格数据，单工作表 |
| 旧版 XLS | PDF | 通过 | 通过 | 4 页 PDF |
| ODS | XLSX | 通过 | 通过 | 4 工作表 |

这是五条真实样本路径的验证，不保证全部复杂公式、宏、图表、外部链接和特殊格式均无损。带宏扩展名仍拒绝自动处理；把 XLSX 直接改名 XLSB 仍会因缺少真正 xl/workbook.bin 而拒绝。

## 新增 PDF 表格→可编辑 XLSX

- 引擎：已有 Python 3.12 离线环境中的 PyMuPDF 表格检测，openpyxl 构造可编辑 Excel。
- 正例：两页带边框 PDF，识别两张表，输出 2 个数据表 + 1 个“转换说明”工作表，金额与数量为可编辑数值。
- 正例：由真实 XLSB 导出的 PDF 可提取部分表格；在源 PDF 显示为 ### 的内容无法反推真实原值。
- 负例：无可辨识表格的普通段落 PDF 返回 422 错误，不生成假 Excel。
- QLS 与 RTX3070 的真实 HTTP 接口及浏览器页面分别通过测试，包含中文错误、保真说明以及页面无异常。

这是“检测到的 PDF 表格→Excel”，不是整份 PDF 无损转换。复杂合并单元格、无边框表格、公式、日期、非表格文字、图片和排版可能无法保留；扫描版 PDF 需要先 OCR。

保护限制：单 PDF 不超过 25MB、30 页、60 张表、12000 个单元格。无可靠表格则拒绝。输入不执行宏或外部代码；不将可疑字符串作为 Excel 公式执行，输出做 OOXML 结构检查。

## Windows、手机与许可证边界

- Windows 本地版可用；手机如连接用户自己的 Windows 引擎可借用。GitHub Pages 独立离线 PWA 不含 Python/OpenPyXL，不提供独立 PDF 表格→Excel。
- PyMuPDF 采用 AGPL-3.0 或商业许可，openpyxl 采用 MIT；第三方许可不能被项目上层 MIT 覆盖。
- 转换不需要运行本地 Qwen，空闲 AI 显存释放机制保持不变；文件不会交给第三方在线转换网站。
- v0.9 的 ZIP / 7Z / RAR 分组整理与异常保留功能继续有效；AI 多步规划仍暂停。
