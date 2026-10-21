# RIVER v0.1 — TEST REPORT

Test date: 2026-10-14

## 1. Environment

- macOS 15.6 (24G84)
- Node.js 24.19.0 bundled runtime
- pnpm 11.25.0
- Vite 8.3.4
- TypeScript 7.0.2
- React 19.3.0
- Express 5.3.0
- OpenAI SDK 7.32.0
- Dev server: `http://127.0.0.1:5174/`
- API: `http://127.0.0.1:8788/`
- Production server: `http://127.0.0.1:8790/`
- Public HTTPS tunnel: `https://surrey-mines-joseph-care.trycloudflare.com`

## 2. Static and Build Tests

| Test | Result | Details |
| --- | --- | --- |
| TypeScript compile | Passed | `pnpm exec tsc --noEmit` returned no errors |
| Production build | Passed | `pnpm build` completed successfully |
| Lazy PDF/PPTX chunks | Passed | PDF parser and PPTX parser split into separate chunks |
| API health | Passed | `/api/health` returned `ok: true` and `gpt-6-luna` |
| Production static serving | Passed | `http://127.0.0.1:8790/` served built `dist/index.html` |
| HTTPS tunnel | Passed | `https://surrey-mines-joseph-care.trycloudflare.com` served the production app and API |

## 3. Library and UI Tests

| Test | Result | Details |
| --- | --- | --- |
| Effie library renders | Passed | 2 folders, 2 note cards |
| Notability library renders | Passed | 2 folders, 2 A4 paper cards |
| Style switch preserves data | Passed | Same 2 notes rendered as Effie cards or A4 papers |
| Folder seed dedupe | Passed | Legacy duplicates cleaned to 2 folders |
| Note seed dedupe | Passed | Legacy duplicates cleaned to 2 notes |
| Preview first content | Passed | Note list shows real first content block |
| Open note editor | Passed | Double-click opens knowledge tree editor |

## 4. Knowledge Tree Tests

| Test | Result | Details |
| --- | --- | --- |
| Multi-level seed tree | Passed | 3 seed nodes + content blocks per sample note |
| Add child node | Passed | Node count 4→5 |
| Undo | Passed | Node count 5→4 |
| Redo | Passed | Node count 4→5 |
| Edit block text | Passed | Controlled textarea updated state |
| Autosave | Passed | Save status reached `已保存` |
| Reload persistence | Passed | Edited text persisted after page reload and reopen |
| 120-node performance test | Passed | Room generated 121 nodes / 110 blocks in ~2.8 seconds |
| Collapse/expand | Passed | Per-node collapse state |
| Delete node | Implemented | Deletes node and descendants; available in editor |

## 5. Courseware Parsing Tests

| Test | Result | Details |
| --- | --- | --- |
| Chinese/English PDF | Passed | 6 pages, 470 extracted characters, status `parsed` |
| Chinese/English PPTX | Passed | 4 slides, 283 extracted characters, status `parsed` |
| Page/slide order | Passed | PDF page numbers and PPTX slide order preserved |
| Corrupt PDF | Passed | Returned `解析失败` and surfaced an error instead of pretending success |
| Scanned/image-heavy PDF | Partial by design | Low-text PDF detected as partial; visual parsing not implemented in v0.1 |

## 6. Backup and Data Safety Tests

| Test | Result | Details |
| --- | --- | --- |
| Backup payload creation | Passed | 2 folders, 2 notes, 8 nodes, 8 blocks, 2 sources |
| Original attachment embedding | Passed | Source attachments embedded as base64 within limit |
| Backup JSON copy | Passed | Clipboard payload contained the edited text |
| Backup restore | Passed | Modified title rolled back; original title and edited text restored |
| Folder restoration | Passed | Folder structure restored |
| Node/block restoration | Passed | Nodes and blocks restored |
| Import confirmation | Passed | Destructive overwrite blocked behind confirmation |

## 7. AI and Error Tests

| Test | Result | Details |
| --- | --- | --- |
| Missing API key UI | Passed | Toast: configure API key before AI action |
| Missing API key backend | Passed | API returned a clear missing-key error |
| Invalid fake key | Real error surfaced | OpenAI request timed out from this environment; no fake success was returned |
| GPT-6 Luna official availability | Verified | Official OpenAI Docs confirm `gpt-6-luna` and its Responses API support |
| Structured output schemas | Implemented | Zod schemas for opening, tree, regenerate, simplify, expand |
| AI overwrite protection | Implemented | Results require apply/discard confirmation |

## 8. Browser Compatibility

| Browser | Status | Details |
| --- | --- | --- |
| Chromium / in-app browser | Passed | Full UI, parsing, editing, backup tests executed |
| macOS Chrome | Expected | Same Chromium engine; not separately launched in this environment |
| macOS Safari | Not verified | Safari automation was not available in this environment |

## 9. Tests Not Completed

- Live GPT-6 Luna generation with a real user API key.
- Real Safari browser automation.
- Native drag-and-drop node reordering (up/down buttons are implemented).
- Favorites and recent-use filtering.
- Full structured annotation/scribble layer.
- Stable production hosting beyond the Cloudflare quick tunnel.

## 10. OpenCode Go and cc-switch Tests - 2026-10-15

| Test | Result | Details |
| --- | --- | --- |
| OpenCode Go model list | Passed | Real `deepseek-v4.1-flash` model listed by `https://opencode.ai/zen/go/v1/models` |
| Responses endpoint | Passed | Real response returned; OpenCode requires `x-opencode-session` |
| Chat Completions endpoint | Passed | Real plain-text response `OK` |
| JSON object output | Passed | Real response returned `{"text":"OK"}` |
| River key validation | Passed | Local River production API validated `deepseek-v4.1-flash` through cc-switch |
| River simplify workflow | Passed | Local production API returned a real OpenCode Go explanation for 机会成本 |
| Key browser exposure | Passed | Settings page keeps the key input empty; cc-switch key is not returned by the server |
| Public cc-switch request | Blocked | Public HTTPS request returned `缺少 API Key` instead of reading the local cc-switch key |
| Automated tests | Passed | 4 files, 11 tests |

OpenCode Go pricing is recorded as subscription usage rather than an invented USD estimate.

## 11. Safari Upload Compatibility - 2026-10-16

| Test | Result | Details |
| --- | --- | --- |
| FileReader upload path | Passed | PDF/PPTX now read through `FileReader.readAsArrayBuffer()` first |
| Original File storage | Replaced | A copied memory Blob is stored instead of the Safari-scoped File |
| IndexedDB fallback | Implemented | Storage failure keeps parsed text and omits the raw attachment |
| Upload exception handling | Implemented | Failures return to River UI instead of interrupting the page |
| Production PDF parse | Passed | 44-page PDF parsed with 16867 extracted characters |
| Build and tests | Passed | Build passed; 4 files, 11 tests |

## 12. Test Conclusion

River v0.1 is a real runnable web application with real local persistence, real PDF/PPTX parsing, real knowledge-tree editing, real backup/restore, and real AI provider routing. OpenCode Go has been verified end to end with the local cc-switch key. OpenAI live generation remains unverified because no OpenAI key is available in this environment. The application reports limitations accurately instead of faking results.
