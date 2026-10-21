# River v0.1 Independent Test Build

构建时间：2026-10-19 14:37:53 CST

## 运行环境

- macOS 15.6 arm64（本次实际运行环境）
- Node.js 24.19.0
- pnpm 11.25.0
- Chromium 内核浏览器，推荐当前版 Microsoft Edge 或 Google Chrome

## 本地启动

```bash
cd river-v0.1
pnpm install --frozen-lockfile
pnpm dev
```

打开：

```text
http://127.0.0.1:5174
```

生产构建：

```bash
pnpm build
NODE_ENV=production PORT=8790 pnpm start
```

## 环境变量

基础编辑器测试不需要任何环境变量或 API Key。

可选变量名：

- `PORT`
- `NODE_ENV`

AI Key 不通过环境变量注入，也不应写入源码或 ZIP。测试基础编辑功能时请保持当前浏览器未配置 Key 的状态。

## 本包不包含

- `node_modules`
- `.env` 或任何密钥文件
- 浏览器 IndexedDB 用户数据
- 运行录像

## 已知状态

- `# ` 至 `###### ` 标题：当前代码已实现。
- `- ` 无序小点：当前代码已实现。
- `/` 快捷菜单：已实现。可在正文任意位置触发；保留斜杠本身，并提供 AI/标题/列表/文字样式/引用/对齐/插入内容分区、方向键导航、回车执行、Esc 关闭和子菜单。
- 标题与普通正文不再强制显示小点；`- ` 才建立小点。标题和列表标记互斥。
- 空小点支持逐层 Enter 退出，并在第一层取消小点；Backspace/Delete 可清除空小点和空行。
- Enter、折叠和子树拖动：当前版本已有实现与自动化回归覆盖。

