import { useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { addChatMessage, db, listChatMessages } from "../db/database";
import { useAppStore } from "../store/useAppStore";
import { CC_SWITCH_LOCAL_KEY, generateChatAnswer } from "../services/aiClient";
import { sourceToText } from "../services/uploadService";
import type { ChatAnswerMode, ChatMessage } from "../types";

export function ChatPanel({ noteId }: { noteId: string }) {
  const bundle = useAppStore((state) => state.bundle);
  const provider = useAppStore((state) => state.provider);
  const model = useAppStore((state) => state.model);
  const openaiApiKey = useAppStore((state) => state.openaiApiKey);
  const deepseekApiKey = useAppStore((state) => state.deepseekApiKey);
  const opencodeGoApiKey = useAppStore((state) => state.opencodeGoApiKey);
  const ccSwitchKeyEnabled = useAppStore((state) => state.ccSwitchKeyEnabled);
  const showToast = useAppStore((state) => state.showToast);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<ChatAnswerMode>("sources");
  const [sending, setSending] = useState(false);
  const [retryQuestion, setRetryQuestion] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    listChatMessages(noteId).then((items) => { if (!cancelled) setMessages(items); });
    return () => { cancelled = true; };
  }, [noteId]);

  useEffect(() => {
    if (messages.length || sending) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, sending]);

  const apiKey = provider === "deepseek" ? deepseekApiKey : provider === "opencode-go" ? (ccSwitchKeyEnabled ? CC_SWITCH_LOCAL_KEY : opencodeGoApiKey) : openaiApiKey;

  const context = useMemo(() => ({
    sourceText: (bundle?.sources?.length ? bundle.sources : bundle?.source ? [bundle.source] : []).map(sourceToText).join("\n\n"),
    treeText: bundle ? JSON.stringify({ nodes: bundle.nodes.map((node) => ({ title: node.title, type: node.nodeType })), blocks: bundle.blocks.map((block) => ({ type: block.type, text: block.text })) }).slice(0, 80_000) : "",
  }), [bundle]);

  const send = async (override?: string) => {
    const text = (override ?? question).trim();
    if (!text || sending) return;
    if (!apiKey) { showToast("请先配置当前设备的 API Key。", "error"); return; }
    setSending(true);
    setRetryQuestion("");
    setQuestion("");
    const userMessage: ChatMessage = { id: nanoid(), noteId, role: "user", content: text, mode, status: "success", createdAt: new Date().toISOString() };
    await addChatMessage(userMessage);
    setMessages((current) => [...current, userMessage]);
    try {
      const maps = await db.learningMaps.where("noteId").equals(noteId).toArray();
      const personalAnswers = maps.flatMap((map) => map.blocks.filter((block) => block.userModified).map((block) => block.text)).join("\n");
      const response = await generateChatAnswer(provider, apiKey, model, {
        question: text,
        mode,
        sourceText: context.sourceText,
        treeText: context.treeText,
        personalAnswers,
        history: messages.slice(-8).map((message) => ({ role: message.role, content: message.content })),
      });
      const assistant: ChatMessage = { id: nanoid(), noteId, role: "assistant", content: `${response.data.answer}${response.data.citations.length ? `\n\n来源：${response.data.citations.join("；")}` : ""}`, mode, status: "success", createdAt: new Date().toISOString() };
      await addChatMessage(assistant);
      setMessages((current) => [...current, assistant]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 回答失败。";
      const assistant: ChatMessage = { id: nanoid(), noteId, role: "assistant", content: "", mode, status: "error", error: message, createdAt: new Date().toISOString() };
      await addChatMessage(assistant);
      setMessages((current) => [...current, assistant]);
      setRetryQuestion(text);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="river-chat-panel">
      <header><b>AI 对话</b><span>{mode === "sources" ? "资料优先" : "允许补充"}</span></header>
      <div ref={scrollRef} className="river-chat-history">
        {messages.length === 0 && <div className="river-chat-empty">围绕这份笔记提问；AI 只回答，不改笔记。</div>}
        {messages.map((message) => <div key={message.id} className={`river-chat-message is-${message.role} ${message.status === "error" ? "is-error" : ""}`}><div>{message.status === "error" ? `回答失败：${message.error}` : message.content}</div><small>{message.role === "user" ? "你" : "River AI"} · {new Date(message.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</small></div>)}
        {sending && <div className="river-chat-message is-assistant is-pending">正在组织回答…</div>}
      </div>
      {retryQuestion && <button className="river-chat-retry" onClick={() => void send(retryQuestion)}>重试上一条问题</button>}
      <div className="river-chat-compose">
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="问 AI…" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} />
        <button className="river-button primary" disabled={!question.trim() || sending} onClick={() => void send()}>发送</button>
      </div>
      <div className="river-chat-modes">
        <button className={`river-chip ${mode === "sources" ? "selected" : ""}`} onClick={() => setMode("sources")}>尽可能用资料中的话来回答</button>
        <button className={`river-chip ${mode === "expanded" ? "selected" : ""}`} onClick={() => setMode("expanded")}>允许用课件外的例子和解释</button>
      </div>
    </section>
  );
}
