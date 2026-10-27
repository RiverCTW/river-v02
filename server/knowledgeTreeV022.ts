import type { UsageSummary } from "./ai";
import {
  chapterMapSchema,
  directorySchema,
  goalsSchema,
  knowledgeTreeSchema,
  openingSchema,
  questionsSchema,
} from "./schemas";

export interface PipelineDeps {
  generateStructured: (options: {
    provider: string;
    apiKey: string;
    model: string;
    schema: any;
    schemaName: string;
    system: string;
    user: string;
    effort?: "low" | "medium" | "high" | "max";
    maxTokens?: number;
    sessionId?: string;
  }) => Promise<{ data: any; usage: UsageSummary; model: string }>;
  compactSource: (text: string, max?: number) => string;
  defaultModelForProvider: (provider: string) => string;
}

export const LAYOUT_RULES = [
  "写作与层级规则（必须严格执行）：",
  "1. H1/H2/H3 是标题，不占正文列表层级；正式正文列表从「小节」开始算第 1 级，最多 5 级。",
  "2. 层级只表达真实从属关系（属于、解释、展开、依据、例子、后果、具体条件、具体分类）；并列内容必须同级，不能随意缩进。",
  "3. 禁止为了制造层次而把一个完整句子拆成父子两行。限定、例外、转折必须写在父行的完整句子里，否则折叠父行会改变原意。",
  "4. 父行必须能独立读懂；子行只做进一步说明、举例、展开或后果。",
  "5. 并列的多项（例如五类事由、四个规则）各占一行，不要塞进一句话用顿号连接。",
  "6. 不要求每行都很短；完整表达优先，不要为了整齐牺牲准确性。",
  "7. 内容块类型只能使用 Schema 枚举。importantTips 只用于「这块必须注意的操作要点或判断顺序」；pitfall 只用于「常见错误做法或错误理解」。两者不要混用。",
  "8. 强调标记要克制：斜体用于术语或分类名；粗体用于关键术语或缩写首次出现；::...:: 只标正文中的短词或短判断，单处不超过 12 个汉字，每个内容块最多 3 处。不要整句高亮，除非整句本身是不可分割的结论且不超过 20 个字。",
  "9. 绝对不要输出 ~~删除线~~ 标记。",
  "10. 英文只在两种条件下出现：课件原文已经出现英文，或用户明确要求中英对照。否则一律只写中文，不要自行补英文翻译。",
  "11. 每个节点、每个内容块尽量给出真实 sourceRefs（pageNumber 或 slideNumber）。不得编造页码；无法确认时省略。",
].join("\n");

type Section = {
  id: string;
  title: string;
  role: "intro" | "key" | "difficulty" | "exercise" | "extension";
  startPage?: number;
  endPage?: number;
  startSlide?: number;
  endSlide?: number;
  summary: string;
  keyPoints: string[];
  examples: string[];
};

export function cleanText(value: unknown): string {
  return String(value ?? "").replace(/~~/g, "");
}

export function normalizeBlock(block: any): any {
  return {
    ...block,
    type: block?.type === "referenceAnswer" ? "supplement" : block?.type,
    text: cleanText(block?.text),
    sourceRefs: block?.sourceRefs || [],
  };
}

function pageRangeLabel(section: Section): string {
  if (section.startPage) return section.endPage && section.endPage !== section.startPage ? `P${section.startPage}-${section.endPage}` : `P${section.startPage}`;
  if (section.startSlide) return section.endSlide && section.endSlide !== section.startSlide ? `Slide ${section.startSlide}-${section.endSlide}` : `Slide ${section.startSlide}`;
  return "";
}

function outlineOfTree(tree: any, maxNodes = 220, maxDepth = 3): string {
  const lines: string[] = [];
  const walk = (nodes: any[], depth: number) => {
    for (const node of nodes || []) {
      if (lines.length >= maxNodes) return;
      lines.push(`${"  ".repeat(depth)}- ${node.title}${node.sectionId ? ` [${node.sectionId}]` : ""}`);
      if (depth + 1 < maxDepth && node.children?.length) walk(node.children, depth + 1);
    }
  };
  walk(tree?.nodes || [], 0);
  return lines.join("\n");
}

