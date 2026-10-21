# River v0.1

River 是一个浏览器端 AI 学习应用，实现：

`上传课件 → 学习三问 → 学习开场 → 结构化知识树 → 自由编辑 → AI 局部帮助 → 自动保存 → 备份恢复`

## 运行地址

- 开发地址：`http://127.0.0.1:5174/`
- 本机生产地址：`http://127.0.0.1:8790/`
- 临时 HTTPS 地址：`https://surrey-mines-joseph-care.trycloudflare.com`

临时 HTTPS 来自 Cloudflare quick tunnel，适合几位朋友试用，不是长期稳定部署。

## 启动方式

```bash
export PATH=/Users/river/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH
cd /Users/river/Documents/Codex/2026-08-24/hi/river-v0.1
pnpm install
pnpm dev
```

生产构建：

```bash
pnpm build
PORT=8790 NODE_ENV=production pnpm start
```

## 文档

- `RIVER_V0.1_IMPLEMENTATION_PLAN.md`
- `RIVER_V0.1_ARCHITECTURE.md`
- `RIVER_V0.1_FEATURE_STATUS.md`
- `RIVER_V0.1_TEST_REPORT.md`
- `RIVER_V0.1_USER_GUIDE.md`
- `RIVER_V0.1_SCREENSHOTS.md`
- `RIVER_V0.1_DEEPSEEK_EFFIE_UPDATE.md`（本次 DeepSeek 双模型与 Effie 可编辑大纲改造）
- `RIVER_V0.1_OPENCODE_GO_CC_SWITCH.md`（OpenCode Go 与本机 cc-switch 安全接入）
- `RIVER_V0.1_SAFARI_UPLOAD_FIX.md`（Safari 课件上传兼容修复）

## 关键安全设计

- 每位用户使用自己的 OpenAI 或卡扣 AI API Key。
- 手动输入的 API Key 只保存在当前页面内存中。
- OpenCode Go 可选本机 cc-switch 模式，由 River 后端临时读取，Key 不返回浏览器。
- Key 不写入源码、Git、URL、日志、localStorage 或 IndexedDB。
- 后端只在当前请求中使用 Key。
- 备份文件不包含 API Key。

## AI 模型

- OpenAI：`gpt-6-luna`
- DeepSeek：`deepseek-v4.1-flash`，显示名为 DeepSeek V4.1 Flash，请求通过卡扣 AI `https://api.kakouai.com`
- OpenCode Go：默认 `deepseek-v4.1-flash`，Base URL 为 `https://opencode.ai/zen/go/v1`
- 供应商使用各自独立的 API Key，切换后后续 AI 请求真实使用当前供应商。
- OpenCode Go 的本机 cc-switch 模式会被 Cloudflare 公网请求拒绝。
- 如果 Key 没有对应模型权限，River 显示真实错误，不会静默换模型。

## 编辑器

- 文件管理界面右栏和独立笔记页共用同一个 Tiptap/ProseMirror 可编辑大纲编辑器。
- 支持 Enter、Tab、Shift+Tab、折叠、复制粘贴、撤销重做和语义标记。
- 支持应用内专注模式，不重建编辑器，不丢失当前笔记和撤销记录。

## 当前限制

- 没有用户 API Key 的情况下，无法完成真实 GPT-6 Luna 生成测试。
- Safari 未在本环境中自动化验证。
- 扫描版/图片型 PDF 只做检测和提示，v0.1 不保证视觉解析。
- 原生拖拽排序、收藏夹、最近使用、完整涂鸦和云端同步属于后续版本。
