# River v0.1 — Effie Editor Upgrade Report

日期：2026-10-17  
项目：`/Users/river/Documents/Codex/2026-08-24/hi/river-v0.1`

## 1. 交付结论

本轮没有重做 River，也没有用只读 Markdown 或演示页面冒充编辑器。现有项目已经完成一次可运行的编辑器内核升级，核心结果是：

- 手动笔记、历史知识树和 AI 生成知识树共用同一套 Tiptap / ProseMirror 文档内核。
- 编辑器正文可以真实键入、拆分节点、缩进、折叠、拖动、删除、撤销和重新载入。
- `**`、`*`、`::`、`++`、`~~` 和反引号的原始符号会保留，并在输入过程中实时改变样式。
- 新笔记不再出现额外的空知识点，空白文档、刷新恢复和多笔记隔离已经通过真实浏览器测试。
- River 原有的 Effie 风格与 Notability 风格笔记库布局没有被替换。
- 右侧编辑器在独立笔记页和笔记库内嵌编辑区都可以进入专注编辑状态。

本轮没有宣布与 Effie 的完整 1:1 视觉或行为等价。状态分为“已完成并验证”“功能可用但尚未与 Effie 逐帧对照”“尚未覆盖”，详见后文。

## 2. 原有架构

项目原有技术栈为：

- React 19 + TypeScript + Vite。
- Zustand 管理应用状态。
- IndexedDB / Dexie 保存笔记、节点、内容块、来源、学习画像和 AI 请求记录。
- Express 服务负责 AI 请求和中转。
- 原有编辑器已经基于 Tiptap / ProseMirror，而不是 textarea。
- 笔记库已有 Effie 风格和 Notability 风格两套主界面。

因此本轮选择继续扩充现有 Tiptap 内核，而不是迁移到另一套编辑器。

## 3. 安全与恢复点

修改前已有的源码备份位于：

`/Users/river/Documents/Codex/2026-08-24/hi/work/backups/river-v0.1-before-editor-upgrade-20261016-231135`

备份路径记录：

`/Users/river/Documents/Codex/2026-08-24/hi/work/backups/river-v0.1-latest-backup-path.txt`

本轮没有清空 IndexedDB，也没有把用户笔记迁移到云端。编辑器仍然通过 River 原有本地持久化通道保存。

## 4. 主要代码改动

### 4.1 行内标记解析

新增：

- `src/editor/semanticMarkers.ts`

实现确定性的可见标记解析：

- `**文字**`：粉紫色强调。
- `*文字*`：金色斜体。
- `::文字::`：黄色标注。
- `++文字++`：淡粉灰色评论。
- `~~文字~~`：灰色删除线。
- `` `文字` ``：浅绿色行内代码。

未闭合标记会从开始符号一直作用到当前文字块末尾，不会丢字。标记符号本身仍是文稿内容，可以继续编辑和删除。

### 4.2 结构化编辑命令

重写/扩充：

- `src/editor/commands.ts`

加入并修正：

- 通过稳定 `nodeId` / `blockId` 查找节点。
- 节点文字拆分并创建新节点。
- 在完整子树之后创建同级节点。
- 批量 Tab / Shift+Tab 结构缩进。
- 整棵子树删除与撤销。
- 整棵子树拖动。
- 新节点独立 ID，避免复制旧节点 ID。
- 光标恢复到新节点。
- 指针驱动的拖动事务，避免浏览器默认拖放把两个节点文字合并。

### 4.3 Tiptap 扩展与节点视图

重写：

- `src/editor/extensions.tsx`

主要行为：

