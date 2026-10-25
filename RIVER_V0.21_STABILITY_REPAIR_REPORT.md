# River v0.21 稳定性、生成与交互修复报告

日期：2026-10-25  
开发分支：`v0.21-dev`  
版本：`riverv0.21` / `0.21.0`  
生产入口：`https://river-v02.onrender.com`（部署验证结果见文末）

## 结论

River v0.21 在现有 v0.2 代码上完成修复，没有重建编辑器、没有修改学习资料区的既定排列，也没有新增强制可见滚动条。

本轮实际完成的核心工作：

- 标签页级 Bearer 会话，同一浏览器不同标签页可登录不同账号。
- 每个账号使用独立 IndexedDB，避免同浏览器不同账号串读本地缓存。
- 知识树生成迁移到数据库持久化后台任务，任务不再依赖发起页面生命周期。
- 后台结果写回任务启动时的目标笔记，不依赖“当前打开的笔记”。
- 客户端重新打开笔记时可发现并恢复活动任务。
- 真实文件、页段、章节、阶段和批次进度写入服务端，并由客户端读取。
- 三项必填偏好之外增加可选个性化要求，并真实进入生成提示词和锁定快照。
- 中间 Enter 同级拆分、新节点开头 Backspace 合并、空列表逐级退出。
- IME 组合态与确认 Enter 隔离，折叠/展开不进入普通 Undo。
- 格式工具栏在 1024–1920 桌面宽度下保持可见。
- 修正笔记页未占满窗口的布局错误。
- AI 对话正文与输入达到 15px，说明和模式达到 13px。
- 学习偏好小卡可收起和展开，不重置内容。
- 连续文件夹卡片轮廓、自适应文件名签、卡片内收藏爱心。
- “移动到…”从笔记页顶部移到卡片右键菜单，并使用真实文件夹选择对话框。
- 横纵分隔线支持 pointercancel、lostpointercapture、窗口失焦清理。

## 验收表

