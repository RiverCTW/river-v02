# River v0.2 完整交付报告

交付日期：2026-10-22（Asia/Shanghai）

## 1. 最终完成情况

River v0.2 已完成本地开发、服务端持久化、账号隔离、完整界面重构、双编辑器、多资料、学习偏好、三份学习内容生成和 AI 对话。当前状态为：

**开发完成，等待云端部署验收。**

这不是纯界面演示。账号、会话、工作区 revision、资料锁定、偏好锁定、真实 OpenCode Go 生成和真实聊天均已通过运行验证。

## 2. 正式项目

- v0.1 冻结备份：`/Users/river/Documents/Codex/2026-08-24/hi/river-v0.1-pre-v0.2-backup-20261022`
- v0.2 正式项目：`/Users/river/Documents/Codex/2026-08-24/hi/riverv0.2`
- Git：已初始化，初始基线提交 `9531766`
- 开发 Web：`http://127.0.0.1:5182/`
- 开发 API：`http://127.0.0.1:8792/`

## 3. 技术架构

- 前端：React 19、TypeScript、Vite 8、Zustand。
- 后端：Express 5、Node.js 24.19、tsx。
- 本地权威数据库：服务端 SQLite，默认 `.data/river-v0.2.sqlite`。
- 浏览器：IndexedDB 作为缓存、离线草稿和 v0.1 兼容层。
- 编辑器：TipTap 3.32 + ProseMirror。
- 数据校验：Zod。
- 自动化：Vitest、Playwright Edge、Playwright WebKit。
- 生产目标 Schema：`db/postgres-schema.sql`。
- 部署模板：`Dockerfile`、`.env.example`、`render.yaml`。

## 4. 修改文件

主要新增或修改：

- `server/persistence.ts`：用户、scrypt 密码、会话、工作区 revision、锁定规则。
- `server/index.ts`：登录、退出、管理员建号、工作区、完整生成和聊天 API。
- `server/ai.ts`：分章规划、完整知识树、两张地图和聊天生成。
- `server/schemas.ts`：学习地图、完整包和聊天结构校验。
- `src/services/workspaceSync.ts`：服务端权威同步、离线状态和 revision 冲突。
- `src/services/authClient.ts`：登录、退出、管理员建号。
- `src/components/LoginPage.tsx`、`AdminUsersModal.tsx`、`LocalWorkspaceChoice.tsx`。
- `src/components/LibraryView.tsx`、`FolderTree.tsx`、`NoteList.tsx`、`ContextMenu.tsx`。
- `src/components/KnowledgeEditor.tsx`、`CompanionPanel.tsx`、`PreferenceCard.tsx`、`LearningMapEditor.tsx`、`ChatPanel.tsx`、`ResizableSplit.tsx`。
- `src/editor/editorFlush.ts`、`snapshotCache.ts`、`OutlineEditor.tsx`：实例注册和兼容扩展，未重写键入机制。
- `src/db/database.ts`、`backup.ts`、`types.ts`：v0.2 数据模型、地图、聊天和迁移。
- `tests/v02-auth-workspace.test.ts`、`tests/v02-generation.test.ts`、`e2e/v02-core.spec.ts`。

## 5. 数据库结构

本地服务端数据库包含：

- `users`
- `sessions`
- `workspaces`

PostgreSQL 目标 Schema 进一步定义了：

- `user_preferences`
- `folders`
- `notes`
- `note_documents`
- `source_documents`
- `note_sources`
- `note_learning_profiles`
- `learning_maps`
- `learning_map_items`
- `note_generation_jobs`
- `chat_threads`
- `chat_messages`

所有用户数据均带 `user_id` 归属；服务端 API 按当前会话用户隔离。

## 6. 登录系统

- 管理员预建账号，不开放注册。
- 用户名和密码登录。
- scrypt 加盐密码哈希。
- 随机 256 位会话令牌，数据库只保存 SHA-256。
- HttpOnly、SameSite=Lax 会话 Cookie。
- 普通用户不能创建管理员。
- 退出时保存编辑器并清除本地账号缓存。

