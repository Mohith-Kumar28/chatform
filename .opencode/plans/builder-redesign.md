# Builder Redesign — Youform-style UI/UX + Agentic Chat

## Problem (from visual audit, screenshots in /tmp/qa/audit/)

1. **Double chrome on builder**: app nav (`(app)/layout.tsx` → DashboardShell) stacks above the builder toolbar.
2. **"Settings" appears TWICE** in the header (tab + separate gear dialog button).
3. **Every tab has a different header** — Workflow/Results/Share/Integrate render their own headers with an abnormal "Back to builder" button top-right. Build/Theme/Settings have the tab pill; the other 4 don't.
4. **Build vs Workflow confusion** — no per-block logic/design affordances; user can't tell where to do what.
5. **Results page**: KPI cards wrap with an orphan card, no Submissions/Summary/Analytics tab structure like Youform, unclear empty states.
6. **Dashboard form cards aren't clickable** — only tiny Edit/Preview footer buttons work.
7. **Chat is NOT agentic**: `runAgentTurn` is dead code; the "AI" is a stateless question re-phraser that never sees the transcript or answers; off-topic respondent questions get canned template clarifies; `FileUploadControl` (attach UI) is dead code; `validation_error`/`upload_request` SSE events have no client listeners.
8. Settings exist in TWO parallel UIs (settings-panel.tsx vs settings-dialog.tsx) with non-identical coverage.

## Design target (from user's Youform screenshots)

One persistent builder header for ALL views: `←` + form title (left) · centered icon tab group (center) · preview-play, copy-link, open-live, Published/Publish (right). No app nav, no back-to-builder. Content switches under the same header.

Tabs: **Build · Workflow · Design · Integrate · Settings · Share · Results**

---

## Part A — Builder shell unification

### A1. Route the builder out of the app shell
- Move `apps/web/src/app/(app)/forms/[id]/page.tsx` → `apps/web/src/app/(builder)/forms/[id]/page.tsx` (sibling route group).
- New `apps/web/src/app/(builder)/layout.tsx`: same auth guard as DashboardShell (session check → redirect `/signin`) but renders `{children}` only — NO app nav.
- Delete the DashboardShell wrapper from the page. Result: builder owns the full viewport.

### A2. One header component for all views
- Rewrite `builder-client.tsx` header (L378–492) into a new `apps/web/src/components/builder/builder-header.tsx` used by every view:
  - Left: `←` (Link → /dashboard) + title + status badge (`v{n}`/draft) + save indicator.
  - Center: icon tab group — **Build** (Blocks icon), **Workflow** (GitBranch), **Design** (Palette), **Integrate** (Webhook), **Settings** (Cog), **Share** (Share2), **Results** (BarChart3) — Youform style (icon above label, active tab = bordered card).
  - Right: Preview play button (opens `/f/{slug}` new tab), copy-link button, "Published ✓" badge when published / "Publish" button when draft/dirty.
- Delete ALL per-view headers and every "Back to builder" button (builder-client L296–373 early-return branches collapse to content swaps).
- Delete `settings-dialog.tsx` (merged into Settings tab, see A4). Remove its trigger from the header.

### A3. Build + Workflow relationship (fix the confusion)
- Keep both tabs with obvious roles: Build = content (questions), Workflow = flow/branching.
- In Build's block inspector add a **Logic** button ("Branching → opens Workflow with this block selected").
- Workflow tab keeps the 3-pane collapsible canvas; add hint line: "This diagram shows how respondents move between questions. Click any node or wire to edit."

### A4. Settings tab → Youform-style sub-nav
- Rewrite `settings-panel.tsx` as 2-pane: left sub-nav (General · Interviewer · Access · On completion · Hidden fields & variables · Link & social), right content pane of toggle-rows (label + description + Switch, Youform screenshot style).
- Absorb everything from `settings-dialog.tsx` (captcha, password, hidden fields, variables, og/social) so nothing is lost; delete the dialog file.

### A5. Results tab → Youform-style
- Restructure `results-client.tsx`:
  - Top: segmented tabs **Submissions | Summary | Analytics** (left) + dark Download CSV button (right).
  - Submissions: Completed/Partial filter pills with counts; bordered table — one column per question (colored type icon + title) + Submitted At; row click opens detail (transcript + answers).
  - Summary: distribution cards. Analytics: KPI cards (fix 6-card wrap → 3×2) + drop-off funnel.

### A6. Share + Integrate polish
- Share: centered card with segmented tabs (Share link / Embed website / Embed email), dark Copy Link button, "make sure your form is published" hint (keep unpublished warning), social icon row.
- Integrate: keep webhook CRUD; restyle to match.

