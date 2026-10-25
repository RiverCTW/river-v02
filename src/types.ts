export type UIStyle = "effie" | "notability";
export type UserRole = "admin" | "user";
export type GenerationState = "draft" | "sources_ready" | "generating" | "completed" | "failed";
export type LearningMapKind = "requirements" | "questions";
export type ChatAnswerMode = "sources" | "expanded";

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  createdAt: string;
}

export type AIProvider = "openai" | "deepseek" | "opencode-go";

export type LearningIntent =
  | "overview"
  | "rough"
  | "detailed"
  | "mastery";

export type UserLevel =
  | "zero"
  | "related"
  | "some"
  | "professional";

export type LearningPurpose =
  | "curiosity"
  | "systematic"
  | "homework"
  | "presentation"
  | "exam"
  | "custom";

export type GoalStyle = "question" | "statement";

export type ParseStatus = "pending" | "parsing" | "parsed" | "partial" | "failed";

export type ContentBlockType =
  | "definition"
  | "explanation"
  | "example"
  | "supplement"
  | "formula"
  | "understanding"
  | "pitfall"
  | "source"
  | "quote"
  | "comment"
  | "annotation"
  | "code"
  | "divider"
  | "importantTips"
  | "referenceAnswer"
  | "placeholder";

export type ListType = "bullet" | "ordered";

export type NodeType = "root" | "chapter" | "topic" | "knowledge" | "exercise" | "extension";

export type EditorDocumentMarks = {
  type: string;
  attrs?: Record<string, unknown>;
};

export type EditorDocumentSnapshot = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: EditorDocumentSnapshot[];
  marks?: EditorDocumentMarks[];
  text?: string;
};

export interface SourceReference {
  sourceId: string;
  pageNumber?: number;
  slideNumber?: number;
  quote?: string;
}

export interface Folder {
  id: string;
  parentId: string | null;
  name: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  deletedRootId?: string | null;
}

export interface Note {
  id: string;
  folderId: string | null;
  title: string;
  uiStyle: UIStyle;
  editorDoc?: EditorDocumentSnapshot;
  revision?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  favorite?: boolean;
  pinned?: boolean;
  lastOpenedAt?: string;
  generationState?: GenerationState;
  sourcesLockedAt?: string | null;
  profileLockedAt?: string | null;
  generatedAt?: string | null;
  copiedFromNoteId?: string | null;
  generationError?: string | null;
}

export interface SourcePage {
  pageNumber: number;
  text: string;
  charCount: number;
}

export interface SourceSlide {
  slideNumber: number;
  text: string;
  charCount: number;
}

export interface SourceDocument {
  id: string;
  noteId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  kind: "pdf" | "pptx";
  pages: SourcePage[];
  slides: SourceSlide[];
  parseStatus: ParseStatus;
  parseError?: string;
  textCharCount: number;
  createdAt: string;
  order?: number;
  sha256?: string;
  originalBlob?: Blob;
  originalBase64?: string;
  originalMimeType?: string;
  attachmentOmitted?: boolean;
}

export interface LearningProfile {
  noteId: string;
  intent: LearningIntent;
  level: UserLevel;
  customLevel?: string;
  purpose: LearningPurpose;
  customPurpose?: string;
  customization?: string;
  goalStyle?: GoalStyle;
  createdAt: string;
  updatedAt: string;
  lockedAt?: string | null;
}

export interface LearningMap {
  noteId: string;
  kind: LearningMapKind;
  editorDoc: EditorDocumentSnapshot;
  nodes: KnowledgeNode[];
  blocks: ContentBlock[];
  syncEnabled: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  noteId: string;
  role: "user" | "assistant";
  content: string;
  mode: ChatAnswerMode;
  status: "success" | "error";
  error?: string;
  createdAt: string;
}

export interface LearningMapSection {
  id: string;
  title: string;
  role: "intro" | "key" | "difficulty" | "exercise" | "extension";
  startPage?: number;
  endPage?: number;
  startSlide?: number;
  endSlide?: number;
  summary: string;
}

