# CHATFORM — Implementation Plan

Agentic-chatbot form platform (Typeform/Youform competitor). The form-filling interface is an **AI interview agent** (greets, asks questions one at a time, validates conversationally, branches, collects files) instead of a classic form UI. Developer-friendly: API keys + headless chat API + embeddable widget so customers can build their own chat layer.

Companion docs (already produced during planning):
- `DESIGN.md` (repo root, 558 lines) — full product/frontend spec: routes, every dashboard screen, chat UX per block type, design tokens, motion, frontend architecture, frontend phases.
- Full backend architecture doc: `/Users/mohithkumar/.local/share/opencode/tool-output/tool_030b408560018UD7EdmVsSXdxO` (803 lines — complete D1 schema DDL, form-schema Zod, agent loop, API tables, analytics, security). **Copy to `docs/ARCHITECTURE.md` in M0.**

---

## 1. Research highlights (what we copy)

**Youform**: unlimited forms/responses on Free; Pro $29/mo ($20 annual), Business $89/mo ($60 annual). Tabs Build/Integrate/Settings/Share/Results. Settings: close by submissions, duplicate prevention (cookie/IP), reCAPTCHA, progress bar, refill links, partial submissions, anonymous mode, hidden fields + variables, email notifications (to me / to responder), link settings (OG image, favicon, custom domain). Results: Completed/Partial tabs, Summary per-question charts, Analytics (views/starts/submissions/completion rate/avg time, drop-off per question, trend graph, date+device filters), CSV export. Warm cream/orange design language, playful tone.

**Typeform**: monetize responses/mo not forms; logic jumps + recall/piping + variables + score calculators; multiple endings routed by logic; drop-off analytics as premium; embed taxonomy (inline/popup/slider/sidewidget/fullpage + triggers); AI generation; Clarify-with-AI (dynamic follow-ups — our whole product is this); vertical expansion playbook.

**Our pricing** (Dodo Payments, MoR): Free (unlimited forms, 100 responses/mo, chatform branding, template+hybrid agent modes), Pro $29/mo ($240/yr) (1k responses/mo, AI agent mode, remove branding, custom domain, partials, advanced analytics, file uploads 25MB, 3 seats), Team $89/mo ($720/yr) (10k responses/mo, 15 seats, audit log, priority limits, 100MB uploads). AI generations metered (10/200/1000 per mo). Hard stop on Free overage, soft on paid.

