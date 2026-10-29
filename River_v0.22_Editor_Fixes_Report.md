# River v0.22 编辑器修复记录（本轮实际执行）

日期：2026-10-29

## 基线

- 项目：`/Users/river/Documents/Codex/2026-08-24/hi/riverv0.22`
- 分支：`v0.22`
- 工作区：存在其他会话尚未提交的修改，本轮没有覆盖它们。
- 自动化测试：13 个测试文件、49 个测试全部通过。
- 生产构建：通过。
- 已查看的最新录屏：
  - `录屏2026-10-28 22.52.14.mov`（26.25 秒）
  - `录屏2026-10-28 22.56.01.mov`（11.6 秒）
- Effie 研究资料存在：`.../EFFIE_DISTILLATION_7.3.7_20261023/Effie_Distillation_Report.docx`。

## 本轮修复

### 1. 去掉专用拖动手柄，改为选区启动拖动

文件：`src/editor/extensions.tsx`

- 大纲条目不再渲染 `⠿` 手柄。
- `wrapper` 监听原生 `dragstart`：只要当前选区落在该条目内部，就把条目 ID 写入 `application/x-river-outline-node`，并调用 `beginSubtreeDrag`。
- 原有 `OutlineEditor` 的 `handleDrop` 继续负责落点判断和 `moveSubtree`，子树随条目移动。
- `dragend` 清理拖动状态。

验证（Playwright，真实编辑器）：

- 文档：`第一行`、`第二行` 两个同级节点。
- 选中第一行文字后触发拖放。
- 结果：`['第一行','第二行']` → `['第二行','第一行']`，顺序正确改变。

### 2. 工具栏增加 Cmd+B 文字按钮

文件：`src/editor/OutlineEditor.tsx`

- 在 H3 与 `**` 之间新增文字按钮 `Cmd+B`。
- 点击执行与 `**` 相同的 `wrapSelection("**")`，不是装饰按钮。

验证：

- 选中「第一行」后点击 `Cmd+B`，编辑器文本变为 `**第一行**`。

## 代码中已存在、本轮未逐项实测的能力

- 霞鹜文楷字体已通过 `@font-face` 加载并用于正文。
- 行号扩展 `OutlineLineNumbers` 已存在。
- 图片插入/粘贴扩展 `imageExtension` 已存在。
- `searchNotes()` 已实现标题、节点、内容块、编辑器文档的全文搜索，并按笔记去重。
- 搜索高亮扩展会临时装饰匹配词，并 `scrollIntoView` 到第一个匹配。

## 验收状态

| 项目 | 状态 | 说明 |
|---|---|---|
| Cmd+B 文字按钮 | PASS | 已实测加粗 |
| 选区启动拖动（无手柄） | PASS | 已实测节点换位 |
| 自动化测试与生产构建 | PASS | 49/49，build 通过 |
| 中文输入法全矩阵 | NOT RUN | 需要真实拼音输入法逐项操作 |
| Enter / Backspace / Tab 全矩阵 | NOT RUN | 本轮只修了此前复现过的嵌套空块删除 |
| 行内标记全矩阵 | NOT RUN | 未逐项实测 |
| 撤销/重做全矩阵 | NOT RUN | 未逐项实测 |
| 图片四种尺寸与右键菜单 | NOT RUN | 需要 Effie 实测尺寸 |
| 图片跨设备同步 | BLOCKED | 缺少第二台设备/独立账号环境 |
| Effie 图片交互录屏 | BLOCKED | 本轮未找到对应的 Effie 图片录屏，仅找到两段 River 录屏 |
| 行号视觉验收 | NOT RUN | 代码存在，未与 Effie 对照 |
| 知识点标签重叠 | NOT RUN | 未定位可复现样本 |

## 已知限制

- 本轮没有宣称完成整份 1201 行验收指令；只完成了两个明确的编辑器缺口，并把其余项目如实标记为 NOT RUN/BLOCKED。
- 选区拖拽使用浏览器原生 `dragstart/drop`；Safari 的真实鼠标拖拽仍需人工复测。