/** Split a parsed source text into page/slide segments keyed by their printed number. */
function indexSourceSegments(sourceText: string): Array<{ kind: "page" | "slide"; number: number; text: string }> {
  const segments: Array<{ kind: "page" | "slide"; number: number; text: string }> = [];
  const regex = /\[第\s*(\d+)\s*(页|张幻灯片)\]\s*\n?/g;
  const matches = [...sourceText.matchAll(regex)];
  if (!matches.length) return segments;
  matches.forEach((match, index) => {
    const start = (match.index || 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : sourceText.length;
    segments.push({
      kind: match[2] === "张幻灯片" ? "slide" : "page",
      number: Number(match[1]),
      text: sourceText.slice(start, end).trim(),
    });
  });
  return segments;
}

function sourceForSection(sourceText: string, section: Section): string {
  const segments = indexSourceSegments(sourceText);
  if (!segments.length) return "";
  const isSlide = Boolean(section.startSlide || section.endSlide);
  const start = isSlide ? section.startSlide : section.startPage;
  const end = isSlide ? section.endSlide : section.endPage;
  if (!start) return "";
  return segments
    .filter((segment) => segment.kind === (isSlide ? "slide" : "page"))
    .filter((segment) => segment.number >= start && segment.number <= (end || start))
    .map((segment) => `[第 ${segment.number} ${segment.kind === "slide" ? "张幻灯片" : "页"}]\n${segment.text}`)
    .join("\n\n");
}

function batchSections(sections: Section[], sourceText: string, maxChars = 60_000): Array<{ sections: Section[]; text: string }> {
  const batches: Array<{ sections: Section[]; text: string }> = [];
  let currentSections: Section[] = [];
  let currentText = "";
  const flush = () => {
    if (!currentSections.length) return;
    batches.push({ sections: currentSections, text: currentText });
    currentSections = [];
    currentText = "";
  };
  for (const section of sections) {
    let slice = sourceForSection(sourceText, section);
    if (!slice) slice = `${pageRangeLabel(section)}\n${section.title}\n${section.summary}\n${section.keyPoints.join("\n")}`;
    if (slice.length > maxChars) slice = slice.slice(0, maxChars);
    if (currentText && currentText.length + slice.length + 2 > maxChars) flush();
    currentSections.push(section);
    currentText = currentText ? `${currentText}\n\n${slice}` : slice;
  }
  flush();
  return batches;
}

/**
 * Body content never carries intro-question reference answers. Some models use
 * the referenceAnswer type for exercise answers; normalise those to a normal
 * block and strip any accidental strikethrough markers.
 */
function normalizeBodyNode(node: any): any {
  return {
    ...node,
    blocks: (node.blocks || []).map((block: any) => ({
      ...block,
      type: block.type === "referenceAnswer" ? "supplement" : block.type,
      text: String(block.text || "").replace(/~~/g, ""),
    })),
    children: (node.children || []).map(normalizeBodyNode),
  };
}

function mergeBodyTrees(trees: any[]): any {
  const seen = new Set<string>();
  const nodes: any[] = [];
  for (const tree of trees) {
    for (const node of tree?.nodes || []) {
      const key = node.sectionId || `${node.title}#${nodes.length}`;
      if (node.sectionId && seen.has(node.sectionId)) continue;
      if (node.sectionId) seen.add(node.sectionId);
      nodes.push(normalizeBodyNode(node));
    }
  }
  return {
    title: trees.find((tree) => tree?.title)?.title || "学习知识树",
    summary: trees.map((tree) => tree?.summary || "").filter(Boolean).join(" ").slice(0, 2000),
    nodes,
    coveredSectionIds: [...seen],
  };
}

function buildDirectoryNode(entries: any[]) {
  return entries.map((entry) => {
    const range = entry.startPage
      ? entry.endPage && entry.endPage !== entry.startPage ? `P${entry.startPage}-${entry.endPage}` : `P${entry.startPage}`
      : entry.startSlide
        ? entry.endSlide && entry.endSlide !== entry.startSlide ? `Slide ${entry.startSlide}-${entry.endSlide}` : `Slide ${entry.startSlide}`
        : "";
    const roleLabel = { intro: "引入", key: "重点", difficulty: "难点", exercise: "练习", extension: "拓展" }[entry.role as "intro" | "key" | "difficulty" | "exercise" | "extension"] || "内容";
    return {
      header: `【${roleLabel}${range ? ` · ${range}` : ""}】${entry.title}`,
      blocks: entry.blocks || [],
    };
  });
}

export async function generateCompleteLearningPackageV022(input: {
  provider: any;
  apiKey: string;
  model?: string;
  sessionId?: string;
  sourceText: string;
  profile: any;
  introduction?: any;
  customization?: string;
  onProgress?: (progress: number, message: string, meta?: any) => void;
}, deps: PipelineDeps) {
  const report = (progress: number, message: string, meta?: any) => input.onProgress?.(progress, message, meta);
  const provider = input.provider;
  const model = input.model || deps.defaultModelForProvider(provider);
  const profileText = [
    `学习意图：${input.profile?.intent}`,
    `用户程度：${input.profile?.level}${input.profile?.customLevel ? `（${input.profile.customLevel}）` : ""}`,
    `学习用途：${input.profile?.purpose}${input.profile?.customPurpose ? `（${input.profile.customPurpose}）` : ""}`,
    input.profile?.customization ? `用户个性化要求：${input.profile.customization}` : "",
    input.customization ? `本次生成附加要求：${input.customization}` : "",
  ].filter(Boolean).join("\n");

  report(6, "正在分析课件章节结构…", { stage: "PLANNING" });
  const mapResponse = await deps.generateStructured({
    provider, apiKey: input.apiKey, model, sessionId: input.sessionId,
    schema: chapterMapSchema, schemaName: "chapter_map", effort: "high", maxTokens: 32_000,
    system: [
      "你是 River 的课件结构分析器。",
      "你必须识别这份资料真实存在的章节与小节，不能编造。",
      "每个小节必须给出真实页码范围或幻灯片范围；无法确认时省略，但不要猜。",
      "role 只能根据课件证据判断：intro（引入）、key（重点）、difficulty（难点）、exercise（练习）、extension（拓展）。",
      "summary 要说明这一节实际讲了什么，不要写成空泛的导语。",
      "learningOutcomes 和 exercises 只摘录课件中真实存在的内容；没有就返回空数组。",
      "hasEnglishTerms 表示课件原文是否出现英文术语。",
    ].join("\n"),
    user: [profileText, "", "课件内容：", deps.compactSource(input.sourceText, 160_000)].join("\n"),
  });
  const chapterMap = mapResponse.data;
  const sections: Section[] = chapterMap.sections;
  const usages: UsageSummary[] = [mapResponse.usage];

  report(16, `识别到 ${sections.length} 个小节，正在生成正式知识树…`, {
    stage: "GENERATING", totalSections: sections.length, completedSections: 0,
  });

  const batches = batchSections(sections, input.sourceText);
  const bodyTrees: any[] = [];
  let currentModel = mapResponse.model;
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const sectionList = batch.sections.map((section) => ({
      id: section.id, title: section.title, role: section.role,
      pages: pageRangeLabel(section), summary: section.summary, keyPoints: section.keyPoints,
    }));
    report(16 + Math.round(((index + 1) / batches.length) * 34), `正在生成正文 ${index + 1}/${batches.length} 批`, {
      stage: "GENERATING",
      sectionTitle: batch.sections.map((section) => section.title).join(" / ").slice(0, 80),
      pageRange: batch.sections.map(pageRangeLabel).filter(Boolean).join(", "),
      completedSections: index * batch.sections.length,
      totalSections: sections.length,
    });
    const bodyResponse = await deps.generateStructured({
      provider, apiKey: input.apiKey, model: currentModel, sessionId: input.sessionId,
      schema: knowledgeTreeSchema, schemaName: "knowledge_tree", effort: "high", maxTokens: 96_000,
      system: [
        "你是 River 的知识树正文生成器。",
        "River 的知识树不是普通思维导图，每个节点都要能承载完整解释。",
        "必须覆盖本批次列出的每一个小节，不能只写摘要，也不能跳过任何 sectionId。",
        "每个顶层节点必须带 sectionId，值必须是本批次给出的 id 之一。",
        LAYOUT_RULES,
      ].join("\n"),
      user: [
        profileText,
        "",
        "本批次小节（必须全部覆盖）：",
        JSON.stringify(sectionList),
        "",
        "本批次课件原文：",
        batch.text,
        "",
        index > 0 ? `上一批最后一个知识点是：「${bodyTrees.at(-1)?.nodes?.at(-1)?.title || ""}」。请从这里自然衔接，不要重复上一批内容。` : "",
      ].join("\n"),
    });
    bodyTrees.push(bodyResponse.data);
    usages.push(bodyResponse.usage);
    currentModel = bodyResponse.model;
  }

  let bodyTree = mergeBodyTrees(bodyTrees);

  // Completeness repair: any section that never produced a top-level node is
  // regenerated once on its own instead of silently shipping a partial tree.
  const covered = new Set<string>(bodyTree.coveredSectionIds || []);
  const missing = sections.filter((section) => !covered.has(section.id));
  if (missing.length) {
    report(52, `发现 ${missing.length} 个小节缺失，正在补写…`, { stage: "VALIDATING", totalSections: sections.length, completedSections: sections.length - missing.length });
    for (const section of missing) {
      const slice = sourceForSection(input.sourceText, section) || `${pageRangeLabel(section)}\n${section.title}\n${section.summary}`;
      const repair = await deps.generateStructured({
        provider, apiKey: input.apiKey, model: currentModel, sessionId: input.sessionId,
        schema: knowledgeTreeSchema, schemaName: "knowledge_tree_repair", effort: "high", maxTokens: 64_000,
        system: [
          "你是 River 的知识树补写器。只补写指定的一个小节，不要重复其他章节。",
          "顶层节点的 sectionId 必须是给定的 id。",
          LAYOUT_RULES,
        ].join("\n"),
        user: [profileText, "", JSON.stringify([{ id: section.id, title: section.title, pages: pageRangeLabel(section), summary: section.summary }]), "", slice].join("\n"),
      });
      usages.push(repair.usage);
      bodyTree = mergeBodyTrees([bodyTree, repair.data]);
    }
  }

  const bodyOutline = outlineOfTree(bodyTree);

  report(56, "正在生成章节导入…", { stage: "MERGING", totalSections: sections.length, completedSections: sections.length });
  const openingResponse = await deps.generateStructured({
    provider, apiKey: input.apiKey, model: currentModel, sessionId: input.sessionId,
    schema: openingSchema, schemaName: "learning_opening", effort: "high", maxTokens: 32_000,
    system: [
      "你是 River 的章节导入设计器。",
      "positioning 必须回答：这一章在本课程、本学期学习进程中起什么作用。不要写成学科地位的泛泛介绍。",
      "如果课件没有提供学期安排，可以用「从本章内容来看…」这类审慎表述推断，但不得编造教师要求、考试范围或先修课程。",
      "如果用户的学习基础与课件术语难度明显不匹配，要把这个差异写进 positioning 或 prerequisites，而不是降低正文完整度。",
      "learningPath 必须是真实的知识推进顺序，引用真实小节或小节组，不要写宣传语。",
      "prerequisites 是所有对整章学习有用的提示：入门前置、关键术语、阅读方法、计算或复习方法。只放整章级提示，具体知识点的提示不要放这里。数量按真实需要，不要机械凑数。",
      "clusters 是「本章包含」的簇级清单：按课件顺序覆盖全部小节，可以合并相邻小节成一个簇，但不得改变顺序、遗漏小节或凭空增加簇。每个 title 必须是简洁的名词短语，不要写解释句。",
    ].join("\n"),
    user: [
      profileText,
      "",
      "章节结构：",
      JSON.stringify(sections.map((section) => ({ id: section.id, title: section.title, role: section.role, pages: pageRangeLabel(section), summary: section.summary }))),
      "",
      "正文结构：",
      bodyOutline,
      "",
      "Learning Outcomes（课件原文）：",
      JSON.stringify(chapterMap.learningOutcomes || []),
      "练习题（课件原文）：",
      JSON.stringify(chapterMap.exercises || []),
    ].join("\n"),
  });
  const opening = openingResponse.data;
  usages.push(openingResponse.usage);

  report(66, "正在生成完整目录…", { stage: "MERGING", totalSections: sections.length, completedSections: sections.length });
  const directoryResponse = await deps.generateStructured({
    provider, apiKey: input.apiKey, model: currentModel, sessionId: input.sessionId,
    schema: directorySchema, schemaName: "chapter_directory", effort: "high", maxTokens: 96_000,
    system: [
      "你是 River 的本章目录生成器。",
      "本章目录不是简要提纲，而是一份全量详表：每一节都要有小节标题、角色、页码、这一节的内容定位、重要概念、主要解释、重要例子、规则与必要细分。",
      "必须覆盖给出的每一个小节，一个都不能少，顺序必须与课件一致。",
      "详细程度参照「重点、难点与学习推进」：每节至少包含标题之外的真实解释和必要例子，不允许只写一句概括。",
      "页码必须来自章节结构，不能编造。",
      LAYOUT_RULES,
    ].join("\n"),
    user: [
      "章节结构：",
      JSON.stringify(sections.map((section) => ({ id: section.id, title: section.title, role: section.role, pages: pageRangeLabel(section), summary: section.summary, keyPoints: section.keyPoints, examples: section.examples }))),
      "",
      "正文结构（用于对齐内容深度）：",
      bodyOutline,
      "",
      "课件节选：",
      deps.compactSource(input.sourceText, 60_000),
    ].join("\n"),
  });
  const directory = directoryResponse.data;
  usages.push(directoryResponse.usage);

  report(78, "正在筛选学习目标…", { stage: "MERGING", totalSections: sections.length, completedSections: sections.length });
  const goalsResponse = await deps.generateStructured({
    provider, apiKey: input.apiKey, model: currentModel, sessionId: input.sessionId,
    schema: goalsSchema, schemaName: "learning_goals", effort: "high", maxTokens: 48_000,
    system: [
      "你是 River 的学习目标生成器。",
      "学习目标不是摘要，而是「掌握本章核心内容后，用户应该能够理解、判断、解释、比较或完成什么」。",
      "核心内容判断必须综合五类信号：教师或课件明确说明的重点（最高优先级）、结构信号（被后文引用、对比组、规则与例外、贯穿概念）、评估信号（练习、案例、计算题）、篇幅信号（同章相对占比，仅作辅助）、结构串联信号（能否串起整章逻辑）。",
      "目标数量由核心概念密度决定，每簇允许 0 到 N 条，禁止固定每簇几条。",
      "不要为了填满某个簇而编造目标；没有值得单独列出的核心任务就留空。",
      "每条目标必须给出真实 reason 和 sourceRefs；证据不足时设置 uncertaintyReason，说明具体原因（例如课件只简单提及、缺少例题、归属不明确），不要写「AI 不太确定」。",
      "chapterGoal 必须恰好一条，且必须是任务形态：给定什么情境 → 做什么判断或操作 → 输出什么结论。它不能是口号。",
      "goals 中每条 clusterId 必须是给定簇 id 之一；如果目标横跨全章，放进 chapterGoal；如果只跨两簇，归入主概念所在簇，不要重复出现。",
      "簇标题由系统提供，绝对不能改写；输出只需要 clusterId。",
    ].join("\n"),
    user: [
      profileText,
      "",
      "本章包含簇（唯一分组骨架，id 与 title 由系统固定）：",
      JSON.stringify(opening.clusters),
      "",
      "章节结构：",
      JSON.stringify(sections.map((section) => ({ id: section.id, title: section.title, role: section.role, pages: pageRangeLabel(section), summary: section.summary }))),
      "",
      "Learning Outcomes：",
      JSON.stringify(chapterMap.learningOutcomes || []),
      "练习与案例：",
      JSON.stringify(chapterMap.exercises || []),
      "",
      "正文结构：",
      bodyOutline,
    ].join("\n"),
  });
  const goals = goalsResponse.data;
  usages.push(goalsResponse.usage);

  report(88, "正在生成导入问题与参考答案…", { stage: "MERGING", totalSections: sections.length, completedSections: sections.length });
  const questionsResponse = await deps.generateStructured({
    provider, apiKey: input.apiKey, model: currentModel, sessionId: input.sessionId,
    schema: questionsSchema, schemaName: "intro_questions", effort: "high", maxTokens: 64_000,
    system: [
      "你是 River 的导入问题生成器。",
      "导入问题是学习目标的另一种表达：用户带着这些问题去知识树里找答案，理解之后应当能自然回答。",
      "问题必须指向课件重点、关键区分、规则条件、例外、方法或计算逻辑，禁止「本章有哪些知识点」「学习这一章有什么意义」这类空泛问题。",
      "问题形式不限，可以直接出现专业术语。",
      "每个簇 0 到 N 个问题，不要求与学习目标一一对应，数量由真正值得思考的疑问决定。",
      "每条问题必须配一条 referenceAnswer：基于课件内容，直接回答问题，必要时给出简短解释；不得编造课件未支持的结论。",
      "chapterQuestion 必须恰好一条，位于全部簇之前，引导整章核心任务；它同样需要参考答案。",
      "问题顺序必须跟随课件顺序。",
    ].join("\n"),
    user: [
      profileText,
      "",
      "本章包含簇：",
      JSON.stringify(opening.clusters),
      "",
      "学习目标：",
      JSON.stringify({ chapterGoal: goals.chapterGoal, goals: goals.goals }),
      "",
      "章节结构：",
      JSON.stringify(sections.map((section) => ({ id: section.id, title: section.title, role: section.role, pages: pageRangeLabel(section), summary: section.summary }))),
      "",
      "正文结构：",
      bodyOutline,
      "",
      "课件节选：",
      deps.compactSource(input.sourceText, 50_000),
    ].join("\n"),
  });
  const questions = questionsResponse.data;
  usages.push(questionsResponse.usage);

  report(96, "正在校验并整理生成结果…", { stage: "VALIDATING", totalSections: sections.length, completedSections: sections.length });

  const clusterIds = new Set(opening.clusters.map((cluster: any) => cluster.id));
  const goalItems = (goals.goals || []).filter((goal: any) => goal.clusterId && clusterIds.has(goal.clusterId));
  const questionItems = (questions.questions || []).filter((question: any) => question.clusterId && clusterIds.has(question.clusterId));

  const introduction = {
    noteId: "",
    mapSections: sections.map((section) => ({
      id: section.id, title: section.title, role: section.role,
      startPage: section.startPage, endPage: section.endPage,
      startSlide: section.startSlide, endSlide: section.endSlide,
      summary: section.summary,
    })),
    goals: [goals.chapterGoal?.text, ...goalItems.map((goal: any) => goal.text)].filter(Boolean),
    goalQuestions: [questions.chapterQuestion?.text, ...questionItems.map((question: any) => question.text)].filter(Boolean),
    positioning: opening.positioning,
    prerequisiteNotes: opening.prerequisites,
    clusters: opening.clusters,
    learningPath: opening.learningPath,
    chapterGoal: {
      id: "chapter-goal", clusterId: null,
      text: cleanText(goals.chapterGoal?.text),
      evidence: { sourceRefs: goals.chapterGoal?.sourceRefs || [], reason: goals.chapterGoal?.reason || "" },
      uncertaintyReason: goals.chapterGoal?.uncertaintyReason,
    },
    goalItems: goalItems.map((goal: any, index: number) => ({
      id: `goal-${index + 1}`, clusterId: goal.clusterId, text: cleanText(goal.text),
      evidence: { sourceRefs: goal.sourceRefs || [], reason: goal.reason || "" },
      uncertaintyReason: goal.uncertaintyReason,
    })),
    chapterQuestion: {
      id: "chapter-question", clusterId: null,
      text: cleanText(questions.chapterQuestion?.text),
      referenceAnswer: cleanText(questions.chapterQuestion?.referenceAnswer),
    },
    questionItems: questionItems.map((question: any, index: number) => ({
      id: `question-${index + 1}`, clusterId: question.clusterId,
      text: cleanText(question.text), referenceAnswer: cleanText(question.referenceAnswer),
    })),
    directory: (directory.entries || []).map((entry: any) => ({
      ...entry,
      blocks: (entry.blocks || []).map(normalizeBlock),
      subsections: (entry.subsections || []).map((subsection: any) => ({
        ...subsection,
        blocks: (subsection.blocks || []).map(normalizeBlock),
      })),
    })),
    generatedAt: new Date().toISOString(),
    userModified: false,
  };

  const usage = usages.reduce<UsageSummary>((sum, item) => ({
    inputTokens: sum.inputTokens + item.inputTokens,
    outputTokens: sum.outputTokens + item.outputTokens,
    cachedInputTokens: sum.cachedInputTokens + item.cachedInputTokens,
    estimatedCostUsd: sum.estimatedCostUsd + item.estimatedCostUsd,
    estimatedCost: sum.estimatedCost + item.estimatedCost,
    currency: item.currency,
  }), { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, estimatedCostUsd: 0, estimatedCost: 0, currency: "USD" });

  return {
    data: {
      introduction,
      tree: bodyTree,
      chapterMap,
      batchCount: batches.length,
      sections: sections.length,
    },
    usage,
    model: currentModel,
  };
}

export { pageRangeLabel, sourceForSection, batchSections, mergeBodyTrees, outlineOfTree, buildDirectoryNode };
