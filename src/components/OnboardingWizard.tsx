import { useState } from "react";
import { useAppStore } from "../store/useAppStore";
import {
  blockTypeLabels,
  intentLabels,
  levelLabels,
  purposeLabels,
  type GoalStyle,
  type LearningIntent,
  type LearningProfile,
  type LearningPurpose,
  type UserLevel,
} from "../types";
import { Icon } from "./IconSprite";

export function OnboardingWizard() {
  const bundle = useAppStore((state) => state.bundle);
  const provider = useAppStore((state) => state.provider);
  const openaiApiKey = useAppStore((state) => state.openaiApiKey);
  const deepseekApiKey = useAppStore((state) => state.deepseekApiKey);
  const opencodeGoApiKey = useAppStore((state) => state.opencodeGoApiKey);
  const ccSwitchKeyEnabled = useAppStore((state) => state.ccSwitchKeyEnabled);
  const hasKey = provider === "deepseek"
    ? Boolean(deepseekApiKey)
    : provider === "opencode-go"
      ? ccSwitchKeyEnabled || Boolean(opencodeGoApiKey)
      : Boolean(openaiApiKey);
  const isGenerating = useAppStore((state) => state.isGenerating);
  const generationMessage = useAppStore((state) => state.generationMessage);
  const generationProgress = useAppStore((state) => state.generationProgress);
  const attachCourseware = useAppStore((state) => state.attachCourseware);
  const saveLearningProfile = useAppStore((state) => state.saveLearningProfile);
  const generateOpeningAction = useAppStore((state) => state.generateOpeningAction);
  const generateTreeAction = useAppStore((state) => state.generateTreeAction);
  const generateLargeTestTree = useAppStore((state) => state.generateLargeTestTree);
  const showToast = useAppStore((state) => state.showToast);
  const [intent, setIntent] = useState<LearningIntent>(bundle?.profile?.intent || "rough");
  const [level, setLevel] = useState<UserLevel>(bundle?.profile?.level || "zero");
  const [purpose, setPurpose] = useState<LearningPurpose>(bundle?.profile?.purpose || "systematic");
  const [goalStyle, setGoalStyle] = useState<GoalStyle>(bundle?.profile?.goalStyle || "question");
  const [customLevel, setCustomLevel] = useState(bundle?.profile?.customLevel || "");
  const [customPurpose, setCustomPurpose] = useState(bundle?.profile?.customPurpose || "");

  if (!bundle) return null;

  const saveProfile = async () => {
    const profile: LearningProfile = {
      noteId: bundle.note.id,
      intent,
      level,
      customLevel,
      purpose,
      customPurpose,
      goalStyle,
      createdAt: bundle.profile?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveLearningProfile(profile);
    showToast("学习三问已保存。", "success");
  };

  return (
    <div className="river-side-card">
      <h3>学习流程</h3>
      {isGenerating && (
        <div style={{ marginBottom: 12 }}>
          <div className="river-status-line"><span className="river-status-dot loading" />{generationMessage || "处理中…"}</div>
          <div className="river-progress" style={{ marginTop: 6 }}><div style={{ width: `${generationProgress}%` }} /></div>
        </div>
      )}
      {!hasKey && (
        <div className="river-status-line" style={{ marginBottom: 10 }}>
          <span className="river-status-dot error" />
          尚未配置 {provider === "deepseek" ? "卡扣 AI" : provider === "opencode-go" ? "OpenCode Go" : "OpenAI"} API Key，请点击顶部“设置 / API Key”。
        </div>
      )}

      <div className="river-form-row">
        <label>1. 上传课件</label>
        {import.meta.env.DEV && (
          <div className="river-chip-row" style={{ marginBottom: 8 }}>
            <button
              className="river-chip"
              disabled={isGenerating}
              onClick={async () => {
                const response = await fetch("/test-fixtures/chinese-english.pdf");
                const blob = await response.blob();
                await attachCourseware(new File([blob], "chinese-english.pdf", { type: "application/pdf" }));
              }}
            >
              加载测试 PDF
            </button>
            <button
              className="river-chip"
              disabled={isGenerating}
              onClick={async () => {
                const response = await fetch("/test-fixtures/chinese-english.pptx");
                const blob = await response.blob();
                await attachCourseware(new File([blob], "chinese-english.pptx", { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }));
              }}
            >
              加载测试 PPTX
            </button>
            <button className="river-chip" disabled={isGenerating} onClick={() => generateLargeTestTree(120)}>生成 120 节点测试树</button>
            <button className="river-chip" disabled={isGenerating} onClick={async () => {
              const response = await fetch("/test-fixtures/corrupt.pdf");
              const blob = await response.blob();
              await attachCourseware(new File([blob], "corrupt.pdf", { type: "application/pdf" }));
            }}>加载损坏 PDF</button>
          </div>
        )}
        {bundle.source ? (
          <div className="river-panel" style={{ padding: 9 }}>
            <div style={{ fontSize: 11, fontWeight: 700 }}>{bundle.source.fileName}</div>
            <div className="river-muted" style={{ fontSize: 10, marginTop: 4 }}>
              {bundle.source.kind.toUpperCase()} · {bundle.source.parseStatus === "parsed" ? "解析成功" : bundle.source.parseStatus === "partial" ? "部分解析" : "解析失败"} · {bundle.source.textCharCount} 字符
            </div>
            {bundle.source.parseError && <div className="river-status-line" style={{ marginTop: 5 }}><span className="river-status-dot error" />{bundle.source.parseError}</div>}
          </div>
        ) : (
          <label className="river-upload-zone" style={{ cursor: "pointer" }}>
            <input
              className="river-hidden"
              type="file"
              accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) await attachCourseware(file);
              }}
            />
            <div>
              <Icon name="notebook" className="tmi-icon" />
              <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700 }}>选择 PDF 或 PPTX 课件</div>
              <div className="river-muted" style={{ fontSize: 10, marginTop: 5 }}>v0.1 优先支持文字型课件；扫描版/图片型会明确提示限制。</div>
            </div>
          </label>
        )}
      </div>

      <div className="river-form-row">
        <label>2. 你现在想干什么？</label>
        <div className="river-chip-row">
          {(Object.keys(intentLabels) as LearningIntent[]).map((key) => (
            <button key={key} className={`river-chip ${intent === key ? "selected" : ""}`} onClick={() => setIntent(key)}>{intentLabels[key]}</button>
          ))}
        </div>
      </div>

      <div className="river-form-row">
        <label>3. 你现在是什么程度？</label>
        <div className="river-chip-row">
          {(Object.keys(levelLabels) as UserLevel[]).map((key) => (
            <button key={key} className={`river-chip ${level === key ? "selected" : ""}`} onClick={() => setLevel(key)}>{levelLabels[key]}</button>
          ))}
        </div>
        <input className="river-input" value={customLevel} onChange={(event) => setCustomLevel(event.target.value)} placeholder="可选：补充你的具体背景" />
      </div>

      <div className="river-form-row">
        <label>4. 你学习这些内容是为了什么？</label>
        <div className="river-chip-row">
          {(Object.keys(purposeLabels) as LearningPurpose[]).map((key) => (
            <button key={key} className={`river-chip ${purpose === key ? "selected" : ""}`} onClick={() => setPurpose(key)}>{purposeLabels[key]}</button>
          ))}
        </div>
        <input className="river-input" value={customPurpose} onChange={(event) => setCustomPurpose(event.target.value)} placeholder="可选：补充具体用途" />
      </div>

      <div className="river-form-row">
        <label>5. 学习目标呈现方式</label>
        <div className="river-chip-row">
          <button className={`river-chip ${goalStyle === "question" ? "selected" : ""}`} onClick={() => setGoalStyle("question")}>提问式（推荐）</button>
          <button className={`river-chip ${goalStyle === "statement" ? "selected" : ""}`} onClick={() => setGoalStyle("statement")}>陈述式</button>
        </div>
      </div>

      <div className="river-chip-row" style={{ marginBottom: 12 }}>
        <button className="river-button" onClick={saveProfile} disabled={!bundle.source || isGenerating}>保存学习三问</button>
        <button className="river-button primary" onClick={generateOpeningAction} disabled={!bundle.source || !bundle.profile || !hasKey || isGenerating}>生成学习开场</button>
        <button className="river-button primary" onClick={generateTreeAction} disabled={!bundle.introduction || !bundle.profile || !hasKey || isGenerating}>生成详细知识树</button>
      </div>

      {bundle.introduction && (
        <div className="river-panel" style={{ padding: 10, marginTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 750, marginBottom: 6 }}>学习开场</div>
          <div className="river-muted" style={{ fontSize: 10, lineHeight: 1.6 }}>{bundle.introduction.positioning}</div>
          <div style={{ marginTop: 8, fontSize: 10, fontWeight: 700 }}>带着这些问题学习</div>
          <ul style={{ margin: "5px 0 0 16px", padding: 0 }}>
            {bundle.introduction.goalQuestions.slice(0, 8).map((question, index) => (
              <li key={index} className="river-muted">{question}</li>
            ))}
          </ul>
          <div style={{ marginTop: 8, fontSize: 10, fontWeight: 700 }}>学习地图</div>
          <div style={{ marginTop: 5 }}>
            {bundle.introduction.mapSections.map((section) => (
              <div key={section.id} className="river-muted" style={{ fontSize: 10, lineHeight: 1.5, marginBottom: 4 }}>
                <span className="river-badge">{section.role}</span> {section.title} {section.startPage ? `· P${section.startPage}-${section.endPage || section.startPage}` : section.startSlide ? `· Slide ${section.startSlide}-${section.endSlide || section.startSlide}` : ""}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AIResultPreview() {
  const pendingAI = useAppStore((state) => state.pendingAI);
  const applyPendingAI = useAppStore((state) => state.applyPendingAI);
  const forceApplyPendingAI = useAppStore((state) => state.forceApplyPendingAI);
  const discardPendingAI = useAppStore((state) => state.discardPendingAI);
  if (!pendingAI) return null;
  return (
    <div className="river-side-card" style={{ borderColor: "light-dark(#d9b95d, #b99f4f)" }}>
      <h3>AI 结果确认</h3>
      {pendingAI.conflict && (
        <div className="river-status-line" style={{ marginBottom: 8 }}>
          <span className="river-status-dot error" />
          目标内容在你等待 AI 时已被修改。AI 不会自动覆盖你的最新修改。
        </div>
      )}
      <div className="river-muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
        {pendingAI.kind === "regenerate" && pendingAI.rationale}
        {pendingAI.kind === "simplify" && "这是一个更通俗的解释，确认后才会替换当前内容。"}
        {pendingAI.kind === "expand" && "这是进一步展开的内容，确认后才会插入知识树。"}
      </div>
      <div className="river-panel" style={{ padding: 9, marginTop: 8, fontSize: 11, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
        {pendingAI.text || pendingAI.explanation}
        {pendingAI.children?.map((child, index) => (
          <div key={index} style={{ marginTop: 8 }}>
            <strong>{child.title}</strong>
            {child.blocks.map((block, blockIndex) => (
              <div key={blockIndex} className="river-muted" style={{ marginTop: 3 }}>[{blockTypeLabels[block.type]}] {block.text}</div>
            ))}
          </div>
        ))}
      </div>
      <div className="river-chip-row" style={{ marginTop: 9 }}>
        {pendingAI.conflict ? (
          <>
            <button className="river-button primary" onClick={discardPendingAI}>保留我的修改</button>
            <button className="river-button" onClick={forceApplyPendingAI}>仍然应用 AI</button>
          </>
        ) : (
          <>
            <button className="river-button primary" onClick={applyPendingAI}>保留并应用</button>
            <button className="river-button" onClick={discardPendingAI}>取消</button>
          </>
        )}
      </div>
    </div>
  );
}