- 使用原生 ProseMirror NodeView 代替会残留幽灵节点的 React 包装层。
- `# ` 至 `###### ` 转换为真实的 H1-H6 块属性。
- `1. ` 转换为有序列表。
- `> `、``` 和 `---` 支持引用、代码和分隔内容类型。
- 每个知识点支持折叠、拖动、内容类型切换和稳定身份。
- 行内标记通过 ProseMirror Decoration 实时渲染，不重写用户 DOM。
- 指针拖动显示放置线，拖动结束后仅提交一次结构事务。

### 4.4 统一文档转换

重写：

- `src/editor/convert.ts`

现在会在以下表示之间稳定往返：

- River 的 `KnowledgeNode[]`。
- River 的 `ContentBlock[]`。
- Tiptap 的嵌套列表文档 JSON。

修正内容包括：

- 支持无序列表和有序列表。
- 保留父节点、子节点、顺序、来源引用、折叠状态和用户修改标记。
- 保留顶层非空正文，不再静默丢弃。
- 忽略编辑器产生的空尾段，避免保存后生成“未命名知识点”。
- 统一手动笔记和 AI 知识树进入同一个转换通道。

### 4.5 编辑器交互层

重写：

- `src/editor/OutlineEditor.tsx`

当前已支持：

- 点击任意文字直接编辑。
- Enter 在节点末尾创建同级节点。
- Enter 在节点中间拆分文字。
- 折叠父节点后 Enter 在完整子树之后创建同级节点。
- Tab / Shift+Tab 调整真实层级。
- 中文输入法 composition 期间不执行 Enter 结构命令。
- 撤销、重做、持久化和专注模式。
- 崩溃和重载前的队列刷新。

### 4.6 AI 冲突保护

扩展：

- `src/store/useAppStore.ts`
- `src/components/OnboardingWizard.tsx`

AI 候选结果现在记录目标块的基础文字。AI 等待期间如果用户修改了目标内容，应用不会静默覆盖，而会显示冲突处理：

- `保留我的修改`
- `仍然应用 AI`

新增单元测试：

- `tests/ai-conflict.test.ts`

### 4.7 样式

调整：

- `src/styles/app.css`

加入或校准：

- Effie 蓝色标题层级。
- 标记颜色。
- 列表层级引导线。
- 折叠控件与悬停反馈。
- 拖动把手、拖动中状态和放置线。
- 引用、注释、代码、分隔线和选区样式。
- 折叠控件与拖动把手的点击区域分离，避免拖动把手遮挡折叠按钮。

## 5. 统一 AI 与手动笔记的工作方式

当前权威数据仍是 River 的节点和内容块。编辑器只是该数据的可编辑视图，不是第二份副本。

路径如下：

```text
River nodes + blocks
        ↓ nodesToTiptap
ProseMirror / Tiptap document
        ↓ 用户键入或结构命令
ProseMirror transaction
        ↓ tiptapToNodes
River nodes + blocks
        ↓ replaceKnowledgeTree
IndexedDB
```

AI 生成的 PDF、PPTX、OpenAI 或 DeepSeek 知识树最终都转换成同一组节点和内容块。用户打开后可以直接修改，不需要“转换成手动笔记”。

## 6. 实际验证结果

### 6.1 构建与单元测试

已执行：

```bash
pnpm test
pnpm build
```

结果：

- 单元测试：5 个测试文件，13 项全部通过。
- TypeScript 构建通过。
- Vite 生产构建通过。
- 现有构建仅提示主 bundle 大于 500 kB，没有构建错误。

### 6.2 真实浏览器端到端测试

使用本机安装的 Microsoft Edge，以真实浏览器页面执行：

```bash
pnpm exec playwright test e2e/editor.spec.ts --reporter=line
```

当前结果：20 项测试全部通过。覆盖：

- 新笔记只有一个知识根节点。
- Enter 后光标进入新节点。
- 未闭合和完整可见标记。
- 在标记内部修改文字。
- H1-H6 输入命令。
- 有序列表输入。
- Tab / Shift+Tab。
- 嵌套子节点末尾 Enter。
- 折叠与展开。
- 结构删除和 Cmd+Z 恢复。
- 同级子树拖动和 Cmd+Z。
- 父子树拖动时子内容跟随。
- 刷新后内容、层级和节点数量恢复。
- 新建 A / B 两份笔记后互不串内容。
- 独立编辑器和笔记库内嵌编辑器的专注模式。
- AI 风格 120 节点知识树编辑和折叠。
- composition Enter 不创建节点。

### 6.3 演示录像

真实 River 页面操作录像：

- `outputs/RIVER_EFFIE_EDITOR_DEMO.webm`
- `outputs/RIVER_EFFIE_EDITOR_DEMO.mp4` 未生成成功；本机可用的 Playwright FFmpeg 不包含 H.264/MP4 编码器。

录像内容：

- 新建笔记并改名。
- 输入层级知识内容。
- 输入可见粉紫标记。
- 折叠与展开。
- 进入和退出专注模式。
- 返回笔记库打开已有知识树。
- 直接修改已有知识节点。

## 7. Effie 行为对照状态

| 项目 | 当前状态 | 说明 |
| --- | --- | --- |
| 点击文字直接输入 | 已验证 | 真实浏览器测试通过 |
| `# ` 至 `###### ` | 已验证 | H1-H6 均通过自动化测试 |
| `**` 粉紫色标记 | 已验证 | 可编辑、未闭合状态正常 |
| `*` 金色斜体 | 已验证 | 通过标记解析测试 |
| `::` 标注 | 已验证 | 通过标记解析测试 |
| `++` 评论 | 已验证 | 通过标记解析测试 |
| `~~` 删除线 | 已验证 | 通过标记解析测试 |
| 行内代码 | 已验证 | 通过标记解析测试 |
| Enter 新建节点 | 已验证 | 普通、父节点和嵌套叶子 |
| Tab / Shift+Tab | 已验证 | 修改真实父子结构 |
| 折叠 / 展开 | 已验证 | 后代保留，控件可恢复展开 |
| 结构删除和撤销 | 已验证 | 完整子树删除和 Cmd+Z |
| 子树拖动 | 已验证 | 同级移动、子内容跟随、撤销 |
| 中文 IME Enter 保护 | 已实现并测试 composition 事件 | Safari 和真实拼音候选窗口仍需人工复测 |
| AI 手动冲突保护 | 已验证 | 单元测试确认不静默覆盖 |
| AI 知识树直接编辑 | 已验证 | 120 节点测试树可直接修改和折叠 |
| 刷新恢复 | 已验证 | 文本、层级和节点数量恢复 |
| 多笔记隔离 | 已验证 | A/B 两份笔记互不覆盖 |
| 完整 Effie 1:1 视觉差异 | 未宣布 | 尚未完成逐帧截图差异校准 |

