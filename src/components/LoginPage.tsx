import { useState } from "react";
import type { AuthUser } from "../types";
import { login } from "../services/authClient";
import { IconSprite } from "./IconSprite";

export function LoginPage({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogin(await login(username, password));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登录失败。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="river-app" className="river-auth-page">
      <IconSprite />
      <form className="river-auth-card" onSubmit={submit}>
        <div className="river-auth-brand"><span>R</span><div><b>River</b><small>v0.21.1 · 长期学习空间</small></div></div>
        <h1>登录你的学习空间</h1>
        <p>账号由管理员预先创建。笔记、资料、学习地图和对话将跟随账号保存。</p>
        <label>用户名<input className="river-input" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
        <label>密码<input className="river-input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <div className="river-status-line"><span className="river-status-dot error" />{error}</div>}
        <button className="river-button primary river-auth-submit" disabled={busy || !username.trim() || !password}>{busy ? "登录中…" : "登录"}</button>
        {import.meta.env.DEV && <div className="river-auth-hint">本地首次运行默认管理员：`admin` / `river-admin`。正式使用前请通过环境变量修改。</div>}
      </form>
    </div>
  );
}
