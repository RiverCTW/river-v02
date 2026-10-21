# River v0.1 DeepSeek 与 Effie 编辑器修改说明

修改日期：2026-10-14

本文件记录这次实际修改、运行结果、验证证据和未完成项。它不是设计提案，对应代码已经进入 River v0.1 的真实应用。

## 1. 运行地址

- 开发地址：`http://127.0.0.1:5174/`
- 本机生产地址：`http://127.0.0.1:8790/`
- 临时 HTTPS 地址：`https://surrey-mines-joseph-care.trycloudflare.com`

## 2. DeepSeek V4.1 Flash 接入

River 现在可以在设置中切换：

| 供应商 | 模型显示名 | API Model ID | Base URL |
| --- | --- | --- | --- |
| OpenAI | GPT-6 Luna | `gpt-6-luna` | OpenAI 默认 |
| DeepSeek（卡扣 AI） | DeepSeek V4.1 Flash | `deepseek-v4.1-flash` | `https://api.kakouai.com` |

### 配置方式

1. 点击右上角“设置 / API Key”。
2. 选择“DeepSeek - V4.1 Flash”。
3. 输入个人 DeepSeek API Key。
4. 确认模型标识是 `deepseek-v4.1-flash`。
5. 点击“验证当前 Key”。
6. 验证成功后点击“保存设置”。

OpenAI 和 DeepSeek Key 分开保存，只存在当前页面内存中。Key 不写入 IndexedDB、localStorage、URL、源码、日志或备份文件。每次 AI 请求由后端临时转发，后端不持久化 Key。

### Provider Adapter

- OpenAI 使用 Responses API、Structured Outputs 和 `zodTextFormat`。
- DeepSeek 使用 OpenAI 兼容的 `/chat/completions`。
- DeepSeek 请求使用 `response_format: { type: "json_object" }`。
- DeepSeek 请求使用 `thinking: { type: "enabled" }` 和 `reasoning_effort`。
- River 的业务 Schema 完全共用：学习开场、知识树、重新生成、说人话、进一步展开。
- DeepSeek 返回结果先解析 JSON，再通过 Zod 校验；校验失败会带错误原因自动重试一次。
- 两种模型统一记录输入、输出、缓存输入、费用和币种。DeepSeek 费用按人民币记录。
- 长课件进入模型前使用有上限的内容压缩，中间省略内容时保留开头和结尾，并明确写入省略提示。

### 卡扣 AI 已验证内容

已完成的协议与代码验证：

- 请求确实访问 `https://api.kakouai.com` 对应的 `/chat/completions`。
- 请求体包含 `deepseek-v4.1-flash`、JSON 模式和 DeepSeek thinking 参数。
- API Key 使用 `Authorization: Bearer ...` 发送。
- JSON 不符合 River Schema 时自动重试一次。
- `/api/ai/simplify` 的供应商、Key、模型和结果能够端到端穿过 Express 路由。
- DeepSeek 用量按 CNY 计算。

2026-10-15 已使用用户提供的卡扣 AI Key 完成真实调用：

- 真实 Key 验证成功，返回模型 `deepseek-v4.1-flash`。
- 真实“说人话”成功。
- 真实“重新生成同一层级”成功，并返回了不同的例子和理解路径。
- 真实“进一步展开”成功，生成了深入解释和多个子知识点。
- 真实学习开场成功。
- 真实完整知识树成功，结构化结果通过 River Schema 校验。
- River 记录到的这些调用估算合计约 `¥0.123486`；这是 River 按 token 估算的数值，不等于卡扣 AI 最终账单。

真实 PPTX/PDF 文件从浏览器上传后再直接调用模型，仍建议在后续验收中补跑一轮。Key 只保存在当前页面内存中，刷新后需要重新输入。

## 3. 可编辑大纲编辑器

文件管理界面右侧不再使用只读预览，而是和独立笔记页共用同一个 Tiptap/ProseMirror 编辑器。

