import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { intentLabels, levelLabels, purposeLabels, type LearningIntent, type LearningPurpose, type UserLevel } from "../types";

export function PreferenceCard() {
  const bundle = useAppStore((state) => state.bundle);
  const saveLearningProfile = useAppStore((state) => state.saveLearningProfile);
  const generateTreeAction = useAppStore((state) => state.generateTreeAction);
  const resumeGenerationForNote = useAppStore((state) => state.resumeGenerationForNote);
  const isGenerating = useAppStore((state) => state.isGenerating);
  const generationNoteId = useAppStore((state) => state.generationNoteId);
  const generationMessage = useAppStore((state) => state.generationMessage);
  const generationProgress = useAppStore((state) => state.generationProgress);
  const generationPageRange = useAppStore((state) => state.generationPageRange);
  const generationTotalPages = useAppStore((state) => state.generationTotalPages);
  const generationSectionTitle = useAppStore((state) => state.generationSectionTitle);
  const generationCurrentFile = useAppStore((state) => state.generationCurrentFile);
  const generateLargeTestTree = useAppStore((state) => state.generateLargeTestTree);
  const [open, setOpen] = useState(!bundle?.note.profileLockedAt);
  const [generationStuck, setGenerationStuck] = useState(false);
  const [intent, setIntent] = useState<LearningIntent | null>(bundle?.profile?.intent || null);
  const [level, setLevel] = useState<UserLevel | null>(bundle?.profile?.level || null);
  const [purpose, setPurpose] = useState<LearningPurpose | null>(bundle?.profile?.purpose || null);
  const [customLevel, setCustomLevel] = useState(bundle?.profile?.customLevel || "");
  const [customPurpose, setCustomPurpose] = useState(bundle?.profile?.customPurpose || "");
  const [customization, setCustomization] = useState(bundle?.profile?.customization || "");

  const locked = Boolean(bundle?.note.profileLockedAt || bundle?.profile?.lockedAt || bundle?.note.generationState === "completed" || bundle?.note.generationState === "generating");
  const generatingThisNote = isGenerating && generationNoteId === bundle?.note.id;
  const complete = Boolean(intent && level && purpose && (purpose !== "custom" || customPurpose.trim()));
  const hasSources = Boolean(bundle?.sources?.length || bundle?.source);

  useEffect(() => {
    setIntent(bundle?.profile?.intent || null);
    setLevel(bundle?.profile?.level || null);
    setPurpose(bundle?.profile?.purpose || null);
    setCustomLevel(bundle?.profile?.customLevel || "");
    setCustomPurpose(bundle?.profile?.customPurpose || "");
    setCustomization(bundle?.profile?.customization || "");
    setOpen(!(bundle?.note.profileLockedAt || bundle?.profile?.lockedAt || bundle?.note.generationState === "completed"));
  }, [bundle?.note.id, bundle?.note.profileLockedAt, bundle?.note.generationState, bundle?.profile?.lockedAt]);

  useEffect(() => {
    if (locked) setOpen(false);
  }, [locked]);

  useEffect(() => {
    if (!generatingThisNote) { setGenerationStuck(false); return; }
    setGenerationStuck(false);
    const timer = setTimeout(() => setGenerationStuck(true), 120_000);
    return () => clearTimeout(timer);
  }, [generatingThisNote, generationProgress, generationMessage]);

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
        customization: customization.trim() || undefined,
        createdAt: bundle?.profile?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [bundle?.note.id, bundle?.profile?.createdAt, customLevel, customPurpose, customization, intent, level, locked, purpose, saveLearningProfile]);

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
      customization: customization.trim() || undefined,
      createdAt: bundle.profile?.createdAt || now,
      updatedAt: now,
    });
    await generateTreeAction();
  };

  const pageLabel = generationPageRange ? `${generationPageRange}${generationTotalPages ? ` / ${generationTotalPages} 页` : ""}` : "";
  const progressDetail = [generationCurrentFile, pageLabel, generationSectionTitle].filter(Boolean).join(" · ");

  if (!open) {
    return <section className={`river-preference-card is-collapsed ${locked ? "is-locked" : ""}`}>
      <header><div><div className="river-overline">生成前确认</div><h3>这份笔记想怎么学？</h3></div><button className="river-preference-toggle" onClick={() => setOpen(true)}>{locked ? "查看偏好快照" : "展开问题信息收集小卡"}</button></header>
    </section>;
  }

  return (
    <section className={`river-preference-card ${locked ? "is-locked" : ""}`}>
      <header><div><div className="river-overline">生成前确认</div><h3>这份笔记想怎么学？</h3></div><div className="river-preference-header-actions">{locked && <span className="river-badge">已锁定</span>}<button className="river-preference-toggle" onClick={() => setOpen(false)}>收起小卡</button></div></header>
      <div className="river-preference-question"><label><b>1.</b> 你现在想干什么？</label><div className="river-chip-row">{(Object.keys(intentLabels) as LearningIntent[]).map((key) => <button key={key} disabled={locked} className={`river-chip ${intent === key ? "selected" : ""}`} onClick={() => setIntent(key)}>{intentLabels[key]}</button>)}</div></div>
      <div className="river-preference-question"><label><b>2.</b> 你现在是什么程度？</label><div className="river-chip-row">{(Object.keys(levelLabels) as UserLevel[]).map((key) => <button key={key} disabled={locked} className={`river-chip ${level === key ? "selected" : ""}`} onClick={() => setLevel(key)}>{levelLabels[key]}</button>)}</div><input className="river-input" disabled={locked} value={customLevel} onChange={(event) => setCustomLevel(event.target.value)} placeholder="可选：补充具体背景" /></div>
      <div className="river-preference-question"><label><b>3.</b> 你学习这些内容是为了什么？</label><div className="river-chip-row">{(Object.keys(purposeLabels) as LearningPurpose[]).map((key) => <button key={key} disabled={locked} className={`river-chip ${purpose === key ? "selected" : ""}`} onClick={() => setPurpose(key)}>{purposeLabels[key]}</button>)}</div>{purpose === "custom" && <input className="river-input" disabled={locked} value={customPurpose} onChange={(event) => setCustomPurpose(event.target.value)} placeholder="请填写你的真实用途" />}</div>
      <div className="river-preference-question river-customization-field"><label>补充个性化要求 <small>选填</small></label><textarea className="river-input" disabled={locked} value={customization} onChange={(event) => setCustomization(event.target.value)} rows={2} placeholder="请输入您的个性化需求，如：生成中文笔记，保留课件的英文术语对照。" /></div>
      {generatingThisNote && <div className="river-generation-progress"><div><span title={generationMessage || "正在生成…"}>{generationMessage || "正在生成…"}</span><b>{generationProgress}%</b></div><div className="river-progress"><div style={{ width: `${Math.max(0, Math.min(100, generationProgress))}%` }} /></div><small title={progressDetail}>{progressDetail || "等待服务器返回真实处理阶段"}</small></div>}
      {!locked && <button className={`river-generate-button ${complete && hasSources ? "is-ready" : ""}`} disabled={!complete || !hasSources || isGenerating} title={!hasSources ? "请先上传课件" : !complete ? "请完成三项学习偏好" : isGenerating ? "后台正在生成，请等待或重新检查任务" : "生成知识树"} onClick={() => void generate()}>{!hasSources ? "上传课件后填写偏好以生成知识树" : !complete ? "填写笔记偏好以生成知识树" : generatingThisNote ? "后台正在生成…" : "生成知识树"}</button>}
      {generationStuck && generatingThisNote && <div className="river-status-line"><span className="river-status-dot error" />生成任务超过 2 分钟没有新进度。<button className="river-preference-toggle" onClick={() => void resumeGenerationForNote(bundle.note.id)}>重新检查任务</button></div>}
      {bundle.note.generationState === "failed" && <div className="river-status-line"><span className="river-status-dot error" />{bundle.note.generationError || "生成失败，可使用同一份资料和偏好重试。"}<button className="river-preference-toggle" onClick={() => void generateTreeAction()}>重试生成</button></div>}
      {import.meta.env.DEV && <button className="river-button" onClick={() => void generateLargeTestTree(120)}>生成 120 节点测试树</button>}
    </section>
  );
}
