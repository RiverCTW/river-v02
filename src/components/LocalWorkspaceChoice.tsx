import { useEffect, useState } from "react";
import { db } from "../db/database";

export function LocalWorkspaceChoice({ onAdopt, onEmpty }: { onAdopt: () => Promise<void>; onEmpty: () => Promise<void> }) {
  const [counts, setCounts] = useState({ notes: 0, folders: 0, sources: 0 });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([db.notes.count(), db.folders.count(), db.sources.count()]).then(([notes, folders, sources]) => setCounts({ notes, folders, sources }));
  }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); } finally { setBusy(false); }
  };

  return (
    <div id="river-app" className="river-auth-page">
      <div className="river-auth-card">
        <div className="river-auth-brand"><span>R</span><div><b>River</b><small>首次连接账号</small></div></div>
        <h1>这个账号还没有云端笔记</h1>
        <p>当前浏览器中找到 {counts.notes} 篇笔记、{counts.folders} 个文件夹和 {counts.sources} 份资料。导入前不会覆盖云端数据。</p>
        <div className="river-chip-row">
          <button className="river-button primary" disabled={busy || counts.notes === 0} onClick={() => void run(onAdopt)}>导入当前浏览器笔记</button>
          <button className="river-button" disabled={busy} onClick={() => void run(onEmpty)}>从空白开始</button>
        </div>
        <div className="river-auth-hint">导入会把这些数据绑定到当前账号；以后从其他设备登录会读取同一份服务端副本。</div>
      </div>
    </div>
  );
}
