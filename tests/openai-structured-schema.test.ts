import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  chapterMapSchema,
  directorySchema,
  goalsSchema,
  knowledgeTreeSchema,
  openingSchema,
  questionsSchema,
} from "../server/schemas";

const schemas = {
  chapterMapSchema,
  knowledgeTreeSchema,
  openingSchema,
  directorySchema,
  goalsSchema,
  questionsSchema,
};

function assertAllFieldsRequired(node: any, path = "#") {
  if (!node || typeof node !== "object") return;
  if (node.type === "object" && node.properties) {
    const keys = Object.keys(node.properties);
    const required = new Set<string>(Array.isArray(node.required) ? node.required : []);
    for (const key of keys) {
      expect(required.has(key), `${path}/${key} must be required (use nullable, not optional)`).toBe(true);
      assertAllFieldsRequired(node.properties[key], `${path}/${key}`);
    }
  }
  if (node.items) assertAllFieldsRequired(node.items, `${path}/items`);
  for (const key of ["anyOf", "oneOf", "allOf"]) {
    if (Array.isArray(node[key])) node[key].forEach((child: any, index: number) => assertAllFieldsRequired(child, `${path}/${key}[${index}]`));
  }
}

describe("OpenAI structured output schemas", () => {
  for (const [name, schema] of Object.entries(schemas)) {
    it(`${name} makes every object field required`, () => {
      const json = z.toJSONSchema(schema, { io: "output" }) as any;
      assertAllFieldsRequired(json);
    });
  }
});
