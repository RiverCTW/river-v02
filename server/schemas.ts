import { z } from "zod";

export const sourceReferenceSchema = z.object({
  sourceId: z.string(),
  pageNumber: z.number().int().positive().optional(),
  slideNumber: z.number().int().positive().optional(),
  quote: z.string().max(500).optional(),
});

export const contentBlockSchema = z.object({
  type: z.enum([
    "definition",
    "explanation",
    "example",
    "supplement",
    "formula",
    "understanding",
    "pitfall",
    "source",
    "quote",
    "comment",
    "annotation",
    "code",
    "divider",
  ]),
  text: z.string().min(1),
  sourceRefs: z.array(sourceReferenceSchema).max(12).default([]),
});

export type AIKnowledgeNode = {
  title: string;
  nodeType: "chapter" | "topic" | "knowledge" | "exercise" | "extension";
  sourceRefs: z.infer<typeof sourceReferenceSchema>[];
  blocks: z.infer<typeof contentBlockSchema>[];
  children: AIKnowledgeNode[];
};

export const knowledgeNodeSchema: z.ZodType<AIKnowledgeNode> = z.lazy(() =>
  z.object({
    title: z.string().min(1).max(220),
    nodeType: z.enum(["chapter", "topic", "knowledge", "exercise", "extension"]),
    sourceRefs: z.array(sourceReferenceSchema).max(12).default([]),
    blocks: z.array(contentBlockSchema).min(1).max(12),
    children: z.array(knowledgeNodeSchema).max(40).default([]),
  }),
);

export const knowledgeTreeSchema = z.object({
  title: z.string().min(1).max(220),
  summary: z.string().min(1).max(1200),
  nodes: z.array(knowledgeNodeSchema).min(1).max(60),
});

export const learningMapSectionSchema = z.object({
  title: z.string().min(1).max(220),
  role: z.enum(["intro", "key", "difficulty", "exercise", "extension"]),
  startPage: z.number().int().positive().optional(),
  endPage: z.number().int().positive().optional(),
  startSlide: z.number().int().positive().optional(),
  endSlide: z.number().int().positive().optional(),
  summary: z.string().min(1).max(800),
});

export const learningIntroductionSchema = z.object({
  mapSections: z.array(learningMapSectionSchema).min(1).max(40),
  goals: z.array(z.string().min(1).max(400)).min(1).max(12),
  goalQuestions: z.array(z.string().min(1).max(400)).min(1).max(16),
  positioning: z.string().min(1).max(2000),
  prerequisiteNotes: z.array(z.string().min(1).max(500)).max(20).default([]),
});

export const regenerateBlockSchema = z.object({
  text: z.string().min(1).max(6000),
  rationale: z.string().max(800),
});

export const simplifyBlockSchema = z.object({
  text: z.string().min(1).max(6000),
});

export const expandNodeSchema = z.object({
  explanation: z.string().min(1).max(6000),
  children: z.array(
    z.object({
      title: z.string().min(1).max(220),
      blocks: z.array(contentBlockSchema).min(1).max(6),
    }),
  ).max(10).default([]),
});

export const learningMapDocumentSchema = z.object({
  title: z.string().min(1).max(220),
  nodes: z.array(knowledgeNodeSchema).min(1).max(80),
});

export const fullLearningPackageSchema = z.object({
  introduction: learningIntroductionSchema,
  tree: knowledgeTreeSchema,
  requirements: learningMapDocumentSchema,
  questions: learningMapDocumentSchema,
});

export const chatResponseSchema = z.object({
  answer: z.string().min(1).max(20_000),
  citations: z.array(z.string().max(500)).max(20).default([]),
});

export const learningProfileSchema = z.object({
  intent: z.enum(["overview", "rough", "detailed", "mastery"]),
  level: z.enum(["zero", "related", "some", "professional"]),
  customLevel: z.string().max(500).optional(),
  purpose: z.enum(["curiosity", "systematic", "homework", "presentation", "exam", "custom"]),
  customPurpose: z.string().max(500).optional(),
  goalStyle: z.enum(["question", "statement"]).optional(),
});

export function flattenKnowledgeTree(tree: z.infer<typeof knowledgeTreeSchema>) {
  const flat: Array<{
    id: string;
    parentId: string | null;
    order: number;
    title: string;
    nodeType: AIKnowledgeNode["nodeType"];
    blocks: Array<{ id: string; type: string; text: string; sourceRefs: unknown[]; order: number }>;
  }> = [];

  const walk = (nodes: AIKnowledgeNode[], parentId: string | null) => {
    nodes.forEach((node, index) => {
      const id = crypto.randomUUID();
      flat.push({
        id,
        parentId,
        order: index,
        title: node.title,
        nodeType: node.nodeType,
        blocks: node.blocks.map((block, blockIndex) => ({
          id: crypto.randomUUID(),
          type: block.type,
          text: block.text,
          sourceRefs: block.sourceRefs,
          order: blockIndex,
        })),
      });
      walk(node.children, id);
    });
  };

  walk(tree.nodes, null);
  return flat;
}
