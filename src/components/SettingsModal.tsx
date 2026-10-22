import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { createBackupPayload } from "../db/backup";
import type { AIProvider } from "../types";

const providerLabels: Record<AIProvider, { name: string; model: string; keyHint: string; price: string }> = {
  openai: {
    name: "OpenAI — GPT-6 Luna",
    model: "gpt-6-luna",
    keyHint: "sk-...",
    price: "输入 $0.10 / 1M，缓存输入 $0.01 / 1M，输出 $0.50 / 1M（USD）。",
  },
  deepseek: {
    name: "卡扣 AI — DeepSeek V4.1 Flash",
    model: "deepseek-v4.1-flash",
    keyHint: "卡扣 AI API Key",
    price: "请求通过卡扣 AI（api.kakouai.com）转发，套餐与额度以卡扣 AI 控制台为准。",
  },
  "opencode-go": {
    name: "OpenCode Go — DeepSeek V4.1 Flash",
    model: "deepseek-v4.1-flash",
    keyHint: "可选：手动 OpenCode Go API Key",
    price: "使用 OpenCode Go 订阅额度；cc-switch 本机模式由 River 服务端读取，Key 不进入浏览器。",
  },
};

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const provider = useAppStore((state) => state.provider);
  const openaiApiKey = useAppStore((state) => state.openaiApiKey);
  const deepseekApiKey = useAppStore((state) => state.deepseekApiKey);
  const opencodeGoApiKey = useAppStore((state) => state.opencodeGoApiKey);
  const ccSwitchKeyEnabled = useAppStore((state) => state.ccSwitchKeyEnabled);
  const model = useAppStore((state) => state.model);
  const setProvider = useAppStore((state) => state.setProvider);
  const setOpenAIKey = useAppStore((state) => state.setOpenAIKey);
  const setDeepseekKey = useAppStore((state) => state.setDeepseekKey);
  const setOpenCodeGoKey = useAppStore((state) => state.setOpenCodeGoKey);
  const setCcSwitchKeyEnabled = useAppStore((state) => state.setCcSwitchKeyEnabled);
  const validateApiKeyAction = useAppStore((state) => state.validateApiKeyAction);
  const setModel = useAppStore((state) => state.setModel);
  const exportBackup = useAppStore((state) => state.exportBackup);
  const importBackup = useAppStore((state) => state.importBackup);
  const [draftProvider, setDraftProvider] = useState<AIProvider>(provider);
  const [draftOpenAIKey, setDraftOpenAIKey] = useState(openaiApiKey);
  const [draftDeepseekKey, setDraftDeepseekKey] = useState(deepseekApiKey);
  const [draftOpenCodeGoKey, setDraftOpenCodeGoKey] = useState(opencodeGoApiKey);
  const [draftCcSwitchKeyEnabled, setDraftCcSwitchKeyEnabled] = useState(ccSwitchKeyEnabled);
  const [draftModel, setDraftModel] = useState(model);
  const [busy, setBusy] = useState(false);
  const [ccSwitchAvailable, setCcSwitchAvailable] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const info = providerLabels[draftProvider];
  const currentKey = draftProvider === "deepseek"
    ? draftDeepseekKey
    : draftProvider === "opencode-go"
      ? draftOpenCodeGoKey
      : draftOpenAIKey;
  const usesLocalCcSwitchKey = draftProvider === "opencode-go" && draftCcSwitchKeyEnabled;

  useEffect(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then((health) => setCcSwitchAvailable(Boolean(health?.ccSwitchOpenCodeConfigured)))
      .catch(() => setCcSwitchAvailable(false));
  }, []);

  const setLocalCcSwitch = async (enabled: boolean) => {
    setDraftCcSwitchKeyEnabled(enabled);
    await setCcSwitchKeyEnabled(enabled);
    if (enabled) {
      setDraftProvider("opencode-go");
      setDraftModel("deepseek-v4.1-flash");
      await setProvider("opencode-go");
    }
  };

  const applyDraft = async () => {
    setOpenAIKey(draftOpenAIKey);
    setDeepseekKey(draftDeepseekKey);
    setOpenCodeGoKey(draftOpenCodeGoKey);
    await setCcSwitchKeyEnabled(draftCcSwitchKeyEnabled);
    await setProvider(draftProvider);
    await setModel(draftModel.trim() || info.model);
  };

  const save = async () => {
    setBusy(true);
    await applyDraft();
    setBusy(false);
    onClose();
  };

  const validate = async () => {
    setBusy(true);
    await applyDraft();
    await validateApiKeyAction();
    setBusy(false);
  };

  return (
    <div className="river-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="river-modal" role="dialog" aria-modal="true" aria-label="River 设置">
        <div className="river-modal-header">
          <div>
            <div className="river-modal-title">River 设置</div>
            <div className="river-muted" style={{ fontSize: 11, marginTop: 3 }}>手填 API Key 只保存在当前页面内存中；cc-switch 模式由本机 River 服务端临时读取。</div>
          </div>
          <button className="river-icon-button" onClick={onClose} aria-label="关闭">×</button>
        </div>
        <div className="river-modal-body">
          <div className="river-form-row">
            <label>AI 供应商</label>
            <div className="river-chip-row">
              <button className={`river-chip ${draftProvider === "openai" ? "selected" : ""}`} onClick={() => { setDraftProvider("openai"); setDraftModel("gpt-6-luna"); }}>OpenAI — GPT-6 Luna</button>
              <button className={`river-chip ${draftProvider === "deepseek" ? "selected" : ""}`} onClick={() => { setDraftProvider("deepseek"); setDraftModel("deepseek-v4.1-flash"); }}>卡扣 AI — DeepSeek V4.1 Flash</button>
              <button className={`river-chip ${draftProvider === "opencode-go" ? "selected" : ""}`} onClick={() => {
                setDraftProvider("opencode-go");
                setDraftModel("deepseek-v4.1-flash");
                if (ccSwitchAvailable) void setLocalCcSwitch(true);
              }}>OpenCode Go</button>
            </div>
            <div className="river-muted" style={{ fontSize: 10 }}>当前选择：{info.name}。更换供应商后，后续 AI 请求会真实使用该供应商。</div>
          </div>

          <div className="river-form-row">
            {draftProvider === "opencode-go" && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={draftCcSwitchKeyEnabled}
                  onChange={(event) => void setLocalCcSwitch(event.target.checked)}
                />
                使用 cc-switch 中当前 OpenCode Go 的本机 Key
              </label>
            )}
            {draftProvider === "opencode-go" && <div className={`river-status-line ${ccSwitchAvailable ? "is-ok" : ""}`} style={{ marginBottom: 6 }}><span className={`river-status-dot ${ccSwitchAvailable ? "success" : "error"}`} />{ccSwitchAvailable ? "本机已检测到 cc-switch OpenCode Go Key。勾选后无需填写 Key。" : "当前设备未检测到可用 cc-switch Key，请填写手动 Key。"}</div>}
            <label htmlFor="river-ai-key">{draftProvider === "deepseek" ? "卡扣 AI API Key" : draftProvider === "opencode-go" ? "手动 OpenCode Go API Key（可选）" : "OpenAI API Key"}</label>
            <input
              id="river-ai-key"
              className="river-input"
              type="password"
              autoComplete="off"
              value={currentKey}
              disabled={usesLocalCcSwitchKey}
              onChange={(event) => {
                if (draftProvider === "deepseek") setDraftDeepseekKey(event.target.value);
                else if (draftProvider === "opencode-go") setDraftOpenCodeGoKey(event.target.value);
                else setDraftOpenAIKey(event.target.value);
              }}
              placeholder={info.keyHint}
            />
            <div className="river-muted" style={{ fontSize: 10 }}>
              手填 Key 只保存在当前页面内存中。cc-switch 模式不会把 Key 返回浏览器；后端仅接受来自本机的 cc-switch 请求，公网请求无法读取该 Key。
            </div>
          </div>

          <div className="river-form-row">
            <label htmlFor="river-model">模型标识</label>
            <input id="river-model" className="river-input" value={draftModel} onChange={(event) => setDraftModel(event.target.value)} />
            <div className="river-muted" style={{ fontSize: 10 }}>
              OpenAI 默认 `gpt-6-luna`；卡扣 AI 使用 `deepseek-v4.1-flash`；OpenCode Go 默认 `deepseek-v4.1-flash`，Base URL 为 `https://opencode.ai/zen/go/v1`。
            </div>
          </div>

          <div className="river-panel" style={{ padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>费用参考</div>
            <div className="river-muted" style={{ fontSize: 10, lineHeight: 1.7 }}>{info.price}</div>
          </div>

          <div className="river-form-row">
            <label>数据备份</label>
            <div className="river-chip-row">
              <button className="river-button" onClick={exportBackup}>导出整个知识库</button>
              <button className="river-button" onClick={() => fileRef.current?.click()}>导入备份</button>
              <button className="river-button" onClick={async () => {
                const payload = await createBackupPayload();
                await navigator.clipboard.writeText(JSON.stringify(payload));
                useAppStore.getState().showToast("备份 JSON 已复制到剪贴板。", "success");
              }}>复制备份 JSON</button>
              <button className="river-button" onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  await importBackup(new File([text], "clipboard-backup.json", { type: "application/json" }));
                } catch (error) {
                  useAppStore.getState().showToast(error instanceof Error ? error.message : "剪贴板导入失败。", "error");
                }
              }}>从剪贴板导入</button>
              <input
                ref={fileRef}
                className="river-hidden"
                type="file"
                accept="application/json,.json"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    await importBackup(file);
                    onClose();
                  } catch (error) {
                    useAppStore.getState().showToast(error instanceof Error ? error.message : "导入失败。", "error");
                  }
                }}
              />
            </div>
          </div>
        </div>
        <div className="river-modal-footer">
          <div className="river-chip-row">
            <button className="river-button danger" onClick={() => {
              if (draftProvider === "deepseek") {
                setDeepseekKey("");
                setDraftDeepseekKey("");
              } else if (draftProvider === "opencode-go") {
                setOpenCodeGoKey("");
                setDraftOpenCodeGoKey("");
              } else {
                setOpenAIKey("");
                setDraftOpenAIKey("");
              }
            }} disabled={busy}>清除当前 Key</button>
            <button className="river-button" onClick={validate} disabled={busy}>{busy ? "验证中…" : "验证当前 Key"}</button>
          </div>
          <div className="river-chip-row">
            <button className="river-button" onClick={onClose}>取消</button>
            <button className="river-button primary" onClick={save} disabled={busy}>保存设置</button>
          </div>
        </div>
      </div>
    </div>
  );
}