真实浏览器验证：

- 管理员创建新用户：HTTP 201。
- 新用户笔记数：0。
- 管理员从第二个独立浏览器上下文登录：仍看到原笔记。
- 新用户不能看到管理员笔记。

## 7. 数据迁移

- v0.1 IndexedDB 数据库名继续保留为 `river-v0.1`，便于同 origin 升级。
- 新账号没有服务端工作区时，界面显示本地笔记/文件夹/资料数量。
- 用户可选择导入当前浏览器数据或从空白开始。
- 导入通过现有备份结构完成，不覆盖已有云端工作区。
- 备份版本升级到 v2，并兼容读取 v1。
- 学习地图和聊天历史包含在备份往返测试中。

## 8. 文件夹与笔记管理

- 全部笔记、收藏、最近使用、最近删除、本地资料库。
- 搜索标题、知识节点和内容块。
- 文件夹稳定 ID、`parentId`、同级顺序。
- 文件夹右键：新建笔记、子文件夹、同级文件夹、重命名、删除。
- 文件夹拖动：同级排序、成为子文件夹、移回浅层。
- 禁止拖入自身或后代，防止循环。
- 删除文件夹时整树及内部笔记进入最近删除。
- 恢复文件夹时恢复完整子树；原父级不存在时恢复到根目录。
- 笔记右键：重命名、分享占位、删除、置顶、收藏、副本、拷贝、粘贴。
- 拷贝/粘贴按用户确认实现为移动语义，不创建第二份。

## 9. 卡片设计

Effie 风格：

- 一行一卡。
- 连续 SVG Path 文件夹轮廓。
- 左上角文件名签和文件夹图标。
- 标题、正文预览、最近修改时间、所属文件夹。
- 红色实心收藏爱心。
- 打开、分类、删除不再常驻在卡片上。

Notability 风格：

- 保留 A4 纸张缩略视觉。
- 使用真实正文和资料信息。
- 不伪造无关装饰缩略图。

## 10. 双编辑器

- 编辑器内核未重写。
- `editorFlush` 从单例改为实例 Map。
- 快照键包含实例身份。
- 主知识树实例：`main:<noteId>`。
- 要求地图实例：`map:<noteId>:requirements`。
- 问题地图实例：`map:<noteId>:questions`。
- 左右编辑器独立焦点、光标、选区、撤销和保存。

实际验证：

- 左侧输入不影响右侧。
- 右侧输入不影响左侧。
- 切换要求/问题地图不丢内容。
- 中文输入法回归继续通过。
- v0.1 原 79 项编辑器测试全部继续通过，并新增 2 项 v0.2 双编辑器测试。

## 11. 学习偏好

- 只保留三个必填问题。
- 不再默认自动算作用户已填写。
- 自定义用途必须填写真实内容。
- 未完成时按钮显示“填写笔记偏好以生成知识树”并禁用。
- 点击生成时保存偏好快照。
- 成功生成后偏好永久锁定并默认收起。
- 再次展开只查看，不能覆盖。

## 12. 多资料

- 一份笔记支持多份 PDF/PPTX。
- 保存文件名、类型、解析状态、页码/幻灯片号、原件和 SHA-256。
- 支持增删和顺序调整。
- 重复文件不会再次添加。
- 生成按资料保存顺序处理，不再只读取最新一份。
- 生成开始后输入集合冻结。
- 生成成功后服务端拒绝资料增删和排序。

## 13. 完整知识树生成

一次用户点击执行：

1. 生成学习开场。
2. 按资料顺序和页码边界分批。
3. 每个批次生成完整详细树。
4. 合并知识树。
5. 生成要求式地图。
6. 生成问题式地图。
7. 原子提交三份内容和锁定状态。

真实 OpenCode Go 验证结果：