**Exploitable gaps**: native password protection, close-by-date, progress %, non-Stripe payments (Dodo), form creation via API (Youform can't), chat-native analytics (drop-off by turn).

---

## 2. Locked stack

| Layer | Choice |
|---|---|
| Monorepo | Turborepo 2.10 + pnpm; apps thin, `@repo/*` packages thick, TS project references, same hono version everywhere |
| API | Hono ≥4.13 on Cloudflare Workers, `@hono/zod-validator`, Hono RPC `hc<AppType>` |
| DB | **Cloudflare D1 + Drizzle** (NOT MongoDB — Drizzle declined Mongo support). JSON-in-TEXT for form docs. `drizzle-kit generate` + `wrangler d1 migrations apply` only. No interactive txns → `db.batch()` |
| Auth | Better Auth `drizzleAdapter(sqlite)` + organizations plugin + official **apiKey plugin** (hashed keys, scopes, rate limits, expiry) |
| Payments | Dodo Payments `@dodopayments/hono` (checkout + HMAC webhook + `dodo_events` idempotency table) |
| Storage | R2 presigned direct uploads via aws4fetch (presign → browser PUT → confirm/HEAD-validate); never proxy through Worker |
| Chat | **SSE downstream + POST upstream; one Durable Object per chat session** (SQLite-backed, owns FSM + transcript + alarms). DO storage = source of truth during session; D1 = async projection via Queues |
| AI | Hybrid: frontier (OpenAI/Anthropic via AI Gateway, structured output + zod revalidation) for agent + flow generator; Workers AI for moderation/classification/embeddings. Every call logged to `ai_generations` + `usage_counters` |
| Diagrams | `@xyflow/react` v12 (MIT; NOT legacy `reactflow`) |
| Frontend | Next.js 16 + Tailwind v4 + **shadcn/ui (mandatory)** + shadcn charts (Recharts) + dnd-kit + zustand |
| Email | Resend via raw fetch, `ctx.waitUntil()` |
| Protection | Turnstile (public endpoints) + Workers `ratelimits` binding (GA) + DO per-session counters |
| Scheduling | Cron triggers (sweeper) + DO alarms (exact close times) |

---

## 3. Monorepo layout

```
chatform/
├─ apps/
│  ├─ web/          # Next.js 16: (marketing), (app) dashboard/builder, (public) /f/[slug] + widget bundle
│  └─ api/          # Hono Worker: /api/* (dashboard+auth), /p/* (respondent), /v1/* (developer), /internal/*; queues, cron, SessionDO
├─ packages/
│  ├─ form-schema/  # ★ Zod FormDoc + logic engine + validators + lint. Zero deps except zod. Isomorphic.
│  ├─ agent/        # ★ Interview engine: FSM, tool schemas, guard(), prompts, budgets. Depends only on form-schema.
│  ├─ db/           # Drizzle schema + migrations + seed + query helpers
│  ├─ api-client/   # hc<AppType> typed client (cookie + bearer modes)
│  ├─ ui/           # shadcn primitives + chat bubbles, block inputs, builder panels
│  └─ config/       # eslint/tsconfig/tailwind preset
└─ tooling/         # seed, loadtest scripts
```

Wrangler bindings: `DB` (d1), `KV_CONFIG`, `SESSION_DO`, `Q_SUBMISSIONS`/`Q_WEBHOOKS`/`Q_EXPORTS` (queues), `ANALYTICS` (engine), `R2`, `RATE_LIMIT`, `WORKERS_AI`, AI Gateway via base URL. Secrets: `BETTER_AUTH_SECRET`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `AI_GATEWAY_TOKEN`, `RESEND_API_KEY`, `DODO_API_KEY`, `DODO_WEBHOOK_SECRET`, `TURNSTILE_SECRET_KEY`, `FILE_ENCRYPTION_KEY`, `SIGNING_SALT`.

---

## 4. Core artifacts

### 4.1 Form definition (`@repo/form-schema`) — one Zod schema, five consumers (builder, AI generator, agent, renderer, API)
- **Blocks** (discriminated union): `welcome, statement, short_text, long_text, email, phone, url, number, date, yes_no, single_select, multi_select, dropdown, picture_choice, rating, nps, opinion_scale, ranking, matrix, file_upload, signature, payment, scheduling, contact_info, address, legal_consent`. Each: `{id, ref (stable, `^[a-z][a-z0-9_]{1,40}$`, never renamed), type, title, description, required, visibility?, image_key?, ...type props}` (validation bounds, options w/ score, matrix rows/cols, upload accept/maxSize, payment amount/currency, etc.).
- **Logic**: recursive `ConditionGroup` (and/or, depth ≤5) over operands (block ref / variable / hidden field / literal) with ops (eq, neq, gt/lt, contains, starts_with, is_empty, is_checked, includes, ranked_above…). `LogicRule[]`: `goto` (first match wins; target block|ending), `set_variable` (arith exprs depth 3), `add_score`. Evaluated **deterministically in code after each recorded answer — never by the LLM**.
- **Variables** (number/text, score accumulators), **hiddenFields** (URL params, UTM), **multiple endings** with routing rules + redirect + showSummary.
- **Settings**: progressBar, navigation, closeRules (closeAt/maxSubmissions), captcha (turnstile), duplicates strategy (ip/field fingerprint), onComplete (redirect, notification emails, autoresponder), meta/OG, branding.hidePoweredBy (plan-gated), **agent config** (mode `template|hybrid|ai`, tone, personaPrompt, maxClarifications, escalateAfterInvalid=3, sessionTokenBudget=12000, responseMaxTokens=400).
- **Answer value contract** per type (E.164 phone, option ids, ranking permutations, matrix maps, file descriptors, consent hash+ts…).
- **Lint pass** (used by publish + generator + importer): ref uniqueness, logic targets exist, reachability ≥95%, ≥1 ending, regex compile, depth caps.
- `schemaVersion` + migration chain so old published versions render forever.

### 4.2 D1 schema (~30 tables — full DDL in ARCHITECTURE.md §1)
- Better Auth: users, sessions, accounts, verifications + organizations, members, invitations + api_keys (extended: org/workspace pinning, scopes json).
- Product: **workspaces**, **forms** (working_schema TEXT, theme_json, settings_json, slug UNIQUE, status, active_version_id, close_at, fingerprint_salt), **form_versions** (immutable publish snapshots + checksum for KV cache), **submissions** (status in_progress|completed|abandoned|spam, search_text, fingerprint, meta json w/ device/UTM/referrer/score/price), **submission_answers as normalized rows** (block_ref, value_json, value_number denorm → per-question analytics via GROUP BY; UNIQUE(submission_id, block_ref)), **chat_sessions** (respondent_token_hash, current_block_ref, variables, state_snapshot_json for DO cold hydration, token usage), chat_messages (D1 projection), **files** (presign lifecycle pending→confirmed), webhooks + webhook_deliveries, integrations (AES-GCM encrypted creds), form_templates, **ai_generations** (cost ledger per model call).
- Billing: plans (limits_json), dodo_customers, subscriptions, payments, **dodo_events** (idempotency), **usage_counters** (org × YYYY-MM × metric, lazy rollover, nightly recount cron).
- Analytics: **analytics_rollup_daily** (views/starts/completions/completion-time percentiles/per-block shown-answered-skipped-drop_rate json); `submissions_fts` (FTS5); audit_logs; idempotency_keys.

### 4.3 Agentic interview loop (SessionDO) — the core differentiator
- **FSM**: INIT→GREETING→ASKING(ref)→AWAITING_ANSWER→PARSING→(VALIDATING→CLARIFYING ≤2→ESCALATED_UI after 3 invalid)→RECORDING→BRANCHING→TRANSITION_MSG→ASKING…→CLOSING→COMPLETED; idle alarm 30min→ABANDONED (partial saved); stop/restart actions; CLOSED if form closes mid-session.
- **LLM is a constrained actor, never the controller.** Tools: `ask_question(ref∈logic-allowed)`, `record_answer(ref, value)` (runs deterministic validator; invalid → error string back to model), `clarify` (≤2), `skip_current`, `request_upload`, `end_interview(ending∈allowed)`, `escalate_to_structured`. 3 consecutive tool errors ⇒ deterministic template takeover (reliability floor).
- Choice/rating/NPS/yes-no blocks: **zero LLM parsing** — structured client actions record directly; LLM only emits a short streamed transition ack (skippable in template mode).
- Free-text validation pipeline cheap→expensive: regex/format → Workers-AI classifier (long-text quality) → frontier model judgment. Moderation (Workers AI) before every model turn; 3 spam strikes ⇒ session blocked.
- Prompt: persona+tone+form manifest (only remaining blocks)+current objective+answers digest+hard rules; rolling window 8 turns + running summary; AI Gateway prompt caching. Budget: 12k in/4k out per session ⇒ degrade to template mode.
- **Wire contract** (SSE events, envelope `{v,seq,ts,type,data}`): `session_ready, message_start/end, token, question{block,progress}, validation_error, upload_request, upload_received, answer_recorded, branch_jump, escalate_ui{ref,spec}, ending, complete{submissionId}, error, rate_limited, ping`. Client POSTs: `/p/sessions/:id/messages {type:text|structured}`, `/actions {skip|stop|regenerate|restart}`, `/uploads/intent`→presigned PUT→`/uploads/confirm`. `Last-Event-ID` replay for SSE resume.
- **AI flow generator**: prompt → structured output constrained to the actual zod schema → `safeParse` → auto-fix loop (feed issues back, ≤3 iters) → deterministic repair (dedupe refs, resolve dangling targets, default ending) → save as draft + diff view in builder.

### 4.4 Analytics
Analytics Engine firehose (`form_view, session_start, block_shown/answered/skipped, dropped_off, clarification, validation_failed, escalated_ui, session_completed/abandoned{durationMs,pct}`) → hourly+nightly crons → `analytics_rollup_daily`. Dashboards read rollups only (fast, plan-gated); per-question distributions from `submission_answers`; partial responses are first-class (abandoned sessions already have answer rows). Attribution: hidden fields + auto UTM/referrer/geo/device.

### 4.5 Security & limits
Authz chain middleware `user→member(org,role)→workspace→form` (owner/admin/editor/viewer matrix). API keys: `sk_live_/sk_test_`, scopes (`forms:read/write, submissions:read, sessions:read/write, webhooks:manage`), workspace pinning, hashed at rest. Turnstile + ratelimit binding on `/p` (5 session-creates/min/IP, 30 msgs/min/session); per-key tiered limits on `/v1`; `Idempotency-Key` on v1 POSTs. Webhooks: `X-Chatform-Signature: t=…,v1=HMAC`, exp-backoff retries → dead + email. R2: presigned PUT TTL 60s, scoped keys, confirm-time size/MIME enforcement, orphan sweep. Signed embed tokens (HMAC origin allowlist). Anonymous mode (no IP, truncated UA). Audit log on all mutations. GDPR: anonymize endpoint, retention sweeps, deletion cascade.

---

## 5. Product surface (details in DESIGN.md)

- **Routes**: `(marketing)` landing/pricing/templates/docs; `(app)` `/dashboard`, `/forms/new`, builder `/forms/[id]/{build,logic,theme,settings,share,integrate,results}`, `/api-keys`, `/usage`, `/billing`, `/team`, `/account`; `(public)` `/f/[slug]` hosted chat, `/embed/[slug]` iframe.
- **Builder**: 3-pane — left block list (dnd-kit reorder, categorized add-block popover), **center = the real chat runtime as live preview** (preview ≡ production, single source of truth), right accordion settings panel per block. Logic tab = xyflow v12 graph (blocks+endings as nodes, labeled conditional edges, condition editor Sheet, simulate endpoint drives highlighting). Theme tab = colors/fonts/bubble style/avatar/background with live preview via scoped `--cf-*` CSS vars. Settings mirrors Youform (General, Access, Notifications, Hidden fields & variables, Meta/links, Danger zone). Share = link/QR/embed generator (inline/popup/sidewidget/fullpage)/custom domain. Integrate = webhooks (+delivery log/test), Google Sheets, Zapier/Make, Slack, email notifications, API. Results = Submissions (Completed/Partial tabs, **chat transcript viewer per submission**, filters, FTS, CSV export via queue→R2→emailed link), Summary (per-question charts), Analytics (KPIs, trend, per-block drop-off bars, date/device filters, plan-gated).
- **Chat UX**: streaming bubbles + typing dots, per-block renderers (option chips/cards, in-bubble stars/NPS, date popover, file/image preview bubbles, signature modal, payment card, contact-info sub-steps), conversational validation errors, progress %, back/restart, resume banner, hybrid structured-input fallback after 3 invalid answers, ending screen w/ summary+redirect, full a11y (keyboard-only completable) + mobile.
- **Design system**: warm cream/ink/orange oklch tokens mapped to shadcn vars, Bricolage Grotesque + Inter + JetBrains Mono, subtle motion (fade/slide messages, typing dots, streaming caret), empty states inventory, dark mode.
- **Widget**: separate ≤60KB iframe bundle + <3KB `embed.js` loader + `@chatformhq/react` npm package for self-hosting; postMessage bridge; SSE reconnect with zero answer loss.

---

## 6. Implementation milestones (unified; ★ = critical path)

| # | Scope | Acceptance |
|---|---|---|
| M0 | Turborepo scaffold, CI, D1+drizzle migrations scripted, `/health` deploys; copy ARCHITECTURE.md; Tailwind tokens + shadcn init + app shells | `pnpm dev` runs web+api; CI green |
| M1 | Better Auth + orgs + invites + dashboard shell (org switcher, shadcn layout) | signup→org→invite→role-gated stub route |
| M2 ★ | `@repo/form-schema`: full zod, logic engine, validators, lint, fixtures (~90% cov) | nested logic eval + round-trip JSON lossless |
| M3 | Forms CRUD/publish/versions/rollback API + Builder MVP (3-pane, autosave 800ms + conflict 409, xyflow read-only) + settings/share tabs | create→edit→publish→rollback; lint blocks broken publishes |
| M4 ★ | Public chat MVP **template mode** (no LLM): SessionDO FSM, SSE, `/p/*`, branching, endings, partial save, resume, Turnstile+limits, `/f/[slug]` + iframe | 8-block branched form E2E; kill DO mid-interview → resume intact; abandon → partial submission |
| M5 ★ | `@repo/agent`: tool loop+guards, validation pipeline, escalation, budgets, ai_generations ledger, **AI flow generator** with auto-fix | natural free-text interview; invalid→clarify→escalate demo; one-line prompt → lint-clean form |
| M6 | Submissions dashboard + transcripts, CSV export (queue→R2), AE instrumentation, rollup crons, analytics charts, plan gates | funnel ≈ rollups ±1%; 10k-row export async + email |
| M7 | R2 presign/confirm, file/signature/picture blocks in chat, payment block (Dodo checkout + webhook→DO), scheduling, matrix/ranking | 10MB upload E2E; payment completes only after webhook |
| M8 | API keys UX + `/v1` headless API (sync + SSE chat, idempotency) + webhook dispatch/retries/DLQ UI + embed.js/widget + `@chatformhq/react` alpha | curl headless session completes form; HMAC verified; revoked key rejected ≤60s |
| M9 | Plans seed, Dodo checkout/portal/webhooks, usage_counters enforcement + overage banners/emails | Free org at 100 responses hard-stopped with upgrade CTA |
| M10 | Hardening: custom domains, embed tokens, anonymous mode, retention/audit UI, loadtest (500 concurrent sessions, p95 turn <2.5s), template gallery seed, landing page | security checklist complete; loadtest passes |
| M11 | Launch: docs site, status page, error tracking, D1 time-travel/R2 versioning backup runbook, legal | restore dry-run; go-live checklist |

Critical path M2→M4→M5; M3 overlaps; M6–M9 parallelizable after M5. Est. ~14–19 weeks solo.

---

## 7. Verification plan
- **Unit**: `@repo/form-schema` + `@repo/agent` in vitest (no miniflare) — logic engine property tests, guard() allowlists, validator matrix, generator golden tests.
- **Integration**: wrangler/miniflare — session E2E (create→chat→submit), SSE kill/replay, presign/confirm, webhook signing, Dodo webhook idempotency.
- **E2E (Playwright)**: publish branched form → complete via chat; abandon → partial; resume across reload; network-chop SSE recovery with zero answer loss; keyboard-only completion; embed script on static page; 10MB upload on throttled profile.
- **Load**: `tooling/loadtest` — 500 concurrent sessions, p95 turn latency <2.5s, D1 write batching verified.
- **Per-milestone**: each table row's acceptance criteria; `pnpm lint && pnpm typecheck && pnpm test` green in CI before merge.

## 8. Key risks → mitigations
LLM cost/latency → template/hybrid modes + budgets + Gateway caching + Workers AI tiering. Agent off-rails → guard() allowlists + deterministic takeover + golden-transcript evals in CI. D1 single-writer → DO-first durability + queue batching + rollups. DO eviction → dual persistence + snapshot hydration + Last-Event-ID replay.

## 9. API & codegen contract (user-mandated, binding)
1. **OpenAPI-first**: every API route defined with `@hono/zod-openapi` (or hono-openapi resolvers). Spec served at `/openapi.json`; Swagger UI (Scalar) at `/docs`. No hand-written fetch logic anywhere on the frontend.
2. **Generated frontend data layer**: `orval` generates TanStack Query hooks + zod schemas + typed fetch client from `openapi.json` into `apps/web/src/lib/api/` (gitignored generated output? no — commit it). Hooks/types NEVER written manually.
3. **Zod everywhere**: zod schemas shared/derived on both sides; runtime validation at boundaries.
4. **Better Auth offloading**: organizations plugin owns orgs/members/invites/roles (workspaces = orgs + our workspace table only if needed); use admin plugin, apiKey plugin (already), session management — do not hand-roll what Better Auth ships.

## 10. Status log
See **HANDOFF.md** — the authoritative, detailed state document (updated every session). Summary as of 2026-08-24 (session 2):
- DONE: M0 (scaffold, form-schema 22 tests, D1 schema+migrations), M4 slice (SessionDO chat FSM + SSE durable replay, browser-verified E2E), M1 (Better Auth + orgs, verified), M3 (forms CRUD + publish/versioning + dashboard + builder v1 with autosave/publish, browser-verified), OpenAPI/Scalar/orval-codegen pipeline, AI foundation (Vercel AI SDK + OpenRouter: SessionDO streaming phrasing with template fallback + budgets + usage ledger, flow-generator endpoint with auto-fix loop).
- SESSION 2: AI-generate wired into dashboard "New form" dialog (POST /forms accepts validated doc); escalate-UI fallback + per-type hints + skip action in chat client; builder Settings view (agent/close rules/duplicates/on-complete); builder Theme view (presets/colors/radius/fonts) with live mock-chat preview; dnd-kit drag-reorder; shared `--cf-*` token layer (`chatThemeVars`) consumed by both preview and real chat runtime (radius+fonts now live); fixed list-invalidation key; fixed unvalidated-settings crash (GET normalizes legacy docs).
- NOT STARTED: Logic tab (xyflow), live chat preview in Build view, AI E2E happy paths (needs OPENROUTER_API_KEY), escalate/skip E2E click-through, M6 analytics, M8 /v1+widget, M9 billing.