export interface LearningIntroduction {
  noteId: string;
  mapSections: LearningMapSection[];
  goals: string[];
  goalQuestions: string[];
  positioning: string;
  prerequisiteNotes: string[];
  clusters?: LearningCluster[];
  learningPath?: Array<{ title: string; detail: string }>;
  chapterGoal?: LearningGoalItem;
  goalItems?: LearningGoalItem[];
  chapterQuestion?: LearningQuestionItem;
  questionItems?: LearningQuestionItem[];
  directory?: DirectoryEntry[];
  generatedAt: string;
  userModified: boolean;
}

export interface LearningCluster {
  id: string;
  title: string;
}

export interface GoalEvidence {
  sourceRefs: SourceReference[];
  reason: string;
}

export interface DirectoryBlock {
  type: ContentBlockType;
  text: string;
  sourceRefs: SourceReference[];
}

export interface DirectoryEntry {
  sectionId: string;
  title: string;
  role: LearningMapSection["role"];
  startPage?: number;
  endPage?: number;
  startSlide?: number;
  endSlide?: number;
  blocks: DirectoryBlock[];
  subsections: Array<{ title: string; blocks: DirectoryBlock[] }>;
}

export interface LearningGoalItem {
  id: string;
  clusterId: string | null;
  text: string;
  evidence?: GoalEvidence;
  uncertaintyReason?: string;
}

export interface LearningQuestionItem {
  id: string;
  clusterId: string | null;
  text: string;
  referenceAnswer: string;
}

export interface KnowledgeNode {
  id: string;
  noteId: string;
  parentId: string | null;
  order: number;
  title: string;
  nodeType: NodeType;
  headingLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  listType?: ListType;
  collapsed: boolean;
  sourceRefs: SourceReference[];
  userModified: boolean;
  clusterId?: string | null;
  uncertaintyReason?: string;
  evidenceReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContentBlock {
  id: string;
  nodeId: string;
  noteId: string;
  order: number;
  type: ContentBlockType;
  text: string;
  listType?: ListType;
  sourceRefs: SourceReference[];
  userModified: boolean;
  collapsed?: boolean;
  meta?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AIRequestRecord {
  id: string;
  noteId?: string;
  operation: string;
  model: string;
  provider?: AIProvider;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  estimatedCostUsd: number;
  estimatedCost?: number;
  currency?: "USD" | "CNY";
  status: "success" | "error";
  error?: string;
  createdAt: string;
}

export interface AppSetting<T = unknown> {
  key: string;
  value: T;
  updatedAt: string;
}

export interface NoteBundle {
  note: Note;
  source?: SourceDocument;
  sources?: SourceDocument[];
  profile?: LearningProfile;
  introduction?: LearningIntroduction;
  nodes: KnowledgeNode[];
  blocks: ContentBlock[];
}

export const intentLabels: Record<LearningIntent, string> = {
  overview: "最粗略地了解涉及什么",
  rough: "粗略了解每个部分",
  detailed: "比较完整地了解每一部分",
  mastery: "真正掌握课件内容",
};

export const levelLabels: Record<UserLevel, string> = {
  zero: "完全零基础",
  related: "有相关领域基础",
  some: "已经有所了解",
  professional: "具有较专业的背景",
};

export const purposeLabels: Record<LearningPurpose, string> = {
  curiosity: "好奇或一般了解",
  systematic: "系统学习",
  homework: "完成作业",
  presentation: "准备汇报或向他人讲解",
  exam: "准备考试",
  custom: "其他自定义用途",
};

export const blockTypeLabels: Record<ContentBlockType, string> = {
  definition: "定义",
  explanation: "解释",
  example: "例子",
  supplement: "补充",
  formula: "公式",
  understanding: "我的理解",
  pitfall: "易错点",
  source: "来源",
  quote: "引用",
  comment: "评论",
  annotation: "标注",
  code: "代码",
  divider: "分隔线",
  importantTips: "重要tips",
  referenceAnswer: "参考答案",
  placeholder: "占位",
};
