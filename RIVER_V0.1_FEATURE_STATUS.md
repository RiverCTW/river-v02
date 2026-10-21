# RIVER v0.1 — FEATURE STATUS

Status legend:

- **Completed** — implemented and verified in the running app.
- **Partial** — implemented, but a documented limitation or sub-feature remains.
- **Not completed** — deferred to a later version.

## P0 — Required for v0.1

| Feature | Status | Evidence / limitation |
| --- | --- | --- |
| Real runnable web app | Completed | Dev server `http://127.0.0.1:5174/`; production `http://127.0.0.1:8790/`; HTTPS tunnel `https://surrey-mines-joseph-care.trycloudflare.com` |
| Confirmed Effie-style main interface | Completed | Real React UI using ported prototype styles; screenshot `01-effie-library.jpg` |
| Confirmed Notability-style main interface | Completed | Real A4 paper UI; screenshot `02-notability-library.jpg` |
| Switch between both UI styles | Completed | Same 2 notes render as 2 Effie cards or 2 A4 papers |
| Folder CRUD | Completed | Create, rename, delete, expand/collapse, subfolder |
| Note CRUD | Completed | Create, open, rename, delete, restore, move, preview |
| Basic search | Completed | Search titles and node/block text |
| PDF upload and parsing | Completed | Real 6-page Chinese/English PDF parsed: 6 pages, 470 characters |
| PPTX upload and parsing | Completed | Real 4-slide Chinese/English PPTX parsed: 4 slides, 283 characters |
| Text-based courseware priority | Completed | PDF/PPTX text extraction supported |
| Scanned PDF limitation | Partial | Detected as low-text/partial and reported; visual parsing not implemented |
| Learning three questions | Completed | Intent, level, purpose, custom fields, goal style |
| AI learning opening | Completed code path, not live-verified with a key | Real `/api/ai/opening` call using Structured Outputs; requires user API key |
| AI structured knowledge tree | Completed code path, not live-verified with a key | Real `/api/ai/tree` call; Zod validation; requires user API key |
| Knowledge tree editor | Completed | Multi-level nodes, content blocks, editing, add/delete, collapse, indent/outdent, move up/down |
| Autosave | Completed | Text edit persisted after reload |
| Undo/redo | Completed | Add child: 4→5 nodes; undo 5→4; redo 4→5 |
| Per-user API key | Completed | Memory-only; sent per request; never persisted or logged |
| Backup export | Completed | JSON includes folders, notes, sources, profiles, introductions, nodes, blocks, settings |
| Backup import | Completed | Clipboard round-trip restored title, nodes, folders and edited text |
| Error prompts | Completed | Missing key, invalid parse, save failure, API errors |
| Public HTTPS test access | Completed | Cloudflare quick-tunnel URL; stable hosting still needs an account/host |

## P1 — High-value features

| Feature | Status | Evidence / limitation |
| --- | --- | --- |
| Regenerate same-level content | Completed UI/backend path | Calls `/api/ai/regenerate`; requires user key |
| Plain-language explanation | Completed UI/backend path | Calls `/api/ai/simplify`; requires user key |
| Expand next level | Completed UI/backend path | Calls `/api/ai/expand`; requires user key |
| AI result confirmation | Completed | Apply/discard preview; AI never overwrites automatically |
| Node reorder | Partial | Up/down buttons implemented; native drag-and-drop deferred |
| Collapse/expand | Completed | Per-node collapse state |
| Undo/redo completeness | Partial | Basic structural undo/redo; advanced text-history merging deferred |
| AI usage and cost | Completed | Tokens and estimated cost recorded in IndexedDB |
| Semantic markers | Completed | `**`, `++`, `*`, `~~` preserved in text; rendered in preview |
| Source page/slide references | Partial | Data model supports `sourceRefs`; UI display is basic |
| Favorites | Partial | Navigation exists; persistent favorite filtering deferred |
| Recent use | Partial | Navigation exists; persistent recent filtering deferred |

## P2 — Deferred

| Feature | Status |
| --- | --- |
| Complex scribble | Not completed |
| Advanced annotation layer | Not completed |
| Full structured knowledge graph | Not completed |
| Long-term user preference learning | Not completed |
| Cloud note sync | Not completed |
| Accounts and team collaboration | Not completed |
| Native macOS app / DMG | Not completed |
| Mobile portrait layout | Not completed |
| Advanced animation system | Not completed |
| Commercial billing infrastructure | Not completed |

## Important Honest Limitations

1. No OpenAI API key was supplied in this environment.
2. `gpt-6-luna` was verified as a real official model via OpenAI Docs.
3. Real AI generation endpoints are implemented and validated with schema checks, but live generation was not completed in this environment.
4. A fake-key request to the OpenAI API timed out from this environment; the real error was surfaced rather than faked.
5. Safari was not available for automated verification. Chrome/Chromium behavior was verified through the in-app browser.
6. The public HTTPS URL is a Cloudflare quick tunnel. A stable production URL requires a hosting account or persistent tunnel.