- 两份小测试资料。
- 完整知识树：14 个节点、60 个内容块。
- 要求式地图：35 个节点、97 个内容块。
- 问题式地图：21 个节点、59 个内容块。
- 学习开场：7 个地图章节、8 个目标、10 个导入问题。

这些数字只对应测试材料，不作为所有课程的固定数量标准。

## 14. 两种学习地图

- 两个模式泡泡始终左右并排。
- 一次只显示一种。
- 两种内容分别保存，不重建覆盖。
- 使用完整 Effie 编辑器，不是 textarea。
- 支持标题、标记、Enter、Tab、Shift+Tab、折叠、拖动、撤销和 IME。
- 用户回答和新增子节点长期保存。
- 右键地图泡泡可开启/关闭同步。
- 默认不同步；同步只处理稳定来源关联的标题，不覆盖个人回答。

## 15. AI 对话

- 每份笔记独立历史。
- 用户和 AI 消息长期保存。
- 支持发送中、错误、重试和历史滚动。
- 两种互斥模式：资料优先、允许补充。
- 上下文包含原始资料、完整知识树和用户个人回答。
- AI 接口没有修改笔记的写权限。

真实验证：

- 提问“用一句话说明这门课的核心结构”。
- 模型回答正确串联投资、融资、营运资本管理和 NPV。
- 返回第 1、3、4、5、6 页和第 1 张幻灯片来源。
- 回答前后笔记 revision 均为 0，正文完全不变。

## 16. 账号同步与部署

已实现：

- 服务端权威工作区。
- 工作区 revision。
- 旧 revision 返回 409，不静默覆盖。
- 服务重启后笔记仍存在。
- 同账号另一浏览器上下文读取同一数据。
- 不同账号严格隔离。

尚未完成：

- 正式云 Postgres 实例。
- 正式云对象存储实例。
- 非临时公网域名。
- 真实第二台物理设备验收。

当前环境没有云平台登录、数据库或对象存储凭据，不能诚实地宣称云端正式上线。

## 17. 测试结果

- Vitest：8 个文件，29/29 通过。
- Playwright Edge：81/81 通过。
- Playwright WebKit Smoke：1/1 通过。
- TypeScript：通过。
- Vite production build：通过。
- PDF 解析：通过。
- PPTX 解析：通过。
- 120 节点编辑：通过。
- 500 条快速输入：通过。
- 双账号隔离：通过。
- 服务重启持久化：通过。
- 真实完整生成：通过。
- 真实聊天且笔记不变：通过。
- WebM 录制：通过。
- MP4 转换：通过。

## 18. 已知问题

- 当前权威数据库是服务端 SQLite；正式多实例部署应切换到 PostgreSQL。
- 聊天当前使用可靠请求/响应和发送状态，不是 token 级 SSE 流式。
- 地图同步是安全的基础标题同步；高级双向冲突合并不在本版。
- 分享入口按要求保留为“暂未开放”。
- 笔记偏好全局设置页按要求保留为“暂未开放”。
- 扫描版 PDF/图片型 PPTX 仍以限制提示为主，不承诺视觉 OCR。
- 大 JS bundle 仍有 Vite 体积警告，不影响当前功能。

## 19. 尚需用户授权的项目

需要用户集中提供或授权：

- 一个托管平台账号：Render、Railway 或其他 Node/Docker 平台。
- 一个托管 PostgreSQL：Supabase 或 Neon。
- 一个对象存储：Supabase Storage 或 Cloudflare R2。
- 正式域名，或接受平台提供的稳定子域名。
- 生产管理员用户名和密码。
- 如产生费用，需要用户确认预算。

## 20. 启动和使用

开发：

```bash
export PATH=/Users/river/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH
cd /Users/river/Documents/Codex/2026-08-24/hi/riverv0.2
pnpm install --frozen-lockfile
pnpm dev
```

打开 `http://127.0.0.1:5182/`。

本地首次管理员：

```text
用户名：admin
密码：river-admin
```

生产启动前必须配置 `.env.example` 中的管理员凭据和数据库路径。