## 8. 尚未完成或需要继续验证

以下项目没有在本轮中宣称完成：

- macOS Safari 的真实 GUI 回归尚未执行。
- 真实中文输入法的候选窗口、候选翻页、组合态 Backspace 和所有标记组合尚未人工逐项测试。
- 图片、表格、查找替换和完整公式编辑仍未纳入本轮编辑器内核。
- 跨父节点的深层拖动虽已有实现路径，但没有完成与 Effie 相同结构的独立对照录像。
- Effie 与 River 的字号、行距、正文宽度、列表缩进和标记颜色尚未形成像素级差异报告。
- AI 云端的真实 OpenAI / DeepSeek 请求没有在本次测试中消耗用户额度；本轮验证的是本地知识树、统一编辑器路径和冲突保护。
- WebM 录像已生成；当前环境缺少支持 MP4 的 FFmpeg，因此没有生成 MP4。

## 9. 启动方式

开发服务器当前可由项目目录启动：

```bash
cd /Users/river/Documents/Codex/2026-08-24/hi/river-v0.1
pnpm dev
```

本地编辑器地址：

`http://127.0.0.1:5174`

API 默认运行在：

`http://127.0.0.1:8788`

## 10. 本轮修改文件索引

核心编辑器：

- `src/editor/semanticMarkers.ts`
- `src/editor/commands.ts`
- `src/editor/extensions.tsx`
- `src/editor/convert.ts`
- `src/editor/OutlineEditor.tsx`

数据与应用：

- `src/types.ts`
- `src/store/useAppStore.ts`
- `src/components/OnboardingWizard.tsx`
- `server/schemas.ts`

样式：

- `src/styles/app.css`

测试：

- `tests/editor-convert.test.ts`
- `tests/ai-conflict.test.ts`
- `e2e/editor.spec.ts`
- `e2e/editor-demo.spec.ts`
- `playwright.config.ts`
- `vitest.config.ts`

录像：

- `outputs/RIVER_EFFIE_EDITOR_DEMO.webm`

## 11. 必须保留的下一轮重点

下一轮不应回到“给文字加颜色”这种表层修改。优先级应当是：

1. 在 Safari 和真实中文输入法中完成人工回归。
2. 用相同窗口尺寸、主题和测试文稿与 Effie 做截图校准。
3. 增加图片、表格和公式节点，并确保它们不破坏正文编辑。
4. 完成更深层的跨父节点知识子树拖动对照。
5. 对 AI 真实请求执行一次完整上传、生成、局部重写、冲突处理和刷新恢复流程。

