# River Editor Baseline — 2026-10-19

该快照对应本机当前运行的 River 编辑器版本：

`http://127.0.0.1:5174`

## 已确认的交互基线

- 标题、普通正文和小点是不同状态，标题不显示小点。
- `# ` 到 `###### ` 创建标题块。
- `- ` 创建小点；内容块也能恢复为小点。
- 小点后 Enter 自动建立下一级小点。
- 空小点 Enter 逐层向左退出；第一层取消小点后建立普通行。
- Tab / Shift+Tab 修改真实层级，光标留在当前条目。
- 空小点可以用 Backspace/Delete 取消；长按不会连续穿透多行。
- `/` 菜单可在正文任意位置打开，斜杠保留，支持键盘、鼠标和子菜单。
- 只有标题文字为蓝色；普通正文和小点为黑色；语义标记使用各自颜色。
- 没有整行深色悬停背景框。

## 当前验证

- Playwright：79/79 通过。
- Vitest：24/24 通过。
- TypeScript 与生产构建通过。
- Safari 18.6 真实浏览器测试通过。

## 关键源码

- `src/editor/OutlineEditor.tsx`
- `src/editor/extensions.tsx`
- `src/editor/commands.ts`
- `src/editor/convert.ts`
- `src/editor/semanticMarkers.ts`
- `src/editor/snapshotCache.ts`
- `src/editor/editorFlush.ts`
- `src/styles/app.css`
- `src/types.ts`
- `src/store/useAppStore.ts`

## 启动

```bash
pnpm install --frozen-lockfile
pnpm dev
```

基础编辑器不需要 API Key。
