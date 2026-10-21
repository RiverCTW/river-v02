import { useEffect, useState } from "react";
import type { AuthUser } from "../types";
import { createUserAccount, listUserAccounts } from "../services/authClient";

export function AdminUsersModal({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => listUserAccounts().then(setUsers).catch((error) => setMessage(error.message));
  useEffect(() => { void refresh(); }, []);

  const create = async () => {
    setBusy(true);
    setMessage("");
    try {
      await createUserAccount(username, password);
      setUsername("");
      setPassword("");
      setMessage("账号已创建。");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建失败。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="river-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="river-modal">
        <div className="river-modal-header"><div><div className="river-modal-title">账号管理</div><div className="river-muted">管理员预先创建账号，不开放公开注册。</div></div><button className="river-icon-button" onClick={onClose}>×</button></div>
        <div className="river-modal-body">
          <div className="river-form-row"><label>用户名</label><input className="river-input" value={username} onChange={(event) => setUsername(event.target.value)} /></div>
          <div className="river-form-row"><label>初始密码</label><input className="river-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></div>
          <button className="river-button primary" disabled={busy || !username.trim() || password.length < 6} onClick={() => void create()}>创建账号</button>
          {message && <div className="river-status-line" style={{ marginTop: 10 }}>{message}</div>}
          <div className="river-panel" style={{ padding: 10, marginTop: 12 }}>
            <div className="river-overline">已有账号</div>
            {users.map((user) => <div key={user.id} className="river-account-row"><b>{user.username}</b><span>{user.role === "admin" ? "管理员" : "用户"}</span></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
