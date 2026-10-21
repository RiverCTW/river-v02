# River v0.1 - OpenCode Go 与 cc-switch 接入

修改日期：2026-10-15

## 状态

OpenCode Go 已经作为 River 的第三个 AI 供应商接入，并已使用本机 cc-switch 中保存的 Key 完成真实调用。

- 供应商显示名：`OpenCode Go`
- 默认模型：`deepseek-v4.1-flash`
- Base URL：`https://opencode.ai/zen/go/v1`
- 调用协议：OpenAI 兼容 Chat Completions
- 结构化输出：`response_format: { type: "json_object" }`
- OpenCode Go 必需请求头：`x-opencode-session`

## 使用方式

1. 打开 River 右上角“设置 / API Key”。
2. 选择“OpenCode Go”。
3. 保持勾选“使用 cc-switch 中当前 OpenCode Go 的本机 Key”。
4. 确认模型为 `deepseek-v4.1-flash`。
5. 点击“验证当前 Key”。
6. 验证成功后点击“保存设置”。

cc-switch 中的供应商记录需保留 OpenCode Go，或继续使用当前记录的固定 provider ID。River 会优先读取数据库中的同名记录，再回退到已知 ID。

## 安全边界

- cc-switch Key 只在 River 后端请求 OpenCode Go 时读取。
- Key 不会返回浏览器。
- Key 不会写入 River IndexedDB、localStorage、URL、日志、备份或 Git。
- cc-switch 模式只允许本机请求。
- River 会拒绝来自 `trycloudflare.com` Host 的 cc-switch 请求。
- River 会拒绝携带 Cloudflare 转发头、`Forwarded` 或 `X-Forwarded-For` 的 cc-switch 请求。
- 公网用户不能读取这台电脑的 cc-switch Key。
- 如果用户选择关闭 cc-switch 模式，可以手动输入自己的 OpenCode Go Key；手动 Key 只保存在当前页面内存中。
- 公网域名打开时，cc-switch 选项默认关闭，避免向公网用户展示不可用的本机密钥模式。

已经实际验证：

- 本机生产地址使用 cc-switch Key 验证 `deepseek-v4.1-flash` 成功。
- 本机生产地址真实调用“说人话”成功并返回结构化 JSON。
- 公网 HTTPS 地址携带 `x-ai-provider: opencode-go` 和 cc-switch 来源头时返回“缺少 API Key”，没有读取本机 Key。
- 浏览器设置页显示 cc-switch Key 输入框禁用、Key 值为空，刷新后仍能使用本机 Key。

## 实测结果

真实模型返回：

```text
模型：deepseek-v4.1-flash
验证：OpenCode Go API Key 有效，模型 deepseek-v4.1-flash 可用。
```

真实“说人话”调用：

```text
机会成本可以这样理解：你做一个选择时，不可能同时把所有选项都拿到手……
```

该响应来自 OpenCode Go，不是模拟数据。

## 自动测试

```text
Test Files  4 passed (4)
Tests       11 passed (11)
```

新增验证覆盖：

- OpenCode Go Base URL 和 `/chat/completions` 路径。
- `x-opencode-session` 请求头。
- `deepseek-v4.1-flash` 模型标识。
- JSON object 输出模式。
- OpenCode Go 不发送 DeepSeek 专属 `thinking` 参数。
- cc-switch 临时 SQLite 数据库读取。
- 本机路由使用 cc-switch Key 后，响应中不包含 Key。
- 原有 OpenAI、卡扣 AI、编辑器往返和备份恢复测试继续通过。

## 运行地址

- 本机生产：`http://127.0.0.1:8790/`
- 开发：`http://127.0.0.1:5174/`
- 本次临时 HTTPS：`https://surrey-mines-joseph-care.trycloudflare.com`

临时 HTTPS 只用于试用，不是长期稳定部署。

## 截图

![OpenCode Go cc-switch settings](/Users/river/Documents/Codex/2026-08-24/hi/river-v0.1/screenshots/v0.1-opencode-go-cc-switch.png)

## 涉及源码

- `server/ai.ts`
- `server/index.ts`
- `src/services/aiClient.ts`
- `src/store/useAppStore.ts`
- `src/components/SettingsModal.tsx`
- `src/components/OnboardingWizard.tsx`
- `src/types.ts`
- `tests/provider.test.ts`
- `tests/provider-route.test.ts`

## 已知限制

- OpenCode Go 使用订阅额度，River 当前记录 token 使用量，但不把订阅用量估算成美元费用。
- OpenCode Go 的模型列表会变化，设置页允许手动修改模型标识。
- cc-switch 需要安装在本机，并且当前用户目录下存在 `~/.cc-switch/cc-switch.db`。
- Cloudflare quick tunnel 地址每次重启可能变化。
