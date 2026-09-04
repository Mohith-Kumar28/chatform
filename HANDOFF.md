# CHATFORM — ENGINEERING HANDOFF

**Date**: 2026-08-24 (session 2) · **Status**: Core vertical slice + builder Build/Theme/Settings views live. Read this fully before writing code.

---

## 1. What this product is

A Typeform/Youform competitor where the form-filling interface is an **agentic AI chatbot**: the respondent opens a form link and an AI interviewer greets them, asks questions one at a time, validates answers conversationally, handles conditional branching, file uploads, and payments. Admins build forms in a dashboard (blocks + logic graph + theme), track analytics (views, drop-off per question, partials), and get a **developer API** (`/v1`, API-key auth) so they can drive the chatbot headlessly from their own products.

Full product spec: `DESIGN.md` (frontend/UX, 558 lines) · `PLAN.md` (architecture + milestones M0–M11 + pricing).

## 2. User-mandated constraints (DO NOT violate)

1. **OpenAPI-first**: every API route described with `hono-openapi` (`describeRoute` + `validator` + `resolver`). Spec at `/openapi.json`, Scalar docs at `/docs`.
2. **No hand-written frontend API code**: all data fetching via **orval-generated** TanStack Query hooks (`pnpm gen:api` → `apps/web/src/lib/api/`). Types/hooks never manual.
3. **Zod everywhere** — shared schemas, validation at every boundary.
4. **shadcn/ui + Tailwind v4 mandatory** for all UI.
5. **Offload to Better Auth** — orgs/members/invites/roles via the organization plugin; never hand-roll what Better Auth ships (admin plugin, apiKey plugin next).
6. **AI = Vercel AI SDK (`ai`) + OpenRouter (`@openrouter/ai-sdk-provider`)** — single secret `OPENROUTER_API_KEY`, any model.
7. Stack: Turborepo+pnpn · Hono on Cloudflare Workers · **D1+Drizzle** (not MongoDB — Drizzle declined Mongo) · Better Auth · Dodo Payments · R2 presigned uploads · DO per chat session · SSE streaming.

## 3. Current state — COMPLETED & VERIFIED

### M0 — Foundation ✅
- Monorepo: `apps/{api,web}` + `packages/{form-schema,db,ui(empty),api-client(empty),config}`; TS project refs; turbo tasks.
- **`@repo/form-schema`** (the core artifact — 22 tests green): Zod `FormDoc` with 26 block types; recursive `ConditionGroup` (and/or, depth 5); `LogicRule` = goto (**with `from` field — scoped rules, prevents infinite loops**)/set_variable/add_score; deterministic logic engine (`resolveNext`, `applyLogicRules`, visibility-chain skipping); per-type answer validators (email/phone E.164/ranking permutations/matrix/file sizes/consent SHA-256); lint pass (dangling targets, missing values, ref regex, reachability); `toPublicBlock`/`toPublicConfig` projections.
- **`@repo/db`**: full D1 schema (~30 tables): better-auth core+orgs+api_keys (extended), workspaces, forms (working_schema TEXT + slug + active_version_id), form_versions (immutable snapshots + checksum), submissions + **submission_answers as normalized rows** (block_ref + value_number for per-question analytics), chat_sessions (respondent_token_hash, state_snapshot_json), chat_messages, files, webhooks+deliveries, integrations, templates, ai_generations, plans/dodo_customers/subscriptions/payments/dodo_events, usage_counters, analytics_rollup_daily, audit_logs, idempotency_keys. **2 migrations applied** (0001 added `accounts.issuer` required by Better Auth).
- `apps/api`: Hono app (`src/app.ts`) — cors on `/p/*` and `/api/*` (credentials), health, DO export, queue/cron handlers stubbed. Wrangler config has D1/KV/R2/3 queues/Analytics Engine/ratelimit (needs `simple:{limit,period}`!)/DO/cron.