两种入口共享：

- 同一个 `OutlineEditor` 组件。
- 同一套知识节点和内容块数据。
- 同一套键盘命令。
- 同一套语义标记。
- 同一套保存队列。

无论笔记来自手动新建、旧数据、导入备份还是 AI 生成，只要进入右侧或独立笔记页，都使用相同的可编辑数据。

### 编辑器能力

- 直接点击并修改文字。
- 鼠标选择、替换、删除、复制、剪切、粘贴。
- Enter 新建同级条目。
- Tab 真正改变父子层级。
- Shift+Tab 真正提升层级。
- 顶部条目不会因 Shift+Tab 被提升成列表外普通段落。
- 左侧圆点或箭头折叠、展开。
- H1、H2、正文层级。
- 定义、解释、例子、补充、公式、我的理解、易错点、来源。
- `**文字**` 和 `++文字++` 粉色重点。
- `*文字*` 金色斜体。
- `~~文字~~` 灰色删除线。
- 中文、英文和中英混合输入。
- 撤销、重做、复制、剪切、粘贴。

### Effie 对照表

| Effie 观察项 | River 状态 | 说明 |
| --- | --- | --- |
| 连续文字编辑 | 已实现并实测 | 直接编辑，不是弹窗表单 |
| Enter 新增条目 | 已实现并实测 | 捕获阶段处理，避免 ProseMirror 双重执行 |
| Tab 缩进 | 已实现并实测 | 改变真实列表结构 |
| Shift+Tab 提升 | 已实现并实测 | 子层回到父层；顶层不会逃出大纲 |
| 折叠和展开 | 已实现并实测 | 只改变显示状态，不删除内容 |
| 左侧圆点和层级引导线 | 已实现 | 视觉参考 Effie，同时保留 River 内容结构 |
| H1/H2 | 已实现 | 右栏和独立编辑页命令一致 |
| 复制、剪切、粘贴 | 已实现并实测 | 剪贴板内容可读回 |
| 撤销、重做 | 已实现并实测 | 小范围插入可撤销并重新执行 |
| 多行选择 | 依赖成熟编辑器能力，已实现 | 本轮未单独记录每条 Shift+方向键结果 |
| 多条目批量缩进 | 命令可在多条目选区执行 | 尚未完成独立 E2E 证据 |
| 中文输入法中间态 | 已做 `isComposing` 和 keyCode 229 保护 | 尚未用真实 macOS 中文输入法逐候选词截图验证 |
| 右键菜单 | 使用浏览器原生文本菜单 | 尚未实现 Effie 风格自定义右键菜单 |
| 公式和内容块 | 已保留 River 类型 | 以可编辑大纲条目呈现 |

### 键盘快捷键

| 快捷键 | 行为 |
| --- | --- |
| `Enter` | 新建同级条目 |
| `Shift + Enter` | 在当前条目内换行 |
| `Tab` | 缩进一级 |
| `Shift + Tab` | 提升一级，顶层保持在大纲内 |
| `Backspace` | 删除文字；空节点交给 ProseMirror 安全处理 |
| `Delete` | 删除选中内容 |
| `Cmd + A` | 全选当前文稿 |
| `Cmd + C` | 复制 |
| `Cmd + X` | 剪切 |
| `Cmd + V` | 粘贴 |
| `Cmd + Z` | 撤销 |
| `Cmd + Shift + Z` | 重做 |
| 方向键 | 移动光标 |
| `Shift + 方向键` | 扩展选区 |
| `Esc` | 专注模式中退出专注 |

## 4. 专注模式

右侧编辑区顶部有“专注”按钮。进入后：

- 隐藏左侧文件夹栏。
- 隐藏中间笔记卡片栏。
- 保留当前编辑器和当前笔记。
- 编辑器画布扩展到完整应用内容区域。
- 正文仍限制在舒适阅读宽度。

