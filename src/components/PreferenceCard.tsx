import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { intentLabels, levelLabels, purposeLabels, type LearningIntent, type LearningPurpose, type UserLevel } from "../types";

export function PreferenceCard() {
  const bundle = useAppStore((state) => state.bundle);
  const saveLearningProfile = useAppStore((state) => state.saveLearningProfile);
  const generateTreeAction = useAppStore((state) => state.generateTreeAction);
  const isGenerating = useAppStore((state) => state.isGenerating);
  const generationMessage = useAppStore((state) => state.generationMessage);
  const generationProgress = useAppStore((state) => state.generationProgress);
  const generateLargeTestTree = useAppStore((state) => state.generateLargeTestTree);
  const [open, setOpen] = useState(!bundle?.note.profileLockedAt);
  const [intent, setIntent] = useState<LearningIntent | null>(bundle?.profile?.intent || null);
  const [level, setLevel] = useState<UserLevel | null>(bundle?.profile?.level || null);
  const [purpose, setPurpose] = useState<LearningPurpose | null>(bundle?.profile?.purpose || null);
  const [customLevel, setCustomLevel] = useState(bundle?.profile?.customLevel || "");
  const [customPurpose, setCustomPurpose] = useState(bundle?.profile?.customPurpose || "");

  const locked = Boolean(bundle?.note.profileLockedAt || bundle?.profile?.lockedAt || bundle?.note.generationState === "completed");
  const complete = Boolean(intent && level && purpose && (purpose !== "custom" || customPurpose.trim()));
  const hasSources = Boolean(bundle?.sources?.length || bundle?.source);

  useEffect(() => {
    if (locked) setOpen(false);
  }, [locked]);

  useEffect(() => {
    if (locked || !intent || !level || !purpose || (purpose === "custom" && !customPurpose.trim())) return;
    const timer = setTimeout(() => {
      void saveLearningProfile({
        noteId: bundle?.note.id || "",
        intent,
        level,
        customLevel: customLevel.trim() || undefined,
        purpose,
        customPurpose: customPurpose.trim() || undefined,
        createdAt: bundle?.profile?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [bundle?.note.id, bundle?.profile?.createdAt, customLevel, customPurpose, intent, level, locked, purpose, saveLearningProfile]);

  if (!bundle) return null;

  const generate = async () => {
    if (!complete || !hasSources || !intent || !level || !purpose) return;
    const now = new Date().toISOString();
    await saveLearningProfile({
      noteId: bundle.note.id,
      intent,
      level,
      customLevel: customLevel.trim() || undefined,
      purpose,
      customPurpose: customPurpose.trim() || undefined,
      createdAt: bundle.profile?.createdAt || now,
      updatedAt: now,
    });
    await generateTreeAction();
  };

  if (!open) {
    return <button className="river-preference-collapsed" onClick={() => setOpen(true)}><span /> 此笔记偏好</button>;
  }

  return (
    <section className={`river-preference-card ${locked ? "is-locked" : ""}`}>
      <header><div><div className="river-overline">生成前确认</div><h3>这份笔记想怎么学？</h3></div>{locked && <span className="river-badge">已锁定</span>}</header>
      <div className="river-preference-question"><label><b>1.</b> 你现在想干什么？</label><div className="river-chip-row">{(Object.keys(intentLabels) as LearningIntent[]).map((key) => <button key={key} disabled={locked} className={`river-chip ${intent === key ? "selected" : ""}`} onClick={() => setIntent(key)}>{intentLabels[key]}</button>)}</div></div>
      <div className="river-preference-question"><label><b>2.</b> 你现在是什么程度？</label><div className="river-chip-row">{(Object.keys(levelLabels) as UserLevel[]).map((key) => <button key={key} disabled={locked} className={`river-chip ${level === key ? "selected" : ""}`} onClick={() => setLevel(key)}>{levelLabels[key]}</button>)}</div><input className="river-input" disabled={locked} value={customLevel} onChange={(event) => setCustomLevel(event.target.value)} placeholder="可选：补充具体背景" /></div>
      <div className="river-preference-question"><label><b>3.</b> 你学习这些内容是为了什么？</label><div className="river-chip-row">{(Object.keys(purposeLabels) as LearningPurpose[]).map((key) => <button key={key} disabled={locked} className={`river-chip ${purpose === key ? "selected" : ""}`} onClick={() => setPurpose(key)}>{purposeLabels[key]}</button>)}</div>{purpose === "custom" && <input className="river-input" disabled={locked} value={customPurpose} onChange={(event) => setCustomPurpose(event.target.value)} placeholder="请填写你的真实用途" />}</div>
      {isGenerating && <div className="river-generation-progress"><div><span>{generationMessage || "正在生成…"}</span><b>{generationProgress}%</b></div><div className="river-progress"><div style={{ width: `${generationProgress}%` }} /></div></div>}
      {!locked && <button className={`river-generate-button ${complete && hasSources ? "is-ready" : ""}`} disabled={!complete || !hasSources || isGenerating} onClick={() => void generate()}>{!hasSources ? "上传课件后填写偏好以生成知识树" : !complete ? "填写笔记偏好以生成知识树" : "生成知识树"}</button>}
      {bundle.note.generationState === "failed" && <div className="river-status-line"><span className="river-status-dot error" />{bundle.note.generationError || "生成失败，可使用同一份资料和偏好重试。"}</div>}
      {import.meta.env.DEV && <button className="river-button" onClick={() => void generateLargeTestTree(120)}>生成 120 节点测试树</button>}
    </section>
  );
}
