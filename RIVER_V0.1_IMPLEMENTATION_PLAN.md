# RIVER v0.1 — IMPLEMENTATION PLAN

## 1. Current Project State

- No existing River web application source code was found in the workspace.
- Existing assets:
  - River product knowledge base: `outputs/river-product-knowledge-base.md`
  - River V2 knowledge base and requirement registry: `outputs/v2/`
  - Effie/Notability reverse-engineering documents: `outputs/v2/`
  - Existing two-style visual prototype: `/Users/river/.codex/visualizations/2026/08/24/01a0336a-e46e-7733-b365-6c87bbc6c914/main-interfaces-effie-notability.html`
  - OCR and research materials in `work/`
- The visual prototype is the source of truth for the Effie and Notability main-interface look. It will be ported into React components and kept visually consistent.

## 2. Product Goal

River v0.1 must support the full real flow:

`upload courseware → set learning intent/level/purpose → AI generate learning opening → AI generate structured knowledge tree → edit tree freely → request local AI help → autosave → reopen and continue → export/import backup.`

The app must be a real browser application, not a static demo.

## 3. Technical Decisions

### Frontend

- React 18 + TypeScript + Vite.
- Zustand for in-memory application state.
- Dexie + IndexedDB for local persistence.
- React components ported from the existing `main-interfaces-effie-notability.html` visual prototype.
- CSS variables and class naming derived from the prototype, adapted into a single River design system.

### Backend

- Node.js + Express + TypeScript.
- OpenAI official JavaScript SDK (`openai`).
- Responses API with `gpt-6-luna`.
- Structured Outputs with strict JSON Schema.
- Backend is a lightweight proxy only:
  - API key arrives per request in the `x-openai-api-key` header.
  - Key is used only for that request.
  - Key is never persisted, logged, embedded in the bundle, or written to the repository.
  - Request size, timeout, and retry limits are enforced.
- Vite dev proxy sends `/api` to the local backend.

### File Parsing

- PDF: `pdfjs-dist` in the browser, page-by-page text extraction.
- PPTX: `jszip` unzips the file and reads `ppt/slides/slideN.xml` in slide order.
- Parsed output is structured as source pages/slides with page/slide numbers.
- Text-based PDF/PPTX is the supported v0.1 path.
- Scanned/image-heavy PDF is detected as low-text and marked as not fully supported, with a clear status instead of pretending success.

### AI Provider Abstraction

- `OpenAIProvider` uses `gpt-6-luna` by default.
- `MockProvider` exists only for automated tests and offline UI verification. It is clearly labelled and never presented as a real GPT-6 Luna result.
- If `gpt-6-luna` errors, the real API error is surfaced. The app does not silently switch models.
- The model name is configurable in Settings for future provider changes.

### Validation

- Zod schemas for:
  - `LearningProfile`
  - `LearningIntroduction`
  - `KnowledgeTree`
  - `KnowledgeNode`
  - `ContentBlock`
  - `SourceReference`
  - AI request/usage records
- Invalid AI output is rejected and shown as an error, never written to IndexedDB.

## 4. Data Model

- `Folder`: id, parentId, name, order, createdAt, updatedAt.
- `Note`: id, folderId, title, uiStyle, createdAt, updatedAt, deletedAt.
- `SourceDocument`: id, noteId, fileName, mimeType, fileSize, kind, pages, slides, parseStatus, parseError, createdAt, originalBlob?.
- `LearningProfile`: noteId, intent, level, customLevel, purpose, customPurpose, goalStyle.
- `LearningIntroduction`: noteId, map sections, goals, positioning, userModified, generatedAt.
- `KnowledgeNode`: id, noteId, parentId, order, title, nodeType, collapsed, sourceRefs, userModified, createdAt, updatedAt.
- `ContentBlock`: id, nodeId, type, text, sourceRefs, userModified, createdAt, updatedAt.
- `AIRequestRecord`: id, noteId, operation, model, inputTokens, outputTokens, estimatedCost, status, error, createdAt.
- `AppSetting`: key, value.

API keys are intentionally not part of the persisted data model.

## 5. Module Plan and Order

1. Project scaffold and build pipeline.
2. Design-system port from the existing visual prototype.
3. Dexie database, schemas and backup service.
4. Library shell with real folder/note CRUD, search, style switching.
5. Knowledge tree editor with real persistence, undo and autosave.
6. PDF/PPTX upload and parsing.
7. Learning three-question wizard.
8. OpenAI backend proxy and structured-output schemas.
9. Learning opening generation.
10. Two-stage knowledge-tree generation.
11. Local AI actions: regenerate same level, plain language, expand.
12. Backup import/export and recovery.
13. Tests, production build, local run, optional HTTPS tunnel.

## 6. Implementation Risks

- `gpt-6-luna` requires a valid user API key; without a user key live AI cannot be verified. The real API error must be shown.
- Long courseware can exceed context or cost limits. v0.1 will chunk content and generate chapter-by-chapter.
- Browser PDF text extraction may be incomplete for scanned PDFs. This will be flagged, not hidden.
- Safari may differ in contenteditable, IndexedDB and file APIs. Browser testing must be explicit.
- HTTPS deployment needs an external host or tunnel. If credentials or paid services are required, the app will still run locally and this will be reported.

## 7. Testing Plan

- Unit tests for schemas, tree operations, backup serialization.
- Integration tests for Dexie persistence and CRUD.
- Browser tests for library, style switching, editor keyboard operations, autosave and reload.
- Parser tests with real text PDF and PPTX fixtures.
- API tests with real key when available; explicit error-path tests without key.
- End-to-end acceptance test matching the brief.

## 8. Definition of Done for v0.1

- App runs in Chrome and Safari (Chrome verified locally; Safari verified if available).
- Two UI styles use the same folder/note data.
- PDF and PPTX text parsing works for text-based courseware.
- Learning three questions are real inputs to AI.
- Learning opening and structured knowledge tree are generated and validated.
- Tree editing, autosave, undo, refresh recovery and backup/import work.
- API key is memory-only and never persisted or logged.
- Feature status, architecture, test report and user guide are delivered.

## 9. Execution Status — 2026-10-14

- Project scaffold and dependencies: completed.
- Effie and Notability library UI: completed.
- Folder/note CRUD and search: completed.
- PDF and PPTX parsing: completed with real Chinese/English fixtures.
- Learning three questions: completed.
- Learning opening and knowledge-tree AI code paths: completed; live generation requires user API key.
- Knowledge-tree editing, autosave, undo/redo: completed.
- AI local actions: completed UI/backend paths; live generation requires user API key.
- Backup export/import and clipboard round-trip: completed.
- Production build: completed.
- Temporary HTTPS tunnel: completed.
- Chrome/Chromium verification: completed.
- Safari verification: not completed in this environment.
- Remaining external dependency for full acceptance: a real user OpenAI API key with `gpt-6-luna` access.