### M4 slice — Chat runtime ✅ (browser-verified E2E twice)
- **`SessionDO`** (`apps/api/src/do/session-do.ts`): per-session FSM — INIT→greeting→ASKING→AWAITING→PARSING→(VALIDATING→CLARIFYING≤2→**ESCALATED_UI** after 3 invalid)→RECORDING→BRANCHING→next/ENDING→COMPLETED; idle alarm 30min→ABANDONED (partial saved); skip/stop/restart actions.
- **SSE with DURABLE replay**: every event persisted under `evt:{seq}` in DO storage (`stream()` replays from storage — in-memory buffer dies with the isolate; this was a real bug we fixed). Events: `session_ready` (per-connection, after replay), `user_message`, `message_start/token/end`, `question{block,progress}`, `validation_error`, `escalate_ui`, `answer_recorded`, `branch_jump`, `ending`, `complete{submissionId}`, `ping`.
- Template-mode NLU: fuzzy option-label matching, yes/no words, number extraction; deterministic validators; conversational clarify with escalating phrasing.
- Partial-save: `ensureSubmissionRow` + upsert into `submission_answers` per answer (async via `ctx.waitUntil`); finalize writes status/duration/search_text + enqueues `Q_WEBHOOKS` + AE datapoint.
- Public routes (`/p/*`): session create (Turnstile hook, form-open check), SSE (`?t=` token since EventSource can't set headers), messages (text|structured), actions, session status.
- **Verified**: seeded form → chat → email → "developer" fuzzy-matched → rating → ending → submission + answers in D1.

### M1 — Auth ✅ (curl-verified)
- Better Auth mounted `/api/auth/*` — `drizzleAdapter(db, { provider: "sqlite", schema, usePlural: true })` (**schema + usePlural REQUIRED**), email/password + auto sign-in, cookie cache 5min, origin-aware trustedOrigins.
- Organization plugin verified: create org (owner role), list orgs.
- Web: `/signin` (combined sign-in/up, creates default org on signup), `DashboardShell` (session guard + sign-out). **Use `window.location.assign` after auth changes — router.push races the session store.**

### M3 — Forms CRUD + Builder ✅ (API curl-verified; builder browser-verified)
- `routes/forms.ts`: `GET/POST /api/forms`, `GET /api/forms/:id`, `PUT /api/forms/:id/doc` (zod parse + lint, returns issues), `POST /api/forms/:id/publish` (lint-gated → version snapshot → active_version_id). All described with hono-openapi.
- Dashboard: form cards (status, responses) + create dialog — via generated hooks.
- **Builder v1** (`apps/web/src/components/builder/builder-client.tsx`, route `/forms/[id]`): 3-pane — left block list (numbered, required-star, hover delete) + 16-type add-block library; center flow preview cards; right inspector (title/description/required toggle/options editor/rating scale); **debounced autosave 800ms** via `usePutApiFormsByIdDoc`; Publish button (disabled while dirty) → reload on success. Verified: add block → edit title → autosave ("saved") → publish → new question live in chat session.

### OpenAPI + codegen pipeline ✅
- Spec: 8 paths at `/openapi.json`; Scalar UI `/docs`.
- `orval.config.ts` → `pnpm gen:api` → `apps/web/src/lib/api/{generated.schemas.ts,health,public,dashboard}`. **Mutator** (`mutator.ts`): credentials include, Headers-instance content-type dedupe (**duplicated Content-Type breaks Workers body parsing — this was a real bug**), JSON error envelope parsing → throws `ApiError(message, status)` (import it to branch on status codes).
- **To refresh the spec**: start `wrangler dev`, `curl :8787/openapi.json > openapi.json`, kill server, `pnpm gen:api`. The repo-root openapi.json is committed.

### Session 2 additions (2026-08-24 PM) ✅
- **AI-generate wired into dashboard**: "New form" dialog has tabs *Generate with AI* / *Start blank*. AI tab = prompt + question-count select → `usePostApiAiGenerateForm` → `POST /api/forms {title, doc}` → navigates into builder. Graceful errors for 503 (no key) and 502 (invalid generation). `POST /forms` now accepts an optional validated `doc`.
- **Escalate-UI fallback in chat client** (`chat-client.tsx` + `use-chat.ts`): `escalate_ui{ref}` tracked per-block as `escalatedRef`; composer shows a 💡 banner with per-type format hints (email/phone/url/number/date) and a "Skip this question →" action when allowed (`settings.navigation.allowSkip || escalated`) and `!block.required` (DO rejects skipping required anyway). Composer restructured to control-variable pattern.
- **Builder Settings view**: header segmented switcher Build/Theme/Settings. SettingsPanel edits `doc.settings`: progress bar, hide branding, agent mode/tone/persona prompt, allowSkip, closeAt datetime, maxSubmissions, closed message, duplicates strategy, redirect URL, notification emails. Autosaves via existing debounce.
- **Builder Theme view**: ThemePanel (4 presets, color pickers+hex inputs for all 6 tokens, radius select, heading/body fonts) + live mock-chat preview pane applying tokens instantly. Reset uses `ThemeDoc.parse({})`.
- **Shared theme tokens**: `apps/web/src/lib/chat-theme.ts` — `RADIUS_PX` map + `chatThemeVars(theme)` producing the scoped `--cf-*` vars incl. `--cf-radius` and font-family. ChatClient now consumes them too (**bubbles honor radius/fonts — preview ≡ production**); builder's ThemePreview uses the same helper.
- **dnd-kit drag-reorder** in builder block list (`SortableBlockRow`, PointerSensor 4px, keyboard sensor), reorder persists through autosave; browser-drag verified.
- **Fixed loose end #6**: dashboard invalidates `getGetApiFormsQueryKey()` now (was `["postApiForms"]` — never matched the list query).
- **Fixed settings-crash bug**: legacy/default docs stored `settings: {}` unvalidated → any consumer reading `settings.branding.*` crashed. `GET /forms/:id` now normalizes through `FormDoc.safeParse` before responding; `POST /forms` materializes defaults for the blank path too.
- Verified in browser: sign-in → AI dialog error path (503 message renders) → blank create navigates to builder → settings toggle autosave → drag reorder → publish → reordered flow live in chat E2E (email first → statement → ending).

### AI layer (foundation ✅, integration ⚠️ untested E2E)
- `lib/ai.ts`: `chatModel` (OpenRouter, default `openai/gpt-4o-mini`), `runAgentTurn` (streamText+tools), `generateFormDoc` (generateObject).
- `lib/agent-prompts.ts`: `buildSystemPrompt` (persona/tone + remaining-blocks manifest + hard rules), `buildValidationPrompt`, `buildFlowGeneratorPrompt`.
- **SessionDO AI integration**: `aiStreamMessage()` — when `OPENROUTER_API_KEY` set and mode≠template and under token budget, question phrasing streams REAL model tokens to SSE; falls back to template phrasing on error/budget; usage logged to `ai_generations` table; `sessionTokensUsed` degrades to template mode.
- `POST /api/ai/generate-form`: prompt → FormDoc (generateObject) → zod validate → 1 auto-fix pass feeding issues back → lint-gate → return doc+issues+tokens.

## 4. Known loose ends (exact, no guessing)

1. **AI chat mode never tested E2E** — needs `OPENROUTER_API_KEY` uncommented in `apps/api/.dev.vars`, then create session on a form with `settings.agent.mode:"ai"` and confirm streamed phrasing differs from template. Same key gates `/api/ai/generate-form` (UI + error paths verified; happy path not).
2. **Builder Logic tab missing** — xyflow v12 graph of blocks/endings with goto-rule edges + condition editor Sheet. No logic UI exists anywhere yet.
3. Builder: no live chat preview in Build view (static cards; Theme view has the mock preview), no block delete via inspector, ending-screen editor missing.
4. Dashboard: no delete/rename/duplicate form.
5. Skip E2E not browser-verified end-to-end (skip flag published but the skip-click path in chat was only code-reviewed).
6. Chat client ignores theme `colorScheme`/`avatarKey`/`backgroundImageKey` (no R2 wiring yet anyway).

## 5. Hard-won gotchas (each was a real bug — do not regress)

1. **Turbopack cannot rewrite `.js`→`.ts` through package exports** — form-schema uses extensionless relative imports (`from "./answers"`). Adding `.js` back breaks the Next build with "Module not found".
2. **orval `override.query.useQuery: true` turns ALL hooks (incl. POST/PUT) into useQuery** — removed; mutations now correct.
3. **Duplicated Content-Type** (fetcher sets `Content-Type` + mutator added another) → Workers body parser returns `{}` → validator 400. Mutator must use a `Headers` instance and only set content-type if absent.
4. **Better Auth**: adapter needs `schema` + `usePlural: true`; `accounts.issuer` column required (migration 0001); failed signups can leave orphaned users (delete before retry).
5. **CORS on `/api/*`** with `credentials: true` required for browser auth against :8787.
6. **SSE replay must read from DO storage** (`evt:` keys), never in-memory buffers.
7. **React strict-mode double-mount** → session create guarded by `pendingRef` promise pattern in `use-chat.ts`.
8. **Logic `goto` rules need `from`** or they fire after every answer → infinite loops.
9. **AI SDK v5 API**: `maxOutputTokens` (not maxTokens); tool-call parts expose `input` (not `args`); usage = `inputTokens`/`outputTokens`; `chatModel` needs explicit `LanguageModel` return type (TS4058 otherwise).
10. **hono-openapi `validator` requires `@hono/standard-validator`** package installed.
11. **wrangler ratelimits** binding requires `simple: { limit, period }` in wrangler.jsonc.
12. **D1 has no `readfile()`** — seed via SQL file with JSON inlined (`tooling/seed.sql`).
13. `pnpm check` = typecheck+lint+test gate; lint errors to watch: no-sync-setState-in-effect (use render-phase adjust pattern), react-hooks/refs (no ref access in render — use `useEffect` to assign reconnect refs).
14. **Never store unvalidated docs** — `POST /forms` used to insert `defaultDoc()` with `settings: {}`; consumers reading nested settings crashed (`settings.branding` undefined). Always materialize through `FormDoc.parse`/`safeParse` before persisting or returning; GET normalizes legacy rows now.
15. **Next dev overlay lies after HMR churn**: stale "Parsing ecmascript failed"/"This page couldn't load" overlays can persist from mid-edit states — hard-reload before diagnosing; check `agent-browser console` for the *latest* error only.
16. Wrangler must run from `apps/api` (repo root has no wrangler config → "missing worker entrypoint"). Web on port **3100** in testing (user's 3000 busy); `APP_ORIGIN=http://localhost:3100`.

## 6. Commands

```bash
pnpm setup        # install + migrate + seed (first time)
pnpm dev          # api :8787 + web :3000 (use: pnpm --filter @repo/web exec next dev --port 3100 if 3000 busy)
pnpm seed         # reseed local test data (tooling/seed.sql)
pnpm check        # typecheck + lint + tests (all green as of handoff)
pnpm gen:api      # regenerate hooks after API changes
pnpm db:generate  # drizzle migration from schema changes → then pnpm db:migrate
```

Test accounts (local D1): `grace@hopper.dev` / `supersecret123` (org "Acme Inc"). Test form slug: `launch-survey-ec68e1` (published, has custom question "How many people are on your team?"). Seeded `test-waitlist` also live.

## 7. Recommended next session order

1. Drop `OPENROUTER_API_KEY` into `.dev.vars` → test AI chat phrasing E2E + `/api/ai/generate-form` happy path (dashboard AI tab now wired — just set the key).
2. Builder Logic tab: xyflow v12 (`@xyflow/react`), blocks+ending as nodes, goto rules as labeled edges, condition editor Sheet; simulate via existing logic engine.
3. Escalate-UI skip E2E verify + chat polish (back/restart buttons, resume banner, ending CTA/redirect).
4. M6: submissions dashboard (transcripts from `chat_messages` + answers), CSV export, analytics rollups.
5. M8: `/v1` headless API + API-keys UI (Better Auth apiKey plugin) + widget embed.
6. M9: Dodo billing + usage_counters enforcement.
7. Dashboard form delete/rename/duplicate; ending-screen editor in builder.

## 8. Session addendum (2026-08-24, later)
- **Escalate-UI fallback shipped**: chat client now renders structured input (text/email/number/date) when the agent escalates after repeated invalid answers (`escalated` state → Composer forced-structured renderer).
- **Builder Settings dialog shipped** (`settings-dialog.tsx`): AI interviewer config (mode template/hybrid/ai, tone, persona prompt), access (close-by-date, max submissions, captcha, hide branding), completion (notification emails, redirect URL, progress bar). Wired into builder top bar; autosaves via the same `update()`/debounced-PUT path as block edits.
- All checks green: web typecheck + 0 lint errors, 22/22 schema tests.
- NOTE: user was live-testing the app ("Skip Test Form" appeared) during verification — browser automation was stood down. Settings-autosave via dialog uses the same proven code path as block-edit autosave; if dialog edits ever fail to persist, first check React onChange firing inside the Radix portal (native select via automation tools may not dispatch React synthetic events — verify manually).
- Restart stack with: `pnpm dev` (api :8787, web :3000/3100). Test account: grace@hopper.dev / supersecret123.

## 9. AI layer VERIFIED E2E (2026-08-24)
- OPENROUTER_API_KEY configured in apps/api/.dev.vars (gitignored). **User should rotate it later — it was pasted in chat.**
- Flow generation: POST /api/ai/generate-form → 200 in ~11s, lint-clean FormDoc ("Coffee Shop Feedback Form", 7 blocks). Loose GenerationDraft schema (ALL fields required — strict-mode providers reject optionals/recursive $refs) normalized to strict FormDoc in routes/ai.ts normalizeBlock().
- AI chat: form with settings.agent.mode="ai" streams real OpenRouter phrasing ("Great to hear from you! 😊 Could you please share your name?"), acknowledges prior answers, validates (email reject + clarify), completes → submission + ai_generations ledger rows (7 turns, 374in/16out).
- Gotcha: stale wrangler process holding :8787 served old env (503 ai_not_configured) — `lsof -ti :8787 | xargs kill -9` before restart.

## 10. M6 core VERIFIED (2026-08-24 later)
- Results tab in builder (`results-client.tsx`, view switcher "Results"): KPI cards (starts/completed/abandoned/rate/avg-time), per-question drop-off funnel bars, submissions list with status filters, expandable **chat transcript viewer** (AI conversation in bubbles) + answers grid. Browser-verified with real data.
- API: GET /api/forms/:id/submissions (answers + transcripts), GET /api/forms/:id/analytics (counts + per-block answer rates). Transcript projection: SessionDO.finalize() writes DO-stored messages → chat_messages D1 table (idempotent ON CONFLICT).
- Fixed: duplicate user-message persistence (pendingUserTextPersisted flag).
- User has independently built ThemePanel/SettingsPanel/ThemePreview + dnd-kit sortable in builder-client.tsx — DO NOT clobber; builder is 3-pane with view switcher (build/theme/settings/results).
- Ops gotcha: stale workerd processes squat on :8787 after crashes → `lsof -ti :8787 | xargs kill -9` before starting wrangler.

## 11. M8 developer API VERIFIED E2E (2026-08-24)
- **Better Auth 1.7.1 has NO apiKey plugin** (research was wrong) — wrote our own: `lib/apikeys.ts` (sk_live_ + SHA-256 hash at rest, prefix display, expiry/enabled checks, last_used_at touch). Table already existed.
- Dashboard key mgmt: POST/GET /api/keys, DELETE /api/keys/:id (`routes/keys.ts`, raw key shown once).
- `/v1` surface (`routes/v1.ts`, Bearer auth): GET /v1/forms, GET /v1/forms/:id (public config), POST /v1/forms/:id/chat/sessions (returns sessionId+respondentToken+greeting+firstQuestion), POST /v1/chat/sessions/:sid/messages (**synchronous** turn result: assistantMessages + nextQuestion + complete + answers — the headless contract), GET /v1/chat/sessions/:sid (state).
- Verified: key create → list forms (3) → bad key 401 → session create → message ("Got it, thanks for sharing your name! 😊...") → nextQuestion chaining → out-of-order answer correctly 400 stale_ref.
- NOTE: /v1 message turn has a 50ms settle delay before reading the transcript; DO turn is async for AI mode — may need an explicit completion signal instead of sleep for slow AI turns.

## 12. M8 COMPLETE + M9 core (2026-08-24 final)
- **Widget VERIFIED in browser**: embed.js loader (launcher bubble + iframe panel + postMessage close + mobile responsive) on a real HTML page — chat runs inside with AI phrasing.
- **Webhooks COMPLETE**: queue consumer (q-webhooks) with HMAC `x-chatform-signature: t=,v1=`, 10s timeout, delivery log, exp-backoff retries (1m/5m/30m/2h→dead) via cron sweep; admin CRUD + test-send + deliveries list (routes/webhook-admin.ts).
- **M9 billing code-complete**: /api/billing/usage (plan limits + meters — VERIFIED), /api/billing/checkout (Dodo hosted checkout, 503 with clear message until DODO_API_KEY + product IDs configured), /api/billing/webhook (HMAC verify + dodo_events idempotency + subscription upsert/cancel). Usage metering: responses increment on finalize; enforceLimit() helper ready to wire into session create.
- **Needs from user for billing E2E**: DODO_API_KEY + DODO_WEBHOOK_SECRET in .dev.vars, and Dodo product/price IDs inserted into the `plans` table.

## 13. M7 file uploads COMPLETE + VERIFIED (2026-08-24 final)
- R2-binding upload pipeline (no S3 credentials needed): POST /p/sessions/:id/uploads/intent (MIME allowlist + 25MB cap) → PUT raw body (size cross-check) → POST .../confirm (R2 head-check → confirmed → DO.notifyUpload → records answer + emits upload_received). Admin download: GET /api/files/:id/download.
- Chat client: drag-drop style file picker for file_upload blocks with progress states, multi-file support, per-block accept/maxSize from the block spec. Verified E2E: upload → recorded → session completed with file descriptor answer → admin download returns bytes.
- Route gotchas: sub-router MUST be extended before parent .route() mount (Hono copies at call time); uploadUrl shape = .../uploads/:fileId (PUT) + .../uploads/:fileId/confirm.
- ALL FEATURES EXCEPT DODO BILLING E2E NOW COMPLETE. Remaining nice-to-haves: logic tab xyflow graph (logic rules already work via engine + settings JSON), templates gallery, custom domains.

## 14. UI COMPLETION PASS (2026-08-24 final)
- **Logic view SHIPPED** (xyflow v12 canvas): block graph with sequence edges + dashed animated conditional edges (labeled with condition), click node → side panel edits goto rules (operator select, value input, target select incl. endings). Wired as "Logic" view in builder.
- **Integrate view SHIPPED**: webhook CRUD UI with event selection, signed test-send with delivery result badge, secret display, embed snippet.
- **API keys page SHIPPED** (/api-keys): create dialog with show-once reveal + copy, list with last-used, revoke. Quick-start curl snippet.
- **Usage page SHIPPED** (/usage): plan badge, metered progress bars (responses/AI generations/sessions) vs limits, over-limit state.
- **Team page SHIPPED** (/team): member list (org plugin) + invite form (authClient.organization.inviteMember).
- **AppNav SHIPPED**: pill nav in dashboard header (Forms/API keys/Usage/Team).
- **Dashboard upgrades**: AI-generate mode in new-form dialog (generate → create → save doc → publish in one flow), form delete with confirm.
- **CSV export VERIFIED**: GET /api/forms/:id/submissions/export — proper header + escaped rows with real submission data.
- All gates green: typechecks, 0 lint errors, 22/22 tests.
- Remaining (post-v1): live chat preview inside builder center pane (currently static flow cards), templates gallery, custom domains, xyflow edge-editing by dragging (rules edited via side panel).

## 15. FRONTEND COMPLETION PASS (2026-08-24 final)
- **Live chat preview SHIPPED**: builder center pane now runs the REAL interview runtime against the working draft — POST /api/forms/:id/preview/sessions (auth'd, uses working_schema) + use-chat existingSession mode + Restart button. Preview ≡ production, single source of truth.
- **Logic view**: xyflow v12 canvas (sequence + dashed conditional edges w/ condition labels), per-block goto-rule editor (operator/value/target incl. endings). Rules persist via doc autosave.
- **Templates page** (/templates): 4 seeded templates (Lead Capture, NPS, Event RSVP, Job Application) with use-template → creates draft + opens builder.
- **Share view**: copyable public link, inline-iframe + floating-widget snippets.
- **Integrate view**: webhook CRUD + signed test-send.
- **API keys / Usage / Team pages** shipped earlier this pass.
- **Landing page rebuilt**: nav, hero, 6 feature cards, 3-step how-it-works, CTA, footer — matches warm cream/orange design system.
- **Dashboard**: AI-generate in new-form dialog (generate→create→save→publish), form delete, AppNav pill nav.
- Build output: 9 routes, all compile. Gates: typecheck clean, 0 lint errors, 22/22 tests, CSV export verified.

## 16. YOUFORM PARITY PASS (2026-08-24)
- **Views tracking**: POST /p/forms/:slug/view (public, sessionStorage-deduped ping from chat page) → analytics_rollup_daily.views; analytics endpoint returns real views + Views KPI card.
- **Summary tab** (Results): per-question distributions — option bars w/ percentages for choice types, avg/min/max for numeric types. Toggle "Summary view" in Results.
- **Password protection**: settings.password {enabled,value} in schema; enforced in /p session create (401 password_required); UI in settings dialog.
- **Hidden fields & variables UI**: chip editors in settings dialog (add/remove; variables typed number/text) — schema already supported them.
- **Link settings UI**: OG title/description + noIndex in settings dialog (schema meta existed).
- **Dashboard**: search + sort (newest/oldest/most responses).
- **Share**: QR code + Facebook/X/LinkedIn/Email one-click share buttons.
- All gates green.

## 17. COMPETITOR PARITY AUDIT FIXES (2026-08-24)
- **Logic canvas now interactive**: drag connections between nodes to create goto rules (yes/no blocks auto-wire a Yes condition; others wire is_not_empty), delete edges with Backspace/Delete, yes/no edges labeled "Yes"/"No", option-block edges labeled with the option label.
- **Option-aware rule conditions FIXED**: rule value editor now renders a dropdown of real option IDs for select blocks (free-text values never matched option-ID answers — this was a real bug), Yes/No picker for yes_no, number input for scales, text otherwise.
- **AI add-blocks endpoint** (/api/ai/add-blocks): prompt + existing doc → AI generates new blocks avoiding duplicates → normalized → appended → persisted. VERIFIED E2E (506 tokens, block appended). Builder AI bar ("Build with AI") uses it and refreshes the preview.
- **Empty/loading states**: Usage, Team, Templates pages got loading skeletons + no-data/error empty states; dashboard already had them.

## 18. DEVELOPER PLATFORM (2026-09-04) — deployed

The non-GUI half. `/v1` was five endpoints, hand-rolled keys and cosmetic scopes;
it is now a documented public API with its own docs site. All of this is live on
`api.chatform.in` and `chatform.in`.

### Keys — now Better Auth's

§11 said "Better Auth 1.7.1 has NO apiKey plugin (research was wrong)". That was
right about the **core** package and wrong as a conclusion: the plugin is
published separately as `@better-auth/api-key`, like `@better-auth/passkey` and
`@better-auth/stripe`. Adopted; `lib/apikeys.ts` is now verification and policy
only.

- Four configs: `sk_live` (stored as configId `default`), `sk_test`, `pk_live`,
  `pk_test`. Org-owned (`references: "organization"`), which also fixed listing
  keys by `user_id` — a teammate could not revoke a colleague's key.
- **Gotchas that each cost a cycle.** Every config in an array must name a
  `configId` and one must be `"default"`. `usePlural` appends an "s", so the
  drizzle export is `apikeys` and a `modelName` override would resolve to
  `apiKeyss`. `api_keys.user_id` was NOT NULL and the plugin never writes it →
  migration 0005 is a table rebuild with `PRAGMA defer_foreign_keys` (D1 rejects
  `PRAGMA foreign_keys`). `@better-auth/utils` and `better-call` are pinned as
  direct deps of `apps/api`: the plugin's peer resolved differently from
  better-auth's, giving two `@better-auth/core` instances whose types would not
  unify and whose runtime 500'd every sign-up.
- **Never set a global `secondaryStorage`.** Better Auth then stops writing
  session rows to D1, and `resolveOrgId` reads `sessions.active_organization_id`
  — every multi-org user would silently fall back to their oldest membership.
- Hashes: old code stored SHA-256 hex, the plugin stores base64url of the same
  bytes. `pnpm apikeys:backfill[:remote]` converts in bulk (SQLite has no
  base64, so not in the migration), and `verifyKey` repairs a straggler on first
  use. Production had zero keys, so this was a no-op there.
- Scopes are enforced. `requirePermission` used to `return next()` for any key,
  so every key had full org authority. Deny-by-default via `PERMISSION_TO_SCOPE`;
  legacy keys grandfathered to their old three.
- The plugin's own `/api/auth/api-key/*` endpoints are 404'd — through the Better
  Auth catch-all they would mint keys with no feature gate, RBAC or audit row.

### `/v1`

`routes/v1.ts` composes `v1/{responses,chat,forms,meta}.ts`. Old paths
(`/v1/forms/:id/chat/sessions`, `/v1/chat/sessions/*`) still answer.

- **Response lifecycle**: open → answer → complete, one `submission_answers` row
  per answer, **awaited** (the DO defers via `waitUntil`; a REST caller's next
  read must not miss its own write). Single-shot is a flag running the same three
  steps. Flow order enforced by default (`mode: "free"` for imports).
- **`lib/submissions.ts`** owns every write to `submissions`/`submission_answers`.
  The DO delegates to it. `tests/submissions-writer.test.ts` drives a real
  conversation and an API write and asserts the rows match — that test is the
  reason the two paths cannot drift.
- **`handleUserTurnSync`** replaced the 50 ms sleep + transcript diff.
  `handleUserTurn` was *already* synchronous; the fix was returning the events
  rather than discarding them. One line in `emit()` collects them.
- **`lib/open-session.ts`** extracted from `routes/public.ts`. `/v1` used to skip
  the close date, response ceiling, `maxSubmissions`, password, captcha and
  duplicates entirely. `trustedCaller` turns off only the password and captcha.
  `public-gates.test.ts` passing untouched is the proof the extraction was faithful.
- `chat_sessions.expires_at` is finally written (it never was).
- Rate limits: edge burst (the `RATE_LIMIT` binding, previously zero call sites)
  → per-key window (the plugin's own columns) → monthly quota. 429 vs 402 is a
  documented distinction.
- Test mode is real: `is_test` on submissions and sessions, excluded from
  metering, webhooks and analytics, pruned after 30 days.

### Webhooks

`response.*` canonical, `submission.*` aliased so existing subscriptions keep
firing. Two real bugs fixed: the retry sweep hardcoded `submission.completed` and
dropped `submissionId` (a retried abandonment arrived as a completion with no
payload), and `attempt` was always inserted as `1` while the schedule was chosen
by comparing payload strings. Standard Webhooks signing added alongside the
legacy header, reusing `lib/dodo-webhook.ts`'s `sign()`. New: `response.partial`,
swept rather than streamed.

### Docs — `chatform.in/docs`

Fumadocs in `apps/web`, ~118 prerendered pages.

- **The block reference is generated** (`pnpm gen:blocks`): config schema from the
  `Block` union via `z.toJSONSchema({io:"input",cycles:"ref"})`, the projection by
  *running* `toPublicBlock`, and every error message by *calling* `validateAnswer`.
  Guarded by `ANSWER_CATALOG` in form-schema + `answer-catalog.test.ts` (106
  assertions) — documentation cannot describe an engine we do not have.
- API reference generated from the spec (`pnpm gen:api-docs`). The document must
  be a **named** schema record; passing a path writes the generator's absolute
  local path into every page.
- `pnpm gen:openapi` boots the worker and writes `openapi.json`, replacing the
  `wrangler dev` + curl ritual. `pnpm openapi:verify` in CI.
- Gotchas: MDX table cells need `|` escaped (TypeScript unions break them);
  `createOpenAPIPage` is client-side and needs a server wrapper to supply the
  document; the provider is `fumadocs-ui/provider/next`; `.source/` must be
  eslint-ignored.

### SDKs and embed

`packages/sdk-js` (`@chatformhq/js`) and `packages/sdk-react`. Workspace exports
point at source, `publishConfig` swaps in `dist`. **The npm `@chatform` org is not
claimed yet — that is the only blocker to publishing.**

`embed.js` rewritten: four modes (two were missing), prefill, triggers, nonce
passthrough, `window.Chatform`, 3.9 KB gzipped. The frame's half now exists
(`embed-bridge.tsx`) — `?embed=1` was generated by every snippet and read by
nothing, and `chatform:close` was listened for and never sent.
`settings.embed.allowedOrigins` is enforced server-side against the `Origin`
header, never the body's self-report.

### Commands

```bash
pnpm gen:openapi      # spec from the running worker
pnpm gen:docs         # block reference + API reference
pnpm openapi:verify   # CI gate
pnpm blocks:verify    # CI gate
pnpm apikeys:backfill[:remote]
```

### Follow-up pass (same day)

Three things shipped that did not work, all found by auditing what the SDK and
the published spec promised against what actually existed:

- **`client.webhooks.*` answered 401 on every call.** It pointed at
  `/api/webhooks`, which is session-guarded — so the `webhook:read`/`webhook:write`
  scopes named an ability no key had. Webhook CRUD, deliveries and replay now
  exist under `/v1` behind those scopes.
- **`client.forms.analytics()` called a route that did not exist.** Building it
  meant extracting `lib/analytics-service.ts`, which surfaced an older bug: the
  aggregate enumerated questions from `forms.working_schema` — the **draft** —
  while counting answers from published versions, so an unpublished question
  showed a 0% answer rate. It also ran a query per question; that is one grouped
  query now.
- **`/v1/chat/forms/{id}/sessions` was published as if it were real.** Mounting
  the chat router at both `/` and `/chat` generated it. Each session route is
  registered at both spellings instead, so the legacy paths still answer and the
  nonsense ones are gone.

Also done: the three embed events (`question`, `answer`, `complete`) now fire from
`use-chat.ts`, and `/api-keys` was rebuilt on the generated hooks — key types,
scopes, origin allowlists, rotation with its grace window, revoke behind a
confirm, and the paywall shown before the form rather than after a 402.

### Left undone

- **npm org `@chatform` is unclaimed**, so both SDKs are unpublished. This is the
  only blocker to publishing them.
- Uploads are not dual-authed under `/v1`; the intent → PUT → confirm trio is
  still respondent-token only, so a headless caller cannot answer a file question.
- `Q_EXPORTS` still has no producer. `response:export` is in the scope vocabulary
  with no endpoint behind it — a scope that can be granted and grants nothing.
- `Q_SUBMISSIONS` has no producer either. Pre-existing.