### A7. Theme tab → "Design"
- Rename tab; keep presets/colors/fonts; restyle rows to the Settings toggle-row pattern.

### A8. Tour updates
- Update `product-tour.tsx` builder steps + `data-tour` targets for the new header/tabs.

## Part B — Dashboard cards

- `dashboard-content.tsx`: whole card clickable (→ `/forms/{id}`), hover actions (Edit/Preview icons, delete stays hover-revealed), status pill + responses; remove footer buttons.

## Part C — Agentic chat (core product fix)

### C1. Give the AI conversation context
- `session-do.ts` `aiStreamMessage` (L240–269): build a transcript digest from the persisted messages (last ~20) + answered-answers summary + current block, and include it in the prompt. The DO already stores messages; it never includes them.
- `agent-prompts.ts buildSystemPrompt`: remove references to nonexistent tools (ask_question/record_answer); add transcript + answers sections; add off-topic rule: "If the respondent asks a question about the form or topic, answer it briefly (one sentence), then re-ask the current question. Never invent questions."

### C2. Conversational reply path for non-answers
- `recordInvalid` (session-do.ts L368–382): when AI enabled and input is invalid for the block, call `aiStreamMessage` with objective: "Respondent said: <text> — not a valid answer to <block>. Address what they said (answer simple questions using the form context), then kindly re-ask the current question." Fall back to `clarifyText` on failure; keep `maxClarificationsPerBlock` / `escalateAfterInvalid` behavior.

### C3. Wire the dead upload UI
- `chat-client.tsx`: render `FileUploadControl` (L394–479 — exists, never used) for `file_upload`/`signature` blocks (replace the "M7" placeholder); add 📎 attach button in the text composer for those blocks.
- `use-chat.ts`: add SSE listeners for `upload_request` (store spec → show attach control) and `validation_error` (inline hint under composer).

### C4. Ack + tone
- Ensure the next-question AI call in `advanceTo` (L439–442) includes the answer just given so acknowledgments are contextual ("Nice, Pro plan — quick one next…").

## Part D — Public chat polish
- Composer: rounded input + attach + send; cleaner bubble spacing; keep theming vars.

---

## Files touched
| File | Change |
|---|---|
| `apps/web/src/app/(builder)/layout.tsx` | NEW — auth-only layout |
| `apps/web/src/app/(builder)/forms/[id]/page.tsx` | MOVED from (app) |
| `apps/web/src/app/(app)/forms/` | DELETE old dir |
| `apps/web/src/components/builder/builder-header.tsx` | NEW — unified header |
| `apps/web/src/components/builder/builder-client.tsx` | Rewrite view switching; delete 4 headers |
| `apps/web/src/components/builder/settings-panel.tsx` | Rewrite as sub-nav 2-pane; absorb dialog |
| `apps/web/src/components/builder/settings-dialog.tsx` | DELETE |
| `apps/web/src/components/builder/results-client.tsx` | Restructure (Submissions/Summary/Analytics + table) |
| `apps/web/src/components/builder/share-client.tsx` | Segmented tabs + centered layout |
| `apps/web/src/components/builder/theme-panel.tsx` | Restyle (Design tab) |
| `apps/web/src/components/builder/workflow-client.tsx` | Hint line; minor polish only |
| `apps/web/src/app/(app)/dashboard/dashboard-content.tsx` | Clickable cards |
| `apps/web/src/components/tour/product-tour.tsx` | Update builder steps/targets |
| `apps/api/src/do/session-do.ts` | Transcript context + conversational reply path |
| `apps/api/src/lib/agent-prompts.ts` | Prompt rewrite |
| `apps/web/src/components/chat/chat-client.tsx` | Wire FileUploadControl; attach button; polish |
| `apps/web/src/components/chat/use-chat.ts` | `upload_request` + `validation_error` listeners |

## Execution order
1. A1+A2 (shell + unified header) — structural, everything lands inside it.
2. A4/A5/A6/A7 (tab content redesigns).
3. A3 + A8 (build/workflow affordances + tour).
4. Part B (dashboard cards).
5. Part C (agentic chat) — API first (C1/C2), then client (C3/C4).
6. Part D + final pass.

## Verification
- `pnpm typecheck && pnpm lint` green after each part.
- Browser (agent-browser): screenshot every tab — header identical across all 7 views; zero app-nav on builder; zero "Back to builder"; "Settings" appears exactly once.
- Dashboard: click card → opens builder.
- Agentic test: in preview, answer email then type "what is this form about?" → AI answers contextually and re-asks; upload a file on a file_upload block → answer recorded.
- Results: table shows question columns; Completed/Partial counts correct.
- Public form + preview regression: fully themed, full flow works.
