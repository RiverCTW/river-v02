# River v0.22.2

River v0.22.2 是知识树生成系统专项升级版，并集成生成结果保存修复、无边框笔记库和 Cmd+B 真实加粗。保留 Effie/TipTap 编辑器、标签页账号会话、工作区持久化和后台生成任务，重建新知识树生成流水线：六段开场、全量详表目录、按簇分组的学习目标与导入问题、独立折叠的参考答案、重要 tips 内容块、正文五层结构与强调密度规则、以及长课件防截断机制。生成前会强制同步当前笔记，服务端验证目标存在，任务结束后可从启动快照恢复目标并写回。

主要文档：

- `RIVER_V0.21_STABILITY_REPAIR_REPORT.md`：稳定性修复和 2026-10-27 生成保存故障根因记录。
- `RIVER_V0.22_KNOWLEDGE_TREE_UPGRADE_REPORT.md`：本次升级的完整报告与 TEST-01～TEST-32 结果。
- `RIVER_V0.22_KNOWLEDGE_TREE_UPGRADE_DEMO.webm`：真实操作演示录像。


## 本地运行

```bash
export PATH=/Users/river/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH
cd /Users/river/Documents/Codex/2026-08-24/hi/riverv0.2
pnpm install --frozen-lockfile
pnpm dev
```

- Web：`http://127.0.0.1:5182/`
- API：`http://127.0.0.1:8792/`
- 本地首次管理员：`admin` / `river-admin`

生产环境必须在首次启动前设置 `RIVER_ADMIN_USERNAME`、`RIVER_ADMIN_PASSWORD`、`RIVER_DB_PATH`，使用托管数据库时设置 `DATABASE_URL`。后台任务凭据建议额外设置长期稳定的 `RIVER_GENERATION_SECRET`；未设置时使用仅存在于服务端的 `RIVER_ADMIN_PASSWORD` 派生密钥。参考 `.env.example`。

## 构建与测试

```bash
pnpm test
pnpm e2e
pnpm e2e:auth
pnpm build
```

详细结果和未覆盖项见 `RIVER_V0.21_STABILITY_REPAIR_REPORT.md`。

## 当前架构

- React 19 + TypeScript + Vite + Zustand。
- Express 5 + Node.js 24。
- 本地开发权威数据库：服务端 SQLite，默认 `.data/river-v0.2.sqlite`。
- 浏览器 IndexedDB：编辑缓存、离线草稿和兼容层。
- 生产 PostgreSQL 目标 Schema：`db/postgres-schema.sql`。
- 编辑器：TipTap 3.32 + ProseMirror，现有 Effie 内核未重写。
- 账号：服务端 scrypt 密码哈希、标签页级 Bearer 会话、管理员预建账号。
- 工作区：服务端 revision 校验，客户端旧 revision 不能静默覆盖新数据。
- 后台生成：数据库持久化任务、加密的短期模型凭据、心跳、启动恢复和幂等任务。

## v0.21 功能

- 用户名密码登录、管理员创建账号、账号数据隔离。
- 全部笔记、收藏、最近使用、最近删除、本地资料库和搜索。
- 文件夹右键菜单、新建同级/子文件夹、拖动排序、整树软删除和恢复。
- Effie 连续轮廓卡片、收藏爱心、置顶、笔记副本、移动式拷贝/粘贴。
- 独立笔记页左右无级分隔、伴随栏上下无级分隔和比例恢复。
- 左侧主知识树、右侧要求式/问题式学习地图，两个完整 Effie 编辑器独立运行。
- 一份笔记多份 PDF/PPTX、真实解析状态、排序、删除、SHA-256 去重和生成后锁定。
- 三项必填学习偏好和可选的个性化生成要求，生成成功后保存并锁定快照。
- 一次生成完整知识树、要求式地图和问题式地图；长资料按顺序分批生成。
- 生成任务离开页面后继续运行；重新打开笔记可恢复真实阶段、文件、页段和章节状态。
- 每份笔记独立 AI 对话、资料优先/允许补充两种模式、历史长期保存。
- AI 对话只读知识上下文，不直接修改知识树或地图。

## 部署状态

仓库包含 `Dockerfile`、`.env.example`、`render.yaml` 和 PostgreSQL 持久化实现。稳定生产入口为 `https://river-v02.onrender.com`，其健康检查、登录、账号隔离、PostgreSQL 工作区和部署后回归结果记录在 v0.21 报告中。