| 项目 | 结果 | 证据 / 说明 |
| --- | --- | --- |
| TypeScript + Vite production build | PASS | `pnpm build` 通过；仅保留既有大 chunk 警告 |
| Vitest | PASS | 9 个测试文件，32/32 |
| Playwright Edge 全量回归 | PASS | 86/86，最终串行全量运行通过 |
| Playwright WebKit smoke | PASS | 1/1；键入、Enter、标题、斜杠菜单和持久化 |
| 真实双标签不同账号 | PASS | `pnpm e2e:auth`，1/1；账号 A/B 刷新与单标签退出隔离 |
| 同标签刷新保持身份 | PASS | 双标签 auth E2E 覆盖 |
| 复制标签会话轮换 | PASS | 每次页面启动通过 `/api/auth/tab` 换取独立服务端会话 |
| 不同账号 IndexedDB 隔离 | PASS | 数据库名为 `river-v0.21:<userId>` |
| 后台任务跨请求继续 | PASS | 集成测试在 HTTP 202 返回后等待 Worker 完成 |
| 重复生成幂等 | PASS | 同账号同笔记活动任务返回同一 `jobId` |
| 结果绑定启动时 `noteId` | PASS | 集成测试写入 note-a，并验证完整知识树和两张地图 |
| 页面关闭后重新读取结果 | PASS（架构/集成） | 结果先提交工作区，再标记 COMPLETED；新页面加载云工作区 |
| Worker 重启恢复 | PARTIAL | 启动时扫描 queued/stale active 任务；章节级模型检查点尚未落库 |
| 真实页码来源 | PASS | 页数来自 PDF/PPTX 解析；页码范围来自真实页/幻灯片标记 |
| 当前文件名 | PASS | 每个真实页边界保留资料标记，进度可显示正在处理的文件 |
| 当前章节提示 | PARTIAL | 使用实际批次首个有效标题；不是模型内部逐 token 章节状态 |
| 进度不伪造 | PASS | 百分比只由已完成批次和实际阶段计算，不按时间递增 |
| 中间 Enter 拆分 | PASS | 真实 ProseMirror/E2E 事务验证 |
| 新节点开头 Backspace 合并 | PASS | 保留文字、父子和当前节点附属子树 |
| 空列表逐级退出 | PASS | E2E 覆盖缩进、Outdent、去圆点和普通行 |
| H1/H2/H3 独立规则 | PASS | 标题拆分后进入非标题行；标题与列表标记互斥 |
| Shift+Enter | PASS | 既有回归通过，未被结构命令截获 |
| IME 组合 Enter | PARTIAL | Chromium/WebKit composition 事件通过；真实 macOS 拼音输入仍需人工验收 |
| 折叠不进入 Undo | PASS | 折叠事务 `addToHistory: false`，专项 E2E 通过 |
| 格式工具栏常显 | PASS | 1024/1280/1366/1440/1600/1920 六档实测 |
| 对话字号 | PASS | 消息/输入 15px，说明/模式 13px |
| 个性化生成要求 | PASS | 客户端 E2E 捕获请求体；服务端用于提示词并锁定快照 |
| 学习偏好卡片折叠 | PASS | 收起、展开、状态保留 |
| 文件名签自适应 | PARTIAL | 文字宽度估算并限制 ≤50%；不是逐像素 canvas 测量 |
| 连续文件夹轮廓 | PASS | 单一 SVG Path，平滑曲线连接标签与主体 |
| 收藏爱心位置 | PASS | Effie 卡片主体右上区域 |
| 右键“移动到…” | PASS | 自定义文件夹选择对话框，调用真实移动逻辑 |
| 1024–1920 无横向溢出 | PASS | 浏览器尺寸矩阵实测 |
| 分隔线拖动异常清理 | PASS | pointerup/pointercancel/lostpointercapture/blur |
| 双编辑器互相独立 | PASS | 既有 v0.2 回归通过 |
| 真实模型外部调用 | NOT TESTED | 未使用用户长期 API Key 消耗额度做生产模型验收 |

## 后台任务设计

### 状态

服务端任务状态持久化在 `generation_jobs`：

`QUEUED → PARSING → PLANNING → GENERATING → MERGING → VALIDATING → SAVING → COMPLETED`

失败为 `FAILED`，可重连状态为 `RETRY_PENDING`，需要用户补充信息预留 `NEEDS_INPUT`。

每次更新记录：

- `user_id`、`note_id`
- 状态、阶段、消息
- 真实进度、已完成批次、总批次
- 当前文件、当前页段、当前章节提示
- 心跳、租约、创建/完成时间
- 错误码与错误消息
- 最终结果与提交信息

### 凭据

- API Key 不写入浏览器工作区，不进入任务日志，不出现在公开任务响应。
- 启动任务时用 AES-256-GCM 加密短时任务凭据。
- 密钥来自服务端环境变量 `RIVER_GENERATION_SECRET`；未配置时退化为服务端 `RIVER_ADMIN_PASSWORD` 派生。
- 任务完成或失败后清除数据库中的密文、IV 和认证标签。

### 原子结果

1. Worker 生成完整知识树与两张地图。
2. 进入 `SAVING`，读取目标账号最新工作区 revision。
3. 只替换任务启动时 `note_id` 的正文、知识节点、偏好快照、开场和两张地图。
4. revision 冲突时重新读取并重试，不覆盖其他笔记。
5. 工作区提交成功后才标记 `COMPLETED`。
6. 失败时把目标笔记恢复为 `failed` 并解除输入锁定，便于重试。

## 多标签账号设计

