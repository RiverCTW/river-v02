# River v0.22.2：无边框笔记库与 Cmd+B 加粗

日期：2026-10-30

## 1. 无边框笔记库

移除主界面外层被标记的浪费区域：

- 移除 `.river-main-library` 的 14px 外边距。
- 移除 `.tmi-panel` 的 12px 内边距。
- 移除 `tmi-window` 外边框、9px 圆角和悬浮阴影。
- 外层高度固定为顶部栏以下的可用视口高度，笔记数再多也只滚动中间列表，不撑高整页。
- 保留三栏内部结构、笔记卡片、标题栏内容和所有操作。
- 合并并保留远端新的动态文件名签、真实文字宽度测量和选区拖动能力。

独立笔记页保持原布局，不受此改动影响。

## 2. Cmd+B 加粗

在 `H3` 与 `**` 之间新增文字按钮 `Cmd+B`，没有使用单独的 `B` 图标。

交互：

- 选中文字后点击 `Cmd+B`：加粗所选文字。
- 光标位于文字中且未选中内容时点击：启用当前行后续输入加粗。
- 键盘 `Cmd+B` 与按钮使用同一 Bold Mark。
- 再次点击取消当前输入加粗状态。
- 普通 Enter 创建下一行后自动取消存储的加粗状态，新行默认不加粗。
- Shift+Enter 保留软换行行为。
- 加粗状态在工具栏按钮上以选中样式和 `aria-pressed` 显示。
- 加粗 Mark 随编辑器 JSON 保存，重新打开笔记后保留。

## 验收

- Playwright Edge 全量：89/89。
- Playwright WebKit smoke：1/1。
- Playwright 双标签认证：1/1。
- Vitest：11 个文件，44/44。
- 验证无边框计算样式：主区 padding 0、面板 padding 0、边框 0、圆角 0、阴影 none。
- 验证笔记库填满顶部栏以下全部可用高度，不再留下底部空白。
- 验证按钮顺序：`正文 / H1 / H2 / H3 / Cmd+B / **`。
- 验证选区加粗、光标后续输入加粗、按钮再次关闭、Enter 自动取消、快捷键 `Cmd+B`。
- 验证 River 专用 Bold Mark 不注册 Markdown 星号输入规则，原有粉色 `**` 语义标记回归通过。
- TypeScript + Vite production build：通过。

## 生产验证

- URL：`https://river-v02.onrender.com`
- 页面版本：`River v0.22.2`
- 服务标识：`riverv0.22.2`
- 使用含 129 条笔记的 `测试-GJ` 账号验证：页面高度保持 900px，中间列表内部滚动。
- 主区、panel、window 均为 padding 0、border 0、radius 0、shadow none。
- 1440×900 无横向溢出，浏览器 console 无异常。
- 工具栏顺序确认：`正文 / H1 / H2 / H3 / Cmd+B / **`。
- Git 最终标签：`v0.22.2-final`
