# River v0.1 - Safari 课件上传崩溃修复

日期：2026-10-16

## 现象

另一台设备使用 Safari 打开 River 后，可以验证 OpenCode Go API Key，但上传课件时 Safari 显示：

```text
Safari浏览器无法打开页面
错误是：“未能完成该操作。操作不被允许”
（NSPOSIXErrorDomain:1）
```

## 原因判断

这是 WebKit 对文件型 Blob 和本地文件权限的处理问题，不是 OpenCode Go API Key 失效。

原实现有两个风险点：

1. PDF 和 PPTX 直接调用 `File.arrayBuffer()` 读取用户选中的文件。
2. 解析后直接保存原始 `File` 对象到 IndexedDB。

Safari 对来自 iCloud Drive、文件 App 或安全作用域 URL 的文件，可能在上述操作中抛出 `NSPOSIXErrorDomain:1`。解析失败后的异常还可能造成整页中断，而不是显示 River 内的错误提示。

## 修复内容

- 课件读取改为优先使用 `FileReader.readAsArrayBuffer()`。
- 保留 `Blob.arrayBuffer()` 只作为不支持 FileReader 环境的后备方案。
- 文件读取完成后复制为普通内存 `Blob`，不再把原始 `File` 引用保存到 IndexedDB。
- PDF 与 PPTX 解析器改为接收已经读取完成的 `ArrayBuffer`。
- IndexedDB 无法保存原始附件时自动降级，只保存提取出的课件文字，不阻断整个上传流程。
- 上传链路增加最外层错误捕获，失败时清理生成状态并显示 River 错误提示。

## 影响范围

- 课件文字解析结果不变。
- PDF 页数、PPTX 幻灯片和来源信息不变。
- 备份仍可保存不超过 5 MB 的原始附件；浏览器不允许时标记为附件已省略。
- 已存在的课件数据不受影响。

## 验证

- TypeScript 检查通过。
- 生产构建通过。
- 自动测试：4 个文件，11 项测试全部通过。
- 本机生产页面实际加载并解析已有 PDF：44 页、16867 字符、状态 `parsed`。

## 需要复测

当前环境无法远程控制用户那台 Safari 设备。请在原设备重新打开最新版页面并重新选择课件。如果 Safari 仍然在系统层面弹“操作不被允许”，请提供：

- Safari 版本。
- 出问题的文件格式和来源位置，例如“文件 App / iCloud Drive / 下载”。
- 选择文件后 River 页面是否完全跳转到错误页，还是停留在应用内。

修复后的地址：

`https://surrey-mines-joseph-care.trycloudflare.com`

