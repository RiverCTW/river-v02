# RIVER v0.1 — ARCHITECTURE

## 1. Overview

River v0.1 is a browser-based AI learning application. It implements the confirmed River flow:

`upload courseware → learning intent/level/purpose → learning opening → structured knowledge tree → editable outline → local AI actions → autosave → backup/restore`

The application is implemented in `river-v0.1/` and runs as a Vite frontend plus a lightweight Express API proxy.

## 2. Technology Stack

### Frontend

- React 19
- TypeScript
- Vite 8
- Zustand 5
- Dexie 4 + IndexedDB
- pdfjs-dist for PDF text extraction
- JSZip for PPTX slide XML extraction
- Native DOM UI with the confirmed Effie/Notability visual system ported from the existing HTML prototype

### Backend

- Node.js 24 (bundled runtime)
- Express 5
- OpenAI official JavaScript SDK
- Responses API
- Structured Outputs via `zodTextFormat`
- Zod schemas

### Development and Testing

- pnpm
- tsx
- Vitest
- Playwright test dependency
- In-app browser used for live UI verification and screenshots

## 3. System Architecture

```text
Browser (React)
  ├─ Library UI (Effie / Notability)
  ├─ Knowledge Tree Editor
  ├─ Upload + Learning Wizard
  ├─ IndexedDB persistence (Dexie)
  ├─ PDF parser (pdfjs-dist)
  ├─ PPTX parser (JSZip)
  └─ AI client (fetch)
        │
        ▼
Local / deployed Express API
  ├─ /api/health
  ├─ /api/ai/validate-key
  ├─ /api/ai/opening
  ├─ /api/ai/tree
  ├─ /api/ai/regenerate
  ├─ /api/ai/simplify
  ├─ /api/ai/expand
  └─ temporary OpenAI key forwarding
        │
        ▼
OpenAI Responses API
  └─ gpt-6-luna
```

## 4. AI Model

### Confirmed official information

OpenAI official documentation confirms:

- Model ID: `gpt-6-luna`
- Position: efficient model for focused, high-volume tasks
- Endpoint: Responses API (`v1/responses`)
- Structured outputs: supported
- Function calling: supported
- Context window: 1,050,000 tokens
- Max output: 128,000 tokens
- Knowledge cutoff: May 18, 2026
- Pricing: $0.10 / 1M input tokens, $0.50 / 1M output tokens
- Cached input: $0.01 / 1M
- Cache writes: $0.125 / 1M
- Input: text, image
- Output: text

### Provider abstraction

- `DEFAULT_MODEL = "gpt-6-luna"` in `server/ai.ts`.
- The model is user-configurable in Settings.
- The app does not silently switch models if the requested model is unavailable.
- The real API error is returned and shown in the UI.

## 5. AI Request Flow

1. User enters their own API key in Settings.
2. Key remains only in page memory.
3. Each AI request sends the key in the `x-openai-api-key` header.
4. Express uses the key only for that request.
5. Express calls the OpenAI Responses API with a strict Zod schema.
6. Response usage is converted into token and cost estimates.
7. Validated structured data is written to IndexedDB.
8. Invalid or failed responses are not written to the knowledge tree.

## 6. Data Model

### Folder

`id`, `parentId`, `name`, `order`, `createdAt`, `updatedAt`

### Note

`id`, `folderId`, `title`, `uiStyle`, `createdAt`, `updatedAt`, `deletedAt`

### SourceDocument

`id`, `noteId`, `fileName`, `mimeType`, `fileSize`, `kind`, `pages`, `slides`, `parseStatus`, `parseError`, `textCharCount`, `createdAt`, original attachment metadata

### LearningProfile

`noteId`, `intent`, `level`, `customLevel`, `purpose`, `customPurpose`, `goalStyle`, timestamps

### LearningIntroduction

`noteId`, `mapSections`, `goals`, `goalQuestions`, `positioning`, `prerequisiteNotes`, `generatedAt`, `userModified`

### KnowledgeNode

`id`, `noteId`, `parentId`, `order`, `title`, `nodeType`, `collapsed`, `sourceRefs`, `userModified`, timestamps

### ContentBlock

`id`, `nodeId`, `noteId`, `order`, `type`, `text`, `sourceRefs`, `userModified`, timestamps

Content block types:

`definition`, `explanation`, `example`, `supplement`, `formula`, `understanding`, `pitfall`, `source`

### AIRequestRecord

`id`, `noteId`, `operation`, `model`, `inputTokens`, `outputTokens`, `cachedInputTokens`, `estimatedCostUsd`, `status`, `error`, `createdAt`

### AppSetting

`key`, `value`, `updatedAt`

API keys are deliberately not part of this model.

## 7. Persistence

- IndexedDB database name: `river-v0.1`
- Dexie schema version: 1
- Data persists across page refresh and browser restart.
- Autosave writes knowledge nodes and blocks after a debounce.
- The UI only shows `已保存` after the IndexedDB transaction succeeds.
- Save failures show `保存失败`.
- Seed data is idempotent and protected by a `seed-v1` setting.
- Legacy duplicate seed data is safely cleaned only for built-in seed names.

## 8. Backup and Restore

Backup format:

```json
{
  "format": "river-backup",
  "version": 1,
  "exportedAt": "ISO-8601",
  "folders": [],
  "notes": [],
  "sources": [],
  "profiles": [],
  "introductions": [],
  "nodes": [],
  "blocks": [],
  "settings": []
}
```

- Original attachments up to 5MB per file are embedded as base64 when possible.
- Larger attachments are marked as omitted.
- Import validates format/version, then clears and restores in a single IndexedDB transaction.
- Import requires explicit user confirmation before overwriting.
- A clipboard-based backup/restore path is available for safe round-trip testing.

## 9. Security

- No API key in source code.
- No API key in Git.
- No API key in URL.
- No API key in logs.
- No API key in localStorage or IndexedDB.
- API key is memory-only and must be re-entered after refresh.
- Backend never persists the key.
- Request size limited to 3MB JSON.
- AI requests have a 120-second timeout and one retry.
- Rate limiting is applied per key suffix and operation.
- Errors are surfaced without echoing the key.

## 10. Deployment

### Local development

- Frontend: `http://127.0.0.1:5174/`
- API: `http://127.0.0.1:8788/`

### Local production

- Build: `pnpm build`
- Start: `PORT=8790 NODE_ENV=production pnpm start`
- URL: `http://127.0.0.1:8790/`

### Temporary public HTTPS

- Temporary tunnel: `https://surrey-mines-joseph-care.trycloudflare.com`
- Tunnel forwards to the production server on port 8790.
- This is a temporary testing URL, not a stable hosted deployment.
- A stable deployment requires a hosting account or another persistent tunnel.

## 11. Known Gaps and Future Work

- Live GPT-6 Luna generation was not fully executed because no user API key was provided and the current environment timed out reaching the OpenAI API with a fake key.
- Safari was not available for automated testing.
- Drag-and-drop node reordering uses up/down buttons in v0.1; native drag-and-drop is a future enhancement.
- Favorites and recent-use navigation are UI placeholders; real filtering is a future enhancement.
- Full annotation/scribble layer, structured knowledge graph, cloud sync, accounts and team collaboration are deferred to later versions.
- Large initial frontend bundle is 382KB minified; PDF/PPTX parsers are already lazy-loaded.