退出方式：

1. 点击“恢复布局”。
2. 在编辑器中按 `Esc`。

专注模式是应用内布局切换，不触发 macOS 浏览器全屏，也不会重新创建笔记或重建编辑器。进入、编辑、退出都使用同一个编辑器实例。

## 5. 保存与数据安全

- 编辑器改动会合并成一次保存任务，不因快速键入持续重建组件。
- 保存任务使用串行队列，后一次写入不会越过前一次。
- 从右栏进入独立笔记页前会先 flush 当前编辑器，避免读取旧数据。
- 刷新页面后实测恢复修改和层级。
- 节点和内容块保留 ID、父子关系、顺序、来源、创建时间、更新时间和用户修改标记。
- 备份往返测试保留层级、内容类型、语义文字和来源信息。
- 旧笔记不需要清空或迁移后重建。

## 6. 测试结果

自动测试：

```text
Test Files  4 passed (4)
Tests       11 passed (11)
```

生产构建：

```text
pnpm build: passed
```

构建只保留 Vite 的大包提示，主包约 803 KB，未阻塞生产运行。

覆盖内容：

- 卡扣 AI 模型 ID、Base URL、JSON 模式、thinking 参数和鉴权头。
- DeepSeek/OpenAI 共用的 Chat Completions 路径。
- DeepSeek JSON Schema 校验失败后的单次重试。
- DeepSeek Key 验证的 `/models` 请求。
- DeepSeek CNY 用量计算。
- Express 路由中的供应商、Key、模型和响应传递。
- River 节点和内容块的 Tiptap 往返转换。
- 文档级普通段落不会被误转换成知识节点。
- 备份导出和恢复保留大纲元数据。

实际浏览器验证：

- Effie 风格右栏直接编辑。
- Notability 风格右栏直接编辑。
- 独立笔记页编辑。
- 右栏和独立笔记页读取同一份内容。
- Enter、Tab、Shift+Tab。
- 顶层 Shift+Tab 保护。
- 复制、剪切、撤销、重做。
- 进入专注模式、在专注模式中编辑、Esc 退出。
- 刷新后内容恢复。
- 编辑后立即进入独立笔记页不再丢最后改动。

本轮实际截图：

- `screenshots/v0.1-effie-editable-right.png`
- `screenshots/v0.1-notability-editable-right.png`
- `screenshots/v0.1-right-editor-focus.png`

## 7. 已知问题与未验证项

- 卡扣 AI 的真实 DeepSeek 工作流已经跑通；OpenAI GPT-6 Luna 仍未使用真实 Key 验证。
- 还没有用真实 macOS 中文输入法完成候选词回车的逐项自动验证；代码已经阻止 composition 阶段的 Enter 进入节点命令。
- 多条目选区已经交给 ProseMirror 的列表命令处理，但没有单独完成多条目批量缩进的 E2E 截图。
- 还没有实现 Effie 风格的自定义右键菜单。
- 公式目前作为可编辑文本条目保留，不是排版级公式编辑器。
- Safari 未验证。
- Cloudflare quick tunnel 只适合临时访问，不是长期稳定部署。

## 8. 本次修改涉及的源码

- `server/ai.ts`
- `server/index.ts`
- `src/services/aiClient.ts`
- `src/types.ts`
- `src/store/useAppStore.ts`
- `src/components/SettingsModal.tsx`
- `src/components/KnowledgeEditor.tsx`
- `src/components/LibraryView.tsx`
- `src/components/IconSprite.tsx`
- `src/editor/OutlineEditor.tsx`
- `src/editor/extensions.tsx`
- `src/editor/convert.ts`
- `src/styles/app.css`
- `tests/provider.test.ts`
- `tests/provider-route.test.ts`
- `tests/editor-convert.test.ts`
- `tests/backup-roundtrip.test.ts`

依赖文件：

- `package.json`
- `pnpm-lock.yaml`
