# River v0.2

River v0.2 是账号化、服务端持久化、双编辑器学习工作台。现有 Effie/TipTap 编辑器内核保留，v0.1 的键入、Enter、Tab、Shift+Tab、折叠、拖动、撤销和中文输入法行为继续通过完整回归。

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

生产环境必须在首次启动前设置 `RIVER_ADMIN_USERNAME`、`RIVER_ADMIN_PASSWORD` 和 `RIVER_DB_PATH`，参考 `.env.example`。

## 构建与测试

```bash
pnpm test
pnpm e2e
pnpm build
```

当前实际结果：

- Vitest：8 个文件，29/29。
- Playwright Edge：81/81。
- Playwright WebKit Smoke：1/1。
- TypeScript + Vite production build：通过。

## 当前架构

- React 19 + TypeScript + Vite + Zustand。
- Express 5 + Node.js 24。
- 本地开发权威数据库：服务端 SQLite，默认 `.data/river-v0.2.sqlite`。
- 浏览器 IndexedDB：编辑缓存、离线草稿和兼容层。
- 生产 PostgreSQL 目标 Schema：`db/postgres-schema.sql`。
- 编辑器：TipTap 3.32 + ProseMirror，现有 Effie 内核未重写。
- 账号：服务端 scrypt 密码哈希、HttpOnly 会话 Cookie、管理员预建账号。
- 工作区：服务端 revision 校验，客户端旧 revision 不能静默覆盖新数据。

## v0.2 功能

- 用户名密码登录、管理员创建账号、账号数据隔离。
- 全部笔记、收藏、最近使用、最近删除、本地资料库和搜索。
- 文件夹右键菜单、新建同级/子文件夹、拖动排序、整树软删除和恢复。
- Effie 连续轮廓卡片、收藏爱心、置顶、笔记副本、移动式拷贝/粘贴。
- 独立笔记页左右无级分隔、伴随栏上下无级分隔和比例恢复。
- 左侧主知识树、右侧要求式/问题式学习地图，两个完整 Effie 编辑器独立运行。
- 一份笔记多份 PDF/PPTX、真实解析状态、排序、删除、SHA-256 去重和生成后锁定。
- 三项必填学习偏好，生成成功后偏好和资料永久锁定。
- 一次生成完整知识树、要求式地图和问题式地图；长资料按顺序分批生成。
- 每份笔记独立 AI 对话、资料优先/允许补充两种模式、历史长期保存。
- AI 对话只读知识上下文，不直接修改知识树或地图。

## 部署状态

仓库包含 `Dockerfile`、`.env.example`、`render.yaml` 和 PostgreSQL Schema，但当前环境没有云平台、托管数据库或对象存储凭据，因此当前状态是：

**开发完成，等待云端部署验收。**

只有完成非临时网址、云端 Postgres/对象存储、服务重启和新部署后数据仍存在、第二台设备同账号读取，才能宣布正式云端可用。

完整交付说明见 `RIVER_V0.2_COMPLETE_DELIVERY_REPORT.md`。