- 登录令牌存放在 `sessionStorage`，请求使用 `Authorization: Bearer`。
- 旧的全浏览器 Cookie 登录被清除，仅保留兼容响应清理。
- 页面启动时通过 `/api/auth/tab` 换取新的标签页会话，解决“复制标签页继承 sessionStorage”。
- 退出只删除当前标签页令牌对应的服务端会话。
- IndexedDB 数据库按 `userId` 命名；旧 `river-v0.1` 数据库只在用户明确选择时复制一次。
- API Key 只保存在当前页面内存中，不跨标签页写入共享存储。

## 工作区并发冲突

- 服务端保留 workpace revision，旧 revision PUT 返回 409。
- 本地修改不会被冲突处理自动清除。
- 冲突提示提供两个明确入口：
  - 导出完整本地冲突副本。
  - 用户确认后载入云端版本。

## 编辑器修复

- 中间 Enter 不调用 TipTap 原生 `splitListItem`，避免把附属子树错误移入新节点。
- 右侧文字进入新同级节点，左侧文字和原有子树留在原节点。
- 在新节点文本起点 Backspace，会把文字接回上一同级节点，并保留当前节点附属子树。
- 空白小点 Enter 先逐级 Outdent，根层再去圆点；后续 Enter 形成普通行。
- 标题 Enter 后新行恢复正文语义，不继续继承标题。
- IME `isComposing`、`keyCode 229` 与 compositionend 短保护窗阻止结构命令。
- 折叠仅更新节点属性，不产生 Undo 历史项，但仍触发自动保存。

## 已验证命令

```bash
PATH="/Users/river/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" pnpm build
PATH="/Users/river/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" pnpm test
PATH="/Users/river/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" pnpm e2e
PATH="/Users/river/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" pnpm e2e:auth
```

最终结果：

- Vitest：9 个文件，32/32。
- Playwright Edge：86/86。
- Playwright 双标签真实认证：1/1。
- Playwright WebKit smoke：1/1。
- TypeScript + Vite production build：通过。

## 视觉验收记录

已使用 Edge Chromium 实际打开 River v0.21，并检查：

- `1920×1080`
- `1600×900`
- `1440×900`
- `1366×768`
- `1280×800`
- `1024×768`

六档宽度均无横向页面溢出；主编辑器格式工具栏均位于视口内。1440 和 1024 截图位于 `outputs/`。

## 仍存在的限制

1. **渲染免费实例休眠**：Render 免费 Web Service 可能休眠，后台任务不是在独立常驻 Worker 中运行。GitHub Actions 每 10 分钟 keepalive 降低概率，但不能提供企业级常驻 SLA。
2. **服务重启后的模型费用**：活动任务会重新执行，已经消耗且未形成章节检查点的模型请求可能重复计费；不会重复创建最终知识树。
3. **章节级断点未实现**：当前是任务级恢复，不是每个知识章节独立完成并增量入库。
4. **真实中文输入法**：自动化已模拟 composition 事件，但 macOS 系统拼音输入法仍需人工逐项验收。
5. **生产 AI Key 回归**：未使用用户真实长期 API Key 做付费端到端生成；使用确定性 mock 模型验证了任务、轮询、提交和失败状态。
6. **文件名签测量**：当前按字符宽度估算并严格限制最大 50%，未使用 canvas 逐像素测量。

## 部署记录

部署提交：`9265370`（`main`）  
部署平台：Render 现有服务 `river-v02`  
生产 URL：`https://river-v02.onrender.com`

部署后实际验证：

- `/api/health` 返回 `ok: true` 且 `service: "riverv0.21"`。
- 页面标题为 `River v0.21`。
- 同一 Edge 浏览器、同一浏览器上下文、两个标签页分别登录：
  - `测试-GJ`
  - `Lewis`
- 两标签页刷新后身份保持不变。
- `Lewis` 标签页退出后，`测试-GJ` 标签页刷新仍保持登录。
- 1366×768 与 1024×768 生产页面均无横向溢出。
- 生产活动任务探测返回 HTTP 200 `{ active: false }`，不再通过无任务 404 污染控制台。
- 上述生产浏览器检查未捕获 console error。
