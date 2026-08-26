# chatform — Rebuild Plan (Youform parity + agentic differentiator)

> **On execution, step 0.2 copies this file to `/REBUILD.md` in the repo** so it survives session boundaries and can be handed to any other agent. `PLAN.md` / `DESIGN.md` / `HANDOFF.md` stay as historical record; this document supersedes them where they conflict.

---

## Context

**What we are.** chatform is a Typeform/Youform competitor where the form-filling surface is an **agentic chatbot**, not a page of fields. Youform renders one question per screen; we render a conversation. The agent asks, listens, *answers the respondent's own questions from a knowledge base*, handles objections, validates conversationally, and drives toward completing the form. Everything Youform does in its builder we must also do — plus the agent layer, which is the only reason a customer picks us.

**Why this plan exists.** The backend is architecturally sound (D1 + Drizzle, Durable Object per session, SSE with durable replay, R2, Queues, OpenAPI→orval codegen) and ~80% of the API surface exists. But three things are broken:

1. **The product isn't actually agentic.** `runAgentTurn`, `ToolSet`, `allowedNextRefs`, `buildValidationPrompt`, `long_text.aiQualityCheck` are all written and **nothing imports them**. The live agent is a *phrasing layer* over a deterministic FSM: it rewords questions and nothing else. There is no knowledge base, no goal, no persona depth, and free-text understanding is string matching (`["yes","y","yeah"]`), so 10+ of the 26 block types can only be answered through structured widget input. The one thing that differentiates us from Youform is the one thing that isn't built.

2. **The UI is bad and shallow.** The block inspector edits exactly three fields (title, description, required) for all 26 block types — every other schema field is unreachable. Only 16 of 26 block types are even in the add-block library. All seven builder "tabs" are `useState` branches inside one 592-line client component, so there are no URLs, no back button, and `@xyflow/react` + 1,251 lines of workflow code ship in the initial builder bundle. `.dark` is fully defined in CSS and never activated (no `ThemeProvider`). `<Toaster/>` is mounted and `toast()` is never called. Three separate flows call `window.location.reload()` as their state-sync mechanism. There is no animation library, no charts, no auto-scroll in the chat, no progress bar, no typing indicator mid-conversation.

3. **Multi-tenancy is not enforced.** `/api/forms/:id`, `/api/forms/:id/doc`, `/api/forms/:id/publish`, `DELETE /api/forms/:id`, `/api/forms/:id/submissions`, `/api/forms/:id/analytics`, `/api/ai/add-blocks`, `/api/forms/:id/preview/sessions`, `/api/webhooks/:id`, `/api/files/:id/download`, `/v1/forms/:id`, `/v1/chat/sessions/:sid/*` all trust the id in the URL without checking org membership. Any signed-in user can read, edit, or delete any other tenant's form. `GET /api/templates` has no auth middleware at all.

**Intended outcome.** A product where (a) the builder is at least as complete and as good-looking as Youform's, (b) the respondent experience is a genuinely intelligent conversation, and (c) a tenant cannot see another tenant's data.

---

## Locked decisions (this session)

| # | Decision | Consequence |
|---|---|---|
| D1 | **Blocks stay the source of truth; an agent layer sits on top.** The ordered, typed block list defines *what must be collected* (so Results stays a clean typed table and logic stays deterministic). A new form-level **Agent** config adds persona, tone, goal, knowledge base, and guardrails; each block gains **agent hints** (how to ask, how to retry, why we ask, examples). | `packages/form-schema` gets a `schemaVersion: 2` bump. New builder tab. New DO behavior. |
| D2 | **Design system + IA first**, features second. | Phases 1–5 are foundations and surfaces; feature depth lands in 6–9. Do not start integrations before the shell is right. |
| D3 | **Integrations = hardened webhooks + Google Sheets (OAuth) + email (Resend).** Zapier/Make/n8n ship as documented webhook presets, not bespoke code. | The unused `integrations` table finally gets used. `RESEND_API_KEY` finally gets a sender. No 77-logo marketplace. |
| D4 | **Interview turns move to Claude Sonnet 5 via the existing OpenRouter gateway**, with a cheap model for extraction/classification and a per-form/per-plan model override. | `DEFAULT_MODEL` becomes a tiered map, not a constant. Do **not** rip out OpenRouter/Vercel AI SDK — HANDOFF §2 constraint 6 makes that the mandated gateway. |

**Model IDs.** Reasoning/interview tier → `anthropic/claude-sonnet-5`; extraction/classification/lint-repair tier → keep a small fast model (`openai/gpt-4o-mini` is fine, or `anthropic/claude-haiku-4-5`). Verify the exact OpenRouter slugs against `https://openrouter.ai/api/v1/models` before hardcoding — slugs change and a wrong one fails at runtime, not at build.

---

## Constraints inherited from HANDOFF.md §2 — do not violate

1. **OpenAPI-first.** Routes declared with `hono-openapi` (`describeRoute` + `validator` + `resolver`). Spec at `/openapi.json`, Scalar at `/docs`.
2. **No hand-written frontend API code.** All data fetching goes through orval-generated TanStack Query hooks in `apps/web/src/lib/api/`. Regenerate with `pnpm gen:api`; the output is committed. *(This is currently violated in ~8 files — fixing it is a task in this plan, not an exception to it.)*
3. **Zod everywhere**, validation at every boundary.
4. **shadcn/ui + Tailwind v4** mandatory.
5. **Better Auth** owns orgs/members/invites/roles. Don't hand-roll.
6. **AI = Vercel AI SDK (`ai`) + OpenRouter.** Single secret `OPENROUTER_API_KEY`.
7. D1 + Drizzle (not Mongo), Dodo Payments, R2 direct upload, one DO per session, SSE downstream + POST upstream.

**Also inherited (HANDOFF §5, each was a real bug):** `form-schema` uses extensionless relative imports because Turbopack can't rewrite `.js`→`.ts` through package exports · orval `override.query.useQuery: true` breaks mutations · the fetch mutator must use a `Headers` instance or Workers body parsing breaks on duplicate `Content-Type` · **SSE replay must read `evt:` keys from DO storage, never an in-memory buffer** · **`goto` rules need `from` or they fire after every answer and loop forever** · never persist an unvalidated doc (always `FormDoc.parse` first) · wrangler must run from `apps/api`.

**Naming:** the shipped tab names win over DESIGN.md's older ones — **Build · Workflow · Design · Integrate · Settings · Share · Results**, plus the new **Agent** tab (D1). Not "Logic", not "Theme".

---

## Phase 0 — Repo hygiene and safety net (blocking, do first)

### 0.1 `apps/web` is not actually in the repo — fix before writing any code

```
$ git ls-tree HEAD apps/
040000 tree ...  apps/api
160000 commit 0be1d839...  apps/web     ← gitlink
$ cat .gitmodules  → does not exist
$ git -C apps/web log --oneline -1
0be1d83 Initial commit from Create Next App
```

`apps/web` was committed as a **gitlink** (submodule pointer) to the bare `create-next-app` commit, with no `.gitmodules`. Every line of frontend work since then — all 57 source files — is invisible to the parent repo. A `git clone` of chatform produces a project with no frontend.

Fix:
```bash
git rm --cached apps/web            # drop the gitlink entry
rm -rf apps/web/.git                # absorb the nested repo (back it up first)
git add apps/web
git commit -m "fix(repo): absorb apps/web nested git repo into the monorepo"
```
Keep `apps/web/AGENTS.md` committed — `next dev` regenerates it, and committing it is what stops it showing as a permanent uncommitted change.

### 0.2 Working docs
Copy this plan to `/REBUILD.md`. Add a `## Progress log` section at the bottom and append one line per completed task — this is how a future session knows where it stopped.

### 0.3 Tenancy hotfix (do not defer to a "security phase")
This is a live cross-tenant data leak; it ships in phase 0, not phase 9. Detail in **Backend B1**.

### 0.4 Verification gate
`pnpm check` (typecheck + lint + test) must be green before and after every phase. Today `apps/api` has **zero tests** — B9 fixes that. Don't let the count go down.

---

## Shared contract — `packages/form-schema` v2

Both sides build against this, so it lands before either. `packages/form-schema/src/`, and it must go through the migration chain (`SCHEMA_VERSION 1 → 2`) so already-published versions keep rendering forever.

### S1. Form-level agent config — `settings.ts`

Extend `SettingsDoc.agent` (existing fields `mode`, `tone`, `personaPrompt`, `language`, `maxClarificationsPerBlock`, `escalateAfterInvalid`, `sessionTokenBudget`, `responseMaxTokens` all stay):

```ts
agent: {
  // ...existing...
  model: z.string().max(80).optional(),         // OpenRouter slug; undefined = plan default
  goal: z.string().max(1000).optional(),        // "Qualify the lead and book a demo"
  successCriteria: z.string().max(1000).optional(),
  knowledge: z.array(z.object({
    id: NanoId,
    title: z.string().min(1).max(200),
    body: z.string().max(20000),                // inline markdown; R2 key later if we add uploads
  })).max(20).default([]),
  guardrails: z.object({
    answerOffTopic: z.boolean().default(true),  // may it answer questions outside the KB?
    maxTurns: z.number().int().min(5).max(200).default(60),
    refusalMessage: z.string().max(500)
      .default("I'm not sure about that one — but I can pass it on. Back to the form:"),
    forbiddenTopics: z.array(z.string().max(120)).max(20).default([]),
  }).prefault({}),
}
```

`agent.mode` default flips `"hybrid"` → **`"ai"`** for newly created forms (existing docs keep whatever they have). `maxClarificationsPerBlock` is currently parsed and never read — B4 makes it real.

### S2. Per-block agent hints + Youform-parity fields — `blocks.ts`

Extend `BlockBase` (applies to all 26 types):

```ts
agentHints: z.object({
  askStyle: z.string().max(500).optional(),   // "casual, mention it's optional"
  retryHint: z.string().max(500).optional(),  // what to say when they refuse or give junk
  whyWeAsk: z.string().max(500).optional(),   // shown/said if the respondent asks "why?"
  examples: z.array(z.string().max(200)).max(5).default([]),
}).nullable().default(null),

coverImageKey: z.string().nullable().default(null),         // Youform "Cover Image"
coverLayout: z.enum(["float","fill","stack"]).default("float"),
coverPosition: z.enum(["left","right"]).default("left"),
prefillParam: HiddenFieldName.optional(),                    // Youform "Auto fill via URL parameter"
```

Add `buttonLabel` to every *answerable* block (today only `welcome`/`statement` have it) so the Youform "Button Text" field has a home everywhere.

### S3. Migration chain — new `packages/form-schema/src/migrations.ts`

```ts
export function migrateFormDoc(raw: unknown): FormDocInput   // v1 → v2, idempotent
```
v1→v2 is purely additive (every new field has a default), so the migration is `{...doc, schemaVersion: 2}` plus defaults. Call it in exactly two places: `routes/forms.ts` on read, and `SessionDO.ensureLoaded()` on hydrate. **Never** rewrite a `form_versions.schema_json` row in place — published versions are immutable.

### S4. Extraction schemas — new `packages/form-schema/src/extraction.ts`

Per-block-type Zod schemas the LLM extractor targets (B4). One per block type, deriving bounds from the block itself (e.g. `number` → `z.number().min(block.min).max(block.max)`, `single_select` → `z.enum(optionIds)`). This is what turns free text into a validated `AnswerValue` for the 10 block types the current string-matching NLU can't handle.

### S5. Tests
`packages/form-schema/tests/` currently holds the repo's only 22 tests. Add: migration idempotency (`migrate(migrate(x)) === migrate(x)`), every new default materializes, extraction schema per block type accepts good input and rejects out-of-bounds.

### S6. Regenerate the API contract
Any schema change means: run `wrangler dev` from `apps/api`, `curl :8787/openapi.json > openapi.json` at the repo root, kill it, `pnpm gen:api`. Commit `openapi.json` and the generated client together.

---

# PART ONE — BACKEND

`apps/api` (Hono on Cloudflare Workers) and `packages/db`. Existing shape: 25 routed endpoints across 13 route files, one `SessionDO` (752 lines), 27 D1 tables, 8 lib modules.

---

## B1. Tenancy and authorization — **ship in phase 0**

**Problem.** Six routers each re-implement the same 8-line session middleware, none of them scope by organization, and `createAuth(c.env)` — a full Better Auth construction — runs on every request in every one of them. `requireSession` already exists in `routes/dashboard.ts` and is imported by nobody.

**Do:**

1. **One middleware module** — `apps/api/src/lib/guards.ts`:
   - `requireSession` — move the existing one out of `dashboard.ts`; memoize the Better Auth instance per `env` (module-level `WeakMap<Bindings, Auth>`) instead of reconstructing per request.
   - `requireOrg` — resolves the caller's active organization, sets `c.set("orgId", …)`.
   - `requireFormAccess` — loads `forms.id` + `organization_id`, 404s (not 403 — don't leak existence) when it doesn't match `orgId`, and stashes the row on the context so the handler doesn't re-query.
   - `requireApiKey` — the `/v1` guard, now also resolving `organization_id` from the key.
   - `requireSessionOwner` — already in `uploads.ts`; move it here and reuse.
2. **Apply `requireFormAccess`** to: `GET/PUT/DELETE /api/forms/:id`, `/api/forms/:id/doc`, `/api/forms/:id/publish`, `/api/forms/:id/submissions`, `/api/forms/:id/submissions/export`, `/api/forms/:id/analytics`, `/api/forms/:id/preview/sessions`, `POST /api/ai/add-blocks` (scope by its `formId` body field), `GET /v1/forms/:id`.
3. **Org-scope webhook admin** — `DELETE /api/webhooks/:id`, `/test`, `/deliveries` all currently take any id.
4. **Scope `/v1/chat/sessions/:sid/*`** by joining `chat_sessions → forms.organization_id` against the API key's org.
5. **Add the missing router guard** on `templatesRouter` — `GET /api/templates` is currently fully public.
6. **Stop leaking secrets:** `GET /api/webhooks` returns each webhook's signing `secret` — return only a `whsec_…` prefix, and expose the full value once at creation (mirror the API-key pattern already in `keys.ts`).
7. **Hash the form password.** `settings.password.value` is stored and compared in plaintext, and `GET /api/forms/:id` returns the whole doc including it. Store `passwordHash` (PBKDF2/WebCrypto, not the sync pure-JS `sha256Hex`), strip it from every read path, compare in `public.ts`.
8. **Close the SVG XSS.** `image/svg+xml` is in the upload allowlist and `/api/files/:id/download` serves R2 objects with their stored MIME on the API origin. Either drop SVG from `ALLOWED_MIME`, or force `Content-Type: application/octet-stream` + `Content-Disposition: attachment` + `Content-Security-Policy: sandbox` on that route. Do both.
9. **Parameterize** `results.ts:91` — `AND s.status = '${status}'` is interpolated. Enum-guarded today, but it's one refactor away from being a hole.
10. **Captcha bypass:** verification runs only when `settings.captcha.enabled && token present`. Omitting the token skips it. Invert: if `captcha.enabled`, a missing/invalid token is a 400.

**Files:** new `src/lib/guards.ts`; edits across all of `src/routes/*.ts`; `src/lib/auth.ts` (memoize).
**Verify:** two seeded orgs; org A's cookie against every one of org B's form ids returns 404. Add this as a test file (B9).

---

## B2. The agent, part 1 — real tool-calling loop

**Problem.** `lib/ai.ts` exports `runAgentTurn({system, messages, tools: ToolSet})` which drains `result.fullStream` collecting `tool-call` parts. Its own comment says *"Tools are provided by SessionDO; guard() enforcement lives there."* Neither exists. `SessionDO.aiStreamMessage()` calls plain `streamText` with **no tools** and streams the text out. The FSM decides everything; the LLM only picks words.

**Target architecture.** Keep the FSM as the *authority* — PLAN.md's "LLM is a constrained actor, never the controller" is correct and stays. But give the actor real verbs, and validate every one against the FSM before it takes effect.

**Toolset** (new `apps/api/src/do/agent-tools.ts`, built per-turn against the current block):

| Tool | Args | Guard enforced in the DO |
|---|---|---|
| `record_answer` | `{ref, value}` | `ref` must equal `meta.currentRef`; `value` must pass `validateAnswer(block, value)`; on fail → `validation_error` and the model gets the failure as a tool result so it can re-ask in the same turn |
| `ask_question` | `{ref}` | `ref ∈ allowedNextRefs(doc, state)` — the guard helper **already exists** in `engine/evaluate.ts`, unused. Wire it. |
| `answer_from_knowledge` | `{query}` | Returns matching `settings.agent.knowledge` entries. Never advances state. |
| `clarify` | `{reason}` | Capped by `settings.agent.maxClarificationsPerBlock` (parsed today, never read) |
| `skip_current` | `{}` | Rejected unless `settings.navigation.allowSkip` and `!block.required` |
| `request_upload` | `{ref}` | Only for `file_upload`; `signature` gets its own path (B5) |
| `end_interview` | `{endingRef?}` | Must resolve through `resolveEnding(doc, state)` |

**Reliability floor (PLAN.md §4.3, keep it).** Three consecutive tool errors in one session ⇒ permanently drop that session to `template` mode and drive it with the deterministic `phrasing.ts` helpers. The product degrades; it never hangs.

**Turn shape.** Replace `aiStreamMessage(objective)` with `runAgentTurn(...)` from `lib/ai.ts`, streaming assistant text as `token` events exactly as today (the SSE wire format and `lib/events.ts` union do not change — the frontend contract is stable) while dispatching tool calls through the guard. Existing `message_start` / `token` / `message_end` / `question` / `answer_recorded` / `branch_jump` / `validation_error` / `escalate_ui` / `ending` / `complete` events all keep their meaning.

**Two events in `lib/events.ts` are declared and never emitted** — `error` and `rate_limited`. Emit them: `error` when the agent hard-fails, `rate_limited` when B7's limits bite. The frontend (F13) will listen.

**Files:** new `src/do/agent-tools.ts`; `src/do/session-do.ts` (`aiStreamMessage` → `runAgentTurn`, `advanceTo`, `recordInvalid`); `src/lib/ai.ts` (tiered model map); `src/lib/agent-prompts.ts`.

---

## B3. The agent, part 2 — knowledge base and goal

`buildSystemPrompt(doc, currentBlock, answeredCount, context)` in `lib/agent-prompts.ts` is decent already (persona, current objective, a remaining-questions manifest, progress, transcript digest, six hard rules). Extend it:

- **Goal + success criteria** near the top so the model knows what "done well" means, not just "done".
- **Knowledge base.** ≤20 entries, ~20k chars total — small enough to inline; skip embeddings/Vectorize entirely for v1. Put the KB in a **stable prefix position** (system prompt, before any per-turn content) so OpenRouter's prompt caching can hit it. Volatile content — transcript, current block, progress — goes *after*.
- **Guardrails block** from `settings.agent.guardrails`: whether to answer off-topic, forbidden topics, the refusal line, `maxTurns`.
- **Per-block agent hints** (S2) injected when that block is current: `askStyle`, `whyWeAsk`, `examples`, and `retryHint` on a retry.

Keep the existing hard rules — one question per turn, <40 words, answer their question in one sentence then re-ask, never invent refs or options, mirror the respondent's language. The uncommitted working-tree tweak in `session-do.ts` (inlining the target block's title/type into the ask objective + "Ask ONLY that question") is a **good fix** — keep it, and fold the same idea into the prompt builder.

**Prompt caching matters here.** The KB + persona + question manifest is the bulk of every request and is identical across turns. Order the system prompt stable-first, volatile-last, and verify cache hits are non-zero before declaring this done.

---

## B4. The agent, part 3 — free-text understanding

**Problem.** `handleFreeText` is: options → exact/prefix/label match; `yes_no` → a hardcoded word list; numeric types → `Number(text.replace(/\D/g,''))`; everything else → store the raw string. So `date`, `ranking`, `matrix`, `contact_info`, `address`, `payment`, `scheduling`, `legal_consent`, `signature`, `picture_choice` are **unanswerable by typing** — they require the structured widget. In a chat product, that's backwards.

**Do:**

1. **Keep zero-LLM parsing where it already works** (PLAN.md commits to this, and it's right): choice / rating / NPS / yes-no / opinion-scale stay deterministic. Free, instant, no hallucination.
2. **Add an extraction step for everything else** using S4's per-block Zod schemas and `generateObject` on the *cheap* model tier. `date` → ISO. `number` with currency → amount. `contact_info`/`address` → the record shape. `email`/`phone`/`url` keep `validateAnswer`'s existing canonicalization (E.164, lowercasing, `https://` prefixing) as the final step — extraction feeds it, it doesn't replace it.
3. **Ambiguity → clarify, never guess.** If extraction confidence is low or the schema rejects, route to `clarify`, not to a silent bad answer.
4. **`escalateAfterInvalid` still applies** — after N failures, emit `escalate_ui` with the block spec and let the client render a real widget. That escape hatch is good product design; keep it.
5. **Fix `invalidCounts` durability.** It's a `Map` in DO memory; a DO eviction resets the escalation counter and the respondent can loop forever. Persist it into the `"session"` storage blob alongside `answers`/`variables`.
6. **Fix `sessionTokensUsed` durability** — same problem, worse consequence: `sessionTokenBudget` resets to 0 on eviction, so the budget isn't a budget. Persist it.

---

## B5. SessionDO correctness

Concrete bugs in `src/do/session-do.ts`, each independently fixable:

| # | Bug | Fix |
|---|---|---|
| 1 | `action()` doesn't re-arm the idle alarm — a session driven only by skip/restart gets abandoned mid-flow | Bump the alarm in `action()` like `handleUserTurn` does |
| 2 | `action("restart")` resets answers/variables but **not** `meta.status`, `seq`, the `evt:`/`msg:` logs, or `submission_id` — so a restart replays the old transcript into the new conversation and writes into the old submission row | Full reset: new `seq` epoch, clear `evt:`/`msg:` keys, drop `submission_id`, reset status |
| 3 | `signature` blocks emit `upload_request`, the upload path records a `FileDescriptor[]`, and `validateAnswer` wants `{fileId, r2Key, signedName?}` — signature answers **always** fail validation | Give signature its own confirm path that builds the right shape |
| 4 | `evt:` and `msg:` DO storage keys are never pruned | Prune on `finalize`; keep the last `MAX_REPLAY` events for late reconnects |
| 5 | `emit()` awaits every SSE writer — one slow client backpressures the whole turn for everyone on that session | `Promise.allSettled` with a per-writer timeout; drop writers that miss it |
| 6 | `ai_generations.model` is hardcoded `"openrouter/auto"`; `cost_usd_micro` and `latency_ms` are never populated | Log the real model id, wall-clock latency, and computed cost — B7's metering depends on this being true |
| 7 | Fake streaming in template mode chunks on `/\S+\s*/g` and flushes every ≥12 chars | Fine as-is; leave it |

---

## B6. Email — Resend (currently zero senders)

`RESEND_API_KEY` is declared in `Bindings` and used nowhere. `settings.onComplete.notificationEmails[]` and `settings.onComplete.autoReplyEmail{enabled,subject,bodyMd}` are parsed, stored, editable in the UI, and **do nothing**. Youform's Settings → Email Settings (Email to Me / Email to Responder, Reply-To, subject with `@mention` interpolation, rich body) is a headline feature we simply don't have.

**Do** — new `apps/api/src/lib/email.ts`:
- `sendSubmissionNotification(env, {form, submission, answers})` → to `notificationEmails`, Reply-To resolved from a chosen email block's answer.
- `sendAutoReply(env, {form, submission, answers})` → to the respondent's email answer, subject/body from settings.
- **`@mention` interpolation**: `Hi @full_name, thanks!` → resolve `@<block.ref>` against the submission's answers. Same mechanism Youform uses in Email Subject. Escape HTML on every substitution.
- Render markdown → HTML server-side plus a plain-text alternative.
- **Dispatch through `Q_SUBMISSIONS`** — a producer/consumer pair that is declared in `wrangler.jsonc` and currently dead. `finalize()` enqueues; `index.ts`'s `queue()` handler grows a `q-submissions` branch beside the existing `q-webhooks` one. Never send inline from the DO turn.
- Log every send to `audit_logs` (table exists, never written).

---

## B7. Webhooks, integrations, limits, analytics

**B7.1 Webhook fidelity.** `retryFailedDeliveries` (the `*/5 * * * *` cron sweep) **deletes the delivery row and re-enqueues a hardcoded `{event: "submission.completed"}` with no `submissionId`** — so every retry delivers the wrong thing. Also: `consecutive_failures` is a column that's never incremented, and attempt counting does `COUNT(*) WHERE payload = ?`, an O(payload-length) string comparison. Fix all three: store the original event on the delivery row and re-enqueue *that*; increment `consecutive_failures` and auto-disable a webhook after N; count attempts by `delivery_id`. Emit the two declared-but-never-fired events, `session.started` and `form.published` — the UI already offers them as subscribable.

**B7.2 Google Sheets.** New `apps/api/src/routes/integrations.ts` + `src/lib/integrations/sheets.ts`. OAuth connect/callback, spreadsheet picker, header row derived from `blocks` (one column per answerable block, matching the CSV export's column logic in `results.ts` — reuse it), append on `submission.completed`, backfill action. Store tokens in the **`integrations` table, which already exists and has zero code touching it** (`provider`, `config_json`, `status`, `last_error`). Encrypt the refresh token with `FILE_ENCRYPTION_KEY` (also declared, also unused).

**B7.3 Zapier / Make / n8n.** No code. A preset in the integrate UI that pre-fills a webhook with the right event set and links the docs.

**B7.4 Plan limits.** `enforceLimit` and `incrementUsage` are exported from `routes/billing.ts` and **called from nowhere**. The only real metering is an inline `usage_counters` upsert for `responses` inside `SessionDO.finalize`. Wire them: `enforceLimit("responses")` on session create, `enforceLimit("ai_generations")` + `incrementUsage` on both `/api/ai/*` routes and every DO agent turn, `enforceLimit("forms")` on form create, storage on upload intent. Respect `hard_stop_on_overage` — hard on Free, soft on paid. Emit the `rate_limited` SSE event when a limit bites mid-session.

**B7.5 Rate limiting.** The `RATE_LIMIT` binding (100 req / 10s) is declared in `wrangler.jsonc` and never called. Apply it to `/p/*` (per session token) and `/v1/*` (per API key).

**B7.6 Analytics rollups.** `analytics_rollup_daily` has columns for sessions started/completed, avg/median/p90 completion, and `per_block_json` — **only `views` is ever written**, and `/api/forms/:id/analytics` computes everything live with N+1 queries per submission. Add a cron rollup on the existing `*/5 * * * *` trigger; serve dashboards from rollups (PLAN.md §4.4: "dashboards read rollups only"). Add the chat-native metrics that Youform structurally cannot have: **drop-off by conversational turn**, clarifications per block, off-topic-question rate, average turns per block, escalation rate.

**B7.7 N+1 queries.** `GET /api/forms/:id/submissions` and `/export` issue two queries *per submission* (answers + transcript). At 10,000 rows that's 20,000 queries. Rewrite as two batched queries with an `IN (…)` over submission ids, grouped in memory.

---

## B8. Endpoints to add (frontend depends on these)

| Method | Path | Why |
|---|---|---|
| `GET` | `/api/dashboard/summary` | Dashboard KPIs without N round-trips |
| `GET/POST` | `/api/workspaces` | Youform's workspace switcher; the `workspaces` table exists and is never listed |
| `POST` | `/api/forms/:id/duplicate` | Youform has it |
| `GET` | `/api/forms/:id/versions`, `POST /api/forms/:id/versions/:v/restore` | `form_versions` is written and never read back |
| `GET/PUT` | `/api/forms/:id/agent` | Agent tab config (or fold into the doc PUT — decide once, consistently) |
| `POST` | `/api/forms/:id/agent/dry-run` | "Test your agent" without creating a real submission |
| `GET/POST/DELETE` | `/api/integrations/*` | B7.2 |
| `POST` | `/api/uploads/asset` | Cover images, favicons, OG images, avatars — R2 assets owned by the *builder*, not a respondent session |
| `GET/POST/DELETE` | `/api/domains` | Custom domain (Youform parity); CF for SaaS |
| `GET` | `/api/forms/:id/submissions/:sid` | Per-submission permalink |
| `POST` | `/api/forms/:id/translate` | Youform's translate button |
| `GET` | `/api/templates` (real) | Templates are 4 hardcoded objects in `routes/templates.ts`; the `form_templates` table is unused |

Every one gets a `describeRoute` + zod `validator` + `resolver`, then `pnpm gen:api`.

---

## B9. Tests

`apps/api` has **no tests**. Add `vitest` + `@cloudflare/vitest-pool-workers`:
- **Tenancy** (highest value): org A cannot touch org B, for every guarded route. This is the regression test for B1.
- **DO FSM**: linear flow, branch, skip, invalid→escalate, restart, resume-after-eviction, idle abandon.
- **Agent tools**: every guard rejection path — wrong ref, invalid value, out-of-order `ask_question`, skip on a required block, 3-error degradation to template mode.
- **Webhooks**: signature format `t=…,v1=…`, retry preserves the original event, auto-disable.
- **Extraction**: per block type, good input accepted, out-of-bounds rejected.

---

# PART TWO — FRONTEND

`apps/web` — Next.js 16.3.2, React 19.2.8, Tailwind v4 (CSS-first, no config file), shadcn new-york via the unified `radix-ui` package.

> **Next 16 caveat** (`apps/web/AGENTS.md`): this Next version is newer than most training data. `params`/`searchParams` are Promises. Check `node_modules/next/dist/docs/` before writing router code rather than assuming.

---

## F1. Design system foundation

The tokens in `globals.css` (148 lines) are actually good — warm-cream OKLCH, coherent, well-commented. The problem is everything *around* them.

**F1.1 Reconcile tokens with DESIGN.md §4.1.** Shipped values drifted (`--background: oklch(0.98 0.008 85)` vs spec `oklch(0.984 0.007 95)`; chart palette is orange/blue/green/amber/pink vs spec's orange/teal/violet/amber/rose/sky). Pick one and write it down — recommend **adopting the DESIGN.md values**, they're more considered. Add the four tokens the spec defines and the CSS omits: `--primary-hover`, `--primary-soft`, `--success`, `--warning`, `--info`.

**F1.2 Add the missing token layers.** Today there is no spacing scale, no shadow tokens (every shadow is an ad-hoc `shadow-sm`), no typography scale (`text-3xl font-semibold tracking-tight` is copy-pasted across 6+ pages), no z-index scale, no motion tokens.
- **Shadows**, warm-tinted per DESIGN.md §4.3: `--shadow-xs/sm/md/lg`.
- **Typography**: a `@utility` per step of the DESIGN.md scale — `text-display-lg`, `text-h1`, `text-h2`, `text-body`, `text-body-lg`, `text-sm`, `text-xs`. Stop repeating raw utility triplets.
- **Motion**: `--duration-micro: 120ms`, `--duration-standard: 180ms`, `--duration-enter: 220ms`, `--ease-out: cubic-bezier(0.2,0,0,1)`, `--ease-spring: cubic-bezier(0.32,0.72,0,1)`.
- **Z-index**: named steps for sticky header / dropdown / dialog / toast.

**F1.3 Turn dark mode on.** `.dark` is fully defined and completely dead — no `ThemeProvider`, no `suppressHydrationWarning` on `<html>`, and `dark:` appears zero times in app code. `next-themes` is installed and its only consumer is `sonner.tsx`'s `useTheme()`. Add the provider, add `suppressHydrationWarning`, add a toggle in the app header, then sweep every surface. This is roughly a 20-line change that doubles perceived polish.

**F1.4 Install `motion`** (Framer Motion's successor). There is currently no animation library; the entire motion vocabulary in app code is `animate-spin` ×5, `animate-pulse` ×2, `animate-bounce` ×1. Implement DESIGN.md §4.5 exactly: message enter = fade + `translateY(8px)` + `scale(0.985)` over 200ms; typing dots 3×6px on a 900ms loop staggered 150ms; chips staggered 30ms; right-panel crossfade 120ms; **never animate tables, billing, or settings toggles**; and honor `prefers-reduced-motion` — which appears **zero times** in the codebase today.

**F1.5 Bridge the two theme systems.** There are two: the app's OKLCH tokens, and the runtime `--cf-*` chat vars produced by `chatThemeVars()` in `src/lib/chat-theme.ts` from hex strings in `ThemeDoc`. They can't blend because they're in different color spaces. Move `ThemeDoc` colors to OKLCH (or convert at the boundary) so the Design tab can derive hover/soft/border states instead of the current hack: `theme.background === "#faf7f2" ? "oklch(…)" : "transparent"` — a hardcoded magic-value comparison in the bot bubble border.

> **`chatThemeVars` is the "preview ≡ production" contract** — the builder preview and the real `/f/[slug]` runtime both consume it. Changing it changes both. That's the point; don't fork it.

---

## F2. Component layer

**F2.1 Delete the dead, use what exists.** `avatar`, `dropdown-menu`, `tooltip`, `tabs` have **zero importers**. Meanwhile there are **four hand-rolled segmented controls** (builder header, results tabs, share tabs, dashboard create-dialog) and **zero tooltips in the entire product**. Either use the primitives or delete them; don't ship both.

**F2.2 Build the missing primitives** in `src/components/ui/`:
`SegmentedControl` (one implementation, sliding indicator, replaces all four hand-rolls) · `SettingRow` (promote the good one out of `settings-panel.tsx`) · `EmptyState` (DESIGN.md §4.6 lists eight; zero exist) · `PageHeader` · `DataTable` (Results hand-builds `<table>`; add `@tanstack/react-table`) · `ColorField` (native `<input type=color>` today) · `ImageUploadField` · `RichTextField` (Youform's description editor: bold/italic/link/`@mention`) · `Combobox` · `DatePicker` · `CommandPalette` (`cmdk` — DESIGN.md promises ⌘K, it doesn't exist) · `ConfirmDialog` (deletes use `window.confirm`) · `CopyButton` · `Chart` wrappers.

**F2.3 Actually use toasts.** `<Toaster/>` is mounted in the root layout and `toast()` is called **nowhere**. Every save, publish, copy, delete, and error is currently silent or an inline `<p className="text-destructive">`. Wire toasts through a small `useMutationToast` helper so it's consistent rather than sprinkled.

**F2.4 Kill `window.location.reload()`.** Three call sites — the AI bar (after adding blocks), publish, and the chat error retry. This is the single most jarring moment in the product. Replace with query invalidation and optimistic updates.

**F2.5 Add the missing app-shell files.** There is no `loading.tsx`, `error.tsx`, or `not-found.tsx` anywhere in the app. Add them per route group. Replace the two generic `<Skeleton>` rectangles with skeletons that match the layout they precede.

**F2.6 Drop dead deps.** Ten individual `@radix-ui/react-*` packages are installed alongside the unified `radix-ui` package that the code actually imports from. `@tanstack/react-query-devtools` is installed and never mounted (mount it in dev).

---

## F3. Information architecture

**F3.1 Builder tabs become real routes.** Today `(builder)/forms/[id]/page.tsx` is 5 lines delegating to a 592-line `BuilderClient` that switches on `useState<BuilderView>`. Consequences: no URL per tab, no browser back, no per-tab code splitting (so `@xyflow/react` + `workflow-client.tsx`'s 1,251 lines are in the initial builder bundle), no per-tab loading/error boundaries, and the product tour's `[data-tour]` targets only exist when the right view happens to be mounted.

```
(builder)/forms/[id]/
  layout.tsx          ← AuthGuard + BuilderHeader + doc store provider (persistent chrome)
  build/page.tsx
  agent/page.tsx      ← NEW (D1)
  workflow/page.tsx   ← lazy; xyflow leaves the main bundle
  design/page.tsx
  results/page.tsx
  share/page.tsx
  integrate/page.tsx
  settings/[section]/page.tsx
```
`/forms/[id]` redirects to `/forms/[id]/build`. Tab order — **Build · Agent · Workflow · Design · Results · Share · Integrate · Settings**.

**F3.2 One header, and it stops lying.** The current header's tab list and the running app disagree (screenshot shows *two* "Settings" entries and a "Theme" label where the code says "Design"). One `BuilderHeader` in the layout, one source of truth for tab definitions, active state from `usePathname()`. Below `lg` the tabs currently collapse to a **native `<select>`** — replace with a proper responsive treatment. Also: **Publish is disabled while `dirty`**, so a user who just typed must wait out the 800ms autosave debounce before they can publish. Make Publish flush the pending save instead.

**F3.3 Real builder state.** `FormDoc` lives in one `useState` in `builder-client.tsx` and is prop-drilled into eight panels. There's no undo/redo, no keyboard shortcuts, no dirty-navigation guard. Add **zustand + immer + a temporal (undo) middleware** — DESIGN.md §5.3 specifies exactly this, cap 100, drag coalesced — in `src/stores/builder-store.ts`, provided from the builder layout so it survives tab navigation.

**F3.4 Autosave conflicts.** DESIGN.md §5.4 specifies `{baseVersion}` on the doc PUT and a `409 VERSION_CONFLICT` → "Reload theirs / Keep mine" dialog. Neither side implements it. Add it (backend: `forms.updated_at` or a version counter as the precondition).

**F3.5 App shell.** Add the workspace switcher (Youform's leading nav element; `/api/workspaces` from B8), ⌘K command palette, a usage pill (`847/1000 responses` — `/api/billing/usage` exists and is never called), a real avatar menu using the unused `avatar` + `dropdown-menu` primitives. `AppNav` currently overflows on small screens with no mobile treatment. `DashboardShell` and `AuthGuard` duplicate the same session-gate logic — extract one.

**F3.6 Fix the tour.** `product-tour.tsx` sets `popoverClass: "chatform-tour"` and **no `.chatform-tour` CSS exists** — driver.js renders in raw default styling, completely off-brand. Also `builderSteps` targets `[data-tour='builder-publish']`, which is **set on no element**, so that step fails to anchor. Style it and fix the anchors, or cut the tour.

---

## F4. Build tab — the block inspector

This is the single biggest product gap. Today the inspector renders, for **all 26 block types**: title (Textarea), description (Input), required (Switch) — plus a conditional options list and a rating `scale` `<select>`. Everything else in the schema is unreachable: `minLength`/`maxLength`, `placeholder`, `min`/`max`, `integerOnly`, `currency`, `allowOther`, `minSelections`/`maxSelections`, `shape`, `steps`/`startAt`, `accept`/`maxFiles`/`maxSizeMB`, `amount`, `consentText`, `buttonLabel`, `yesLabel`/`noLabel`, `businessOnly`, `countryHint`, `disablePast`, `dateFormat`. Some of these *are* editable in `workflow-client.tsx`'s separate `BlockInspector` — **the two inspectors have drifted apart** and must be unified.

**F4.1 One inspector, per-type.** `src/components/builder/inspectors/<type>.tsx`, one file per block type, exporting a schema-driven form. A shared `<InspectorSection>` wrapper gives every type the common fields. Both the Build tab and the Workflow node inspector render the same component.

**F4.2 Complete the block library.** Only **16 of 26** types are addable. Missing: `url`, `dropdown`, `picture_choice`, `ranking`, `matrix`, `signature`, `scheduling`, `contact_info`, `address`. (`welcome` is intentionally non-addable.) The Build palette and the Workflow palette are two different lists that have also drifted — one shared `BLOCK_LIBRARY` const.

**F4.3 Youform parity in the inspector** (per the screenshots): block **type switcher** at the top (change type in place, preserving what's compatible) · **rich-text Description** with bold/italic/link/`@mention` · **Button Text** · **Required** toggle with its explanatory sub-line · **Auto fill via URL parameter** (`prefillParam`, S2) · **Cover Image** with Layout (Float/Fill/Stack) and Position (Left/Right) · per-type extras like Email's "Accept only business emails" (`businessOnly` — already in the schema, unreachable in the UI) and "Email verification".

**F4.4 Block list.** Youform color-codes by block family, numbers each row, shows the required `*`, and has hover `+` insertion points above and below every block. Ours: a grip, an index, a truncated title, a `*`, and a hover-revealed `Trash2` that is a **bare `<svg onClick>`** — not a button, no keyboard access, no confirm. Fix all of that, add duplicate, add a "Thank you page" / endings section at the bottom of the list (Youform has one; our `endings[]` array is currently only reachable from the workflow canvas), add drag overlay and drop indicators to the existing dnd-kit setup.

**F4.5 The AI bar.** Today: a bare `<input>` (not the `Input` component) POSTing to `/api/ai/add-blocks` with a hardcoded `count: 3`, then `window.location.reload()` after 600ms. Make it stream, show a **diff preview** of what the AI wants to change with accept/reject per block, and make it undoable through the new store. Voice input (Youform has a mic) is optional — Web Speech API, progressive enhancement.

**F4.6 Preview.** `preview-chat.tsx` restarts the preview session on **every `refreshKey` change, i.e. every autosave** — so the conversation resets while you type. Restart only on explicit user action or on a structural change (block added/removed/reordered), never on a title keystroke.

---

## F5. Agent tab (new — the differentiator)

`(builder)/forms/[id]/agent/page.tsx`. Left sub-nav, right content:

- **Persona** — name, avatar, tone (friendly/professional/playful), `personaPrompt`, greeting override.
- **Goal** — `goal` + `successCriteria`, in plain language with examples.
- **Knowledge** — the KB entry list (title + markdown body), inline editor, char budget meter against the ~20k cap, plus a "paste a URL / paste text" import path.
- **Guardrails** — `answerOffTopic`, `forbiddenTopics`, `refusalMessage`, `maxTurns`, `escalateAfterInvalid`, `maxClarificationsPerBlock`, `sessionTokenBudget`, `responseMaxTokens`.
- **Model** — picker (Sonnet 5 default per D4), with a plan gate rendered as an **upsell popover rather than a hidden control** (DESIGN.md §5.8: gates should be discoverable).
- **Test panel** — a live sandbox chat against `/api/forms/:id/agent/dry-run` (B8), showing tool calls and token spend inline so a builder can see *why* the agent did what it did. This is the debugging surface that makes the agent layer trustworthy.

---

## F6. Chat runtime — `/f/[slug]`

The most complete surface we have, and still missing table stakes. `chat-client.tsx` (531) + `use-chat.ts` (232).

**F6.1 Bugs to fix first.**
- **No auto-scroll.** There is no `scrollIntoView` or scroll ref anywhere in the chat. Long conversations require manual scrolling. Add smooth auto-scroll, suppressed when the user has scrolled up, with a "jump to latest ↓" pill (DESIGN.md §4.5).
- **`uploadSpec` is destructured and never referenced** — the `upload_request` SSE event drives nothing.
- **`FileUploadControl`'s `onSubmit` is an empty function.** The "Send file" button clears local state and does nothing else.
- **`sendStructured(ref, value, display)` discards `display`** (`void display;`) — no optimistic echo, so the chip you tapped round-trips through the server before you see it.
- **Two `inputRef`s with the same name** in `Composer`; the focus effect targets whichever mounts last.
- **The `f/[slug]` server component silently falls back to a hardcoded ~30-line empty `PublicFormConfig`** when the API fetch fails — a dead API or a bad slug renders a plausible-looking empty chat instead of a 404.
- **Bot bubble border** is `theme.background === "#faf7f2" ? "oklch(…)" : "transparent"` — replace with a derived token (F1.5).
- **On every reconnect `use-chat` calls `setMessages([])`** and relies on server replay. Correct given durable replay, but pair it with a visible reconnect state so it doesn't look like a wipe.

**F6.2 Missing UX.**
- **Progress bar.** `config.progressBar` supports `percent | steps | none`; only `percent` is implemented, and only as text in the header. No bar exists. Build both modes.
- **Typing indicator during generation.** The bouncing dots render only while `status === "connecting"`, never while the assistant is actually thinking.
- **Streaming caret** is a static `after:content-['▍']` — no blink.
- **Markdown.** Zero rendering, despite `bodyMd` on endings and markdown in KB answers. Add `react-markdown` with a strict allowlist.
- **Ending CTA.** `ctaLabel`/`ctaUrl` are parsed in `use-chat` and **never rendered**; `settings.onComplete.redirectUrl` is never acted on.
- **Resume banner** — "👋 You were halfway through — 4 answers saved." Partial state already persists server-side (`projectAnswer` writes every accepted answer immediately); nothing surfaces it.
- **`aria-live`** for streamed messages, roving tabindex on chips, ≥44px targets, keyboard-complete flow (DESIGN.md §3.6).

**F6.3 Per-block composers.** Current state: `dropdown` renders as pills (not a dropdown) · `picture_choice` ignores `imageKey` and shows text pills · `rating` uses **emoji** (`⭐`/`🧡`) with `hover:scale-125`, no half-steps, no labels · `nps`/`opinion_scale` have no anchor labels · `date` gets a **plain text input** · `payment` is the literal string "Payments are coming soon." · `signature` **reuses the file uploader** — there is no signature pad · `url`, `phone`, `contact_info`, `address`, `ranking`, `matrix`, `scheduling` all fall through to a plain text input. Build a real composer per type, and keep the "…or just type your answer" affordance alongside — with B4's extraction behind it, typing will finally work for all of them.

**F6.4 Embed.** `public/embed.js` exists and is verified working. Wire the missing settings: `initial loader`, `navigation arrows`, `refill link`, `anonymous survey`, `powered-by` (all Youform General-settings toggles; several already exist in our schema and do nothing). Confirm the iframe strategy holds and the shell stays under DESIGN.md's 60KB gzip budget.

---

## F7. Results

`results-client.tsx` (364 lines): three sub-tabs on local state, a hand-built `<table>`, div-based bars, and **no charts at all** (no chart library is installed). `BLOCK_ICON` is a map of emoji glyphs (`"✉"`, `"📅"`, `"★"`) while everything else in the product uses lucide.

- **Submissions** — `@tanstack/react-table`: sticky header, one column per question with a typed icon, column show/hide + resize, sort, pagination, row selection, bulk delete/export, per-row permalink. Completed/Partial pills with counts (Youform shows `Completed 2 / Partial 4`). Fullscreen toggle.
- **Transcript-first detail.** DESIGN.md north star #3: *"Every response is stored and displayed as a transcript first, fields second."* Row click → a split view with the full conversation on the left, extracted answers on the right, and — new — which answers the agent had to clarify or re-ask. Youform structurally cannot show this.
- **Summary** — real charts (install `recharts`, which PLAN.md already picked) driven by `--chart-1..6`, which are **defined in CSS and used nowhere**.
- **Analytics** — the 6 KPI cards currently wrap badly; fix to a 3×2 grid. Add drop-off by conversational turn, completion funnel, time-to-complete distribution, device/country breakdown, and the agent metrics from B7.6.
- **Export** — the download button is a raw `<a href={API_ORIGIN}/…/export} download>` styled as a button, bypassing the authenticated fetch layer entirely. Route it through the API client, add XLSX, add filtered export.

---

## F8. Settings, Share, Integrate, Design

**Settings** — 7 sections today, **two of them both labeled around "Access"** ("Access" and "Access & closing"), and Mode/Tone use native `<select>` while the shadcn `Select` sits unused (its only consumer is `theme-panel`). Restructure to Youform's shape, as `settings/[section]` routes: **General · Email · Access · Hidden fields & variables · Link & social · Language · Danger zone**. General gets the Youform display toggles: progress bar, initial loader, navigation arrows, refill link, reCaptcha, powered-by, anonymous survey. Email gets B6's Email-to-Me / Email-to-Responder tabs with `@mention` interpolation. Link & social gets title, description, social preview image, favicon, a **live preview card** (Youform's is a nice touch), and custom domain.

**Share** — the current page has a QR code fetched from **`api.qrserver.com`** (third-party, unstyled, with an eslint-disable) and a **stray orphan `<QrCode>` lucide icon rendered alone at the bottom** — leftover debris. Generate QR locally, offer PNG/SVG download, and build out the three Youform modes: share link (with social buttons), embed in website (inline / popup / side-tab / full-page, each with a live preview and a copyable snippet), embed in email.

**Integrate** — Youform's layout is "Connected" over "Connect more tools". Ours is webhooks-only with a hardcoded snippet baked with `https://app.chatform.dev` and `localhost:8787`. Rebuild as a real registry: connected list with status, available grid (Webhook, Google Sheets, Zapier, Make, n8n, Slack-via-webhook), per-integration config drawer, and a **delivery log** — `useGetApiWebhooksByIdDeliveries` is generated and never used.

**Design** — presets are fine. Fix: free-text `Input`s for heading/body font names with no picker, no validation, and **no font loading** (a typed font name simply won't render on the public page). Add a font picker with a curated list that actually loads, a live preview that isn't the current hardcoded fake (`ThemePreview` has literal strings "What's your email?" / "grace@hopper.dev" and is `lg:block`-only, disappearing entirely on smaller screens), avatar upload, background image, dark/light/auto scheme (`colorScheme`, `avatarKey`, and `backgroundImageKey` are all in `ThemeDoc` and all **ignored by the chat client** — HANDOFF §4 flagged this and it's still open).

---

## F9. Dashboard, templates, auth, marketing

- **Dashboard** — search and sort state are both declared and **neither is rendered as a control** (`Search` and `ArrowUpDown` are imported and unused); the loading state is the literal string `Loading…`; sort is `id.localeCompare` as a newest-proxy; delete is `window.confirm`. Render the controls, add the workspace switcher, a per-card `⋯` menu (rename / duplicate / move / archive / delete), real relative timestamps, response-count sparkline, list/grid toggle, and a proper `EmptyState`.
- **Templates** — back it with the `form_templates` table instead of 4 hardcoded objects; add preview-before-use, search, categories.
- **Auth** — signin/signup share one component with a mode toggle; signup POSTs to `/api/auth/organization/create` with a random slug and **no error handling**. Split, add validation, error states, forgot-password, OAuth if desired.
- **Landing `/`** — the only real server component with content, and it **never shows the product**. Add a live demo chat embedded on the page (we have an embeddable widget — use it), real screenshots, the Youform-comparison angle, and pricing.

---

## F10. Data layer — stop bypassing orval

HANDOFF §2 constraint 2 says all data fetching goes through generated hooks. Reality: orval generates ~30 hooks across four tag-split modules and **three are used**. Everything else hand-rolls `useQuery({ queryFn: () => customFetch<unknown>(...) })` with a locally-declared `interface FormRow` and an `as unknown as` cast — repeated in dashboard, templates, api-keys, usage, integrate-client, and results-client. Worse, the three hooks that *are* used in `results-client.tsx` are all called with `formId as never`, meaning the generated signatures don't match what the API actually accepts.

**Do:** fix the OpenAPI annotations so the generated signatures are right (that `as never` is a symptom of a bad spec, not a bad hook), regenerate, then migrate every hand-rolled query. Delete the duplicated local interfaces in favor of `generated.schemas.ts`. Add a `qk.*` query-key factory (DESIGN.md §5.2). Keep `customFetch` — it's solid; note that its `Headers`-instance construction is load-bearing (HANDOFF §5) and must not be "simplified".

**Also:** every authenticated page is a client-side session-check → skeleton → data-fetch → content waterfall. Move what can move to server components with cookie-forwarded fetches.

---

## F11. Responsive, a11y, performance

- **Responsive is essentially unaddressed.** The builder is a fixed `w-72 / flex-1 / w-80` three-pane with no mobile story; the settings panel has a hardcoded `maxHeight: "calc(100svh - 220px)"`; `ThemePreview` and the workflow `MiniMap` simply vanish below their breakpoints. Give the builder a real tablet/mobile layout (bottom sheet inspector, drawer block list). The **chat runtime must be flawless on mobile** — that's where respondents actually are.
- **A11y**: focus-visible audit, skip link, `aria-live` in chat, keyboard-accessible block list (currently `<svg onClick>`), labeled icon buttons, AA contrast in both themes, 200% zoom, `prefers-reduced-motion` (currently zero occurrences).
- **Performance**: DESIGN.md §0 budget is `/f/[slug]` TTI < 1.5s on mid-tier Android and ≤60KB gzip widget core. Route-split the builder tabs (F3.1), lazy-load xyflow, subset the three Google fonts (currently all three load on every route including the public form, with no `display` or `weight` tuning), add `next/image` config (there is none).

---

## F12. Testing

No test runner in `apps/web` at all (`turbo run test` finds nothing). Add Vitest + Testing Library for the store, reducers, and per-block composers; Playwright for the critical E2E paths (signup → create form → add blocks → publish → fill as respondent → see the submission; agent answers an off-topic question and returns to the form; resume a partial session).

---

## F13. Frontend wiring for new backend events

`lib/events.ts` declares `error` and `rate_limited` and never emits them; B2 makes them real. Add listeners in `use-chat.ts`. Same for the agent's tool-call telemetry consumed by the Agent tab's test panel (F5).

---

# Execution sequence

Phases are ordered by dependency and by D2 (foundations before features). Each ends with `pnpm check` green and a `## Progress log` line in `/REBUILD.md`.

| Phase | Contents | Gate |
|---|---|---|
| **0** | Repo hygiene (0.1–0.2) · **B1 tenancy** · guards module | Cross-tenant test suite passes |
| **1** | `form-schema` v2 (S1–S5) · migration · `pnpm gen:api` (S6) | Migration idempotency tests; existing forms still load |
| **2** | F1 design system · F2 component layer · dark mode · motion | Every existing screen renders correctly in both themes |
| **3** | F3 IA — builder route split, zustand store, header, app shell, autosave conflict | Deep links work; back button works; xyflow out of the initial bundle |
| **4** | F4 inspector + complete block library · F5 Agent tab (UI against S1) | All 26 block types addable and fully editable |
| **5** | F6 chat runtime rebuild · F10 data layer cleanup | Every block type answerable by widget; auto-scroll, progress, markdown, endings |
| **6** | **B2 + B3 + B4** — tools, knowledge base, extraction, model tiering (D4) · B5 DO fixes | Off-topic question answered from KB then re-asked; free-text `date`/`address` extraction works; 3-tool-error degradation verified |
| **7** | B6 email · B7 webhooks/Sheets/limits/rollups · B8 new endpoints · F8 Settings/Share/Integrate/Design | Real notification email delivered; Sheets row appended; a Free-plan overage hard-stops |
| **8** | F7 Results + charts · F9 dashboard/templates/auth/landing | Analytics served from rollups; transcript-first detail view |
| **9** | F11 responsive/a11y/perf · B9 + F12 tests · docs | Budgets met; E2E suite green |

**Do not reorder 0 before anything, or 1 before 2** — the schema shape drives every surface built afterward.

---

# Verification

**Per phase.** `pnpm check` (typecheck + lint + test) from the repo root. Screenshot every changed surface in both light and dark before calling it done.

**Local run.** `pnpm dev` → API on `:8787`, web on `:3000`. Seeded account `grace@hopper.dev` / `supersecret123` (org "Acme Inc"), form slug `launch-survey-ec68e1`. Wrangler must be run from `apps/api`.

**Spec refresh ritual** (any route change): `wrangler dev` from `apps/api` → `curl :8787/openapi.json > openapi.json` at the repo root → kill → `pnpm gen:api` → commit spec and client together.

**Manual E2E — the acceptance script.**
1. Sign up → create a form from a template → open the builder.
2. Add one block of **every** type; confirm each one's full inspector renders and edits round-trip.
3. Agent tab: set a persona, a goal, and one KB entry ("Our Pro plan is $29/month").
4. Preview: the agent greets, asks, and accepts a **typed** answer for `date`, `address`, and `single_select`.
5. Type **"how much does the Pro plan cost?"** mid-form → the agent answers from the KB in one sentence and re-asks the current question. *This is the acceptance test for the entire product thesis.*
6. Give three deliberately bad answers → escalation UI appears with a real widget.
7. Publish → open `/f/[slug]` in a private window → complete the form.
8. Results: submission appears; the transcript view shows the whole conversation including the off-topic exchange; CSV exports.
9. Notification email arrives; the Sheets row appends; the webhook delivers with a valid `t=…,v1=…` signature.
10. **Tenancy:** a second account cannot reach form 1 by id on any route.
11. Close the tab mid-form, reopen the link → resume banner, answers intact.
12. Repeat 4–7 on a phone.

**Browser verification** is available via the Chrome MCP tools — use it for the screenshot passes rather than trusting that the CSS landed.

---

# Known risks

| Risk | Mitigation |
|---|---|
| Schema v2 breaks already-published forms | `form_versions.schema_json` is immutable and read through `migrateFormDoc` on load; never rewritten in place. Migration is purely additive. |
| Agent quality regresses vs. the deterministic FSM | The FSM stays authoritative; every tool call is guarded. Three tool errors ⇒ permanent template-mode fallback for that session. |
| Sonnet 5 cost | KB + persona in a stable prompt prefix for cache hits; cheap tier for extraction; `sessionTokenBudget` made durable (B4.6) so it's a real cap; per-form model override. |
| Route-splitting the builder loses state across tabs | zustand store provided from the builder `layout.tsx`, above the tab routes. |
| Rebuilding `chatThemeVars` breaks preview≡production | It's one shared function consumed by both. Change it once; screenshot both surfaces every time. |
| Scope | Phases are independently shippable. If time runs out, stopping after phase 6 still yields a genuinely better product than today. |

---

## Progress log

Append one line per completed task. This is how a future session knows where execution stopped.

- **P0.1** ✅ `apps/web` gitlink removed, nested `.git` absorbed, 57 source files now tracked (`9d2df0a`).
- **P0.2** ✅ `REBUILD.md` created at repo root.
- **P0.3 (B1)** ✅ Tenancy closed. New `apps/api/src/lib/guards.ts` (`requireSession`/`requireOrg`/`requireFormAccess`/`requireApiKey`/`requireSessionOwner`/`assertFormAccess`/`assertChatSessionAccess`, memoized Better Auth). Applied across forms, results, preview, ai, keys, webhook-admin, templates, billing, uploads, v1. Cross-tenant ids now 404. Also: `GET /api/templates` no longer public; webhook list returns `secretPreview` not `secret`; webhook delete/test/deliveries org-scoped; SVG dropped from the upload allowlist and `/api/files/:id/download` forced to `application/octet-stream` + `nosniff` + CSP sandbox and org-scoped; captcha no longer bypassable by omitting the token; `results.ts` status filter bound instead of interpolated; new `lib/crypto.ts` with `timingSafeEqual` + PBKDF2 `hashPassword`/`verifyPassword`, form-password compare now constant-time and hash-aware.
- **P0.4** ✅ Test harness for `apps/api`: vitest 4 + `@cloudflare/vitest-pool-workers` 0.22 running in the real Workers runtime against real bindings and the real drizzle migrations. `tests/tenancy.test.ts` — 15 tests, verified to fail when a guard is removed. Monorepo total 37 tests.

### Deferred, deliberately
- ~~**Password at rest**~~ — resolved in P1 below.

---

## Phase 1 — shared contract (`form-schema` v2)

- **S1** ✅ Agent layer on `SettingsDoc.agent`: `model`, `goal`, `successCriteria`, `displayName`, `knowledge[]` (≤20 entries, `KNOWLEDGE_CHAR_BUDGET` 20k, `knowledgeSize()` helper), `guardrails{answerOffTopic,maxTurns,refusalMessage,forbiddenTopics}`. `mode` default flipped `hybrid` → **`ai`** (D1). `password.value` documented and now stored as a PBKDF2 hash.
- **S2** ✅ `BlockBase` gains `agentHints{askStyle,retryHint,whyWeAsk,examples}`, `coverImageKey`/`coverLayout`/`coverPosition`, `prefillParam` (Youform "auto fill via URL parameter"), and `buttonLabel` on every block — applies to all 26 types.
- **S3** ✅ `packages/form-schema/src/migrations.ts` — `migrateFormDoc`/`needsMigration`, `SCHEMA_VERSION` 1 → 2. Migration happens **on read, never as a rewrite**: published `form_versions` rows stay byte-identical. Wired into every read path — `routes/forms.ts` (get/publish/doc), `public.ts`, `v1.ts`, `preview.ts`, `ai.ts`, `results.ts` export, and `SessionDO.ensureLoaded`.
- **S4** ✅ `packages/form-schema/src/extraction.ts` — per-block Zod extraction targets built *from* the block so the model is bounded by the same limits `validateAnswer` enforces, plus `DETERMINISTIC_TYPES` / `OUT_OF_BAND_TYPES` / `needsExtraction()` / `extractionGuidance()`. The `{value, confident, note}` envelope routes low confidence to a clarify turn instead of recording a guess.
- **S5** ✅ `tests/schema-v2.test.ts` (17 tests): migration idempotency, future-version safety, every new default materializing, agent config round-trip, knowledge cap, per-block hints, and each extraction schema's accept/reject behavior. `apps/api/tests/schema-migration.test.ts` (4 tests): v1 rows read back as v2, stored rows unchanged by a read, password hashed on save, no double-hashing.
- **S6** ✅ `openapi.json` regenerated (25 → 31 paths — the committed spec was stale) and orval client regenerated. Fixed the CSV export route's missing `responses`, which was failing orval's spec validation.
- **Also** ✅ `SessionDO` now persists `invalidCounts` and `sessionTokensUsed` into the session blob. Both were memory-only, so a DO eviction reset the escalation counter (respondent could loop forever on a bad answer) and reset the token budget to zero (`sessionTokenBudget` was not actually a cap).

Monorepo tests: **58 passing** (was 22 at session start).

---

## Phase 2 — design system

- **F1** ✅ `globals.css` rewritten as a real system: token values reconciled with DESIGN.md §4.1 (shipped values had drifted), the four missing brand/status tokens added (`primary-hover`, `primary-soft`, `success`/`warning`/`info` + soft variants), spec chart palette, warm-tinted shadow scale, named typography scale (`text-display-lg` … `text-micro`, `tabular`), motion duration/easing tokens, z-index scale, warm scrollbars, visible focus, shared keyframes, global `prefers-reduced-motion` collapse, and the full `--cf-*` chat surface with `bubble-bot`/`bubble-user` utilities.
- **F1.3** ✅ **Dark mode now exists.** `.dark` was fully defined and completely dead — no `ThemeProvider`, so the class was never applied and `dark:` never fired anywhere. Added `components/theme/theme-provider.tsx` + a three-state light/system/dark `ThemeToggle`, and `suppressHydrationWarning` on `<html>`. Verified in-browser.
- **F1.4** ✅ `motion` installed. Also `cmdk`, `recharts`, `@tanstack/react-table`, `react-markdown`, `remark-gfm`, `date-fns`, `zustand`, `immer`. Dropped 10 redundant individual `@radix-ui/*` packages.
- **F1.5** ✅ `chatThemeVars` emits the full `--cf-*` set and derives muted/border/chip states from the theme's own colors. The bot-bubble border was previously decided by string-comparing the background against a hardcoded default hex, which broke for every custom theme.
- **F2** ✅ New primitives: `SegmentedControl` (replaces four hand-rolled copies; sliding pill via scoped `layoutId`), `EmptyState`, `PageHeader`, `ConfirmDialog` + `useConfirm` (replaces `window.confirm`), `CopyButton`, `SettingRow`/`SettingGroup`, `StatCard`. `Button` gains `shape="pill"` (every call site was appending `rounded-full`), a `soft` variant, and press-scale motion instead of a hover lift.

---

## Phase 3 — information architecture

- **F3.1** ✅ **Builder tabs are real routes.** `(builder)/forms/[id]/{build,agent,workflow,design,results,share,integrate,settings}` each have a `page.tsx` under a shared `layout.tsx`. `/forms/[id]` redirects to `/build`. Every tab now has a URL, the back button works, and code splits per tab — the 202 KB xyflow chunk is no longer in the builder's initial bundle (verified in the build manifest).
- **F3.2** ✅ One `BuilderHeader` in the layout, driven by a single `BUILDER_TABS` const. The running app previously showed "Settings" twice and labelled the theme tab "Theme" while the state value was `"design"`. Publish now **flushes** the pending autosave instead of being disabled while dirty. Save state has five named states including error and offline; there was previously no indication at all when a save failed. Removed the duplicate `AuthGuard` layout (double chrome).
- **F3.3** ✅ `stores/builder-store.ts` — zustand + immer, bounded 100-step undo/redo with 600ms coalescing so a burst of typing is one undo step, selection state, and block operations. Deleting a block also drops logic rules that referenced it, so the builder can never hold a doc that fails publish lint. ⌘Z/⇧⌘Z wired.
- **F3.4** ✅ `hooks/use-autosave.ts` — debounced save with in-flight queueing, a `beforeunload` guard (edits inside the 800 ms debounce were silently lost), and `flush()` for publish.
- **Removed** ✅ `builder-client.tsx` (592-line monolith) deleted.

---

## Phase 4 — builder depth

- **F4.1/F4.2** ✅ `block-library.ts` — one library, **all 25 addable types**. Nine were previously unreachable from the builder entirely (`url`, `dropdown`, `picture_choice`, `ranking`, `matrix`, `signature`, `scheduling`, `contact_info`, `address`), and the Build and Workflow palettes had drifted into two different lists. Each type carries an icon, colour family and description. `default-block.ts` gives every type a sensible starting shape with collision-safe refs.
- **F4.3** ✅ `inspector/` — `fields.tsx` primitives plus `type-fields.tsx` covering **every schema field for all 26 types**. The old inspector rendered exactly three controls (title, description, required) regardless of type, so length limits, placeholders, min/max, `allowOther`, selection counts, rating shape, scale bounds, accepted file types, currency, consent text, button labels and `businessOnly` were all unreachable. Adds the block **type switcher**, agent hints (`askStyle`/`whyWeAsk`/`retryHint`), `prefillParam` (Youform "auto fill via URL parameter") and per-block `buttonLabel`.
- **F4.4** ✅ `block-list.tsx` — colour-coded typed rows, hover insertion points between blocks, duplicate, real focusable buttons with tooltips (delete was a bare `<svg onClick>`), confirm-on-delete, and an **Endings section** (previously only reachable from the workflow canvas). New searchable grouped block picker replaces the cramped 16-button grid.
- **F4.5** ✅ `ai-bar.tsx` — proposes blocks and shows them for accept/reject, applied as **one undo step**. The old bar called `window.location.reload()` 600 ms after the request, losing selection, scroll and any unsaved edit.
- **F4.6** ✅ `preview-chat.tsx` restarts only on structural change or explicit request. It was wired to the autosave counter, so the preview conversation reset itself on every keystroke.
- **F5** ✅ **Agent tab** — persona/mode/tone, goal + success criteria, knowledge base with a live character-budget meter, guardrails (off-topic policy, forbidden topics, refusal line, max turns, escalation), and model selection defaulting to Claude Sonnet 5. Live preview pinned beside it.
- **F3.1 bonus** ✅ The inspector's "Add branching logic" now passes `?focus=<ref>` to the workflow route — `WorkflowClient` always accepted a `focusRef` and nothing ever supplied one.

---

## Phase 5 — chat runtime

- **F6.1 bugs fixed** ✅
  - **Auto-scroll** — there was none at all, so any conversation longer than the viewport needed manual scrolling after every turn. Follows the bottom, releases when the respondent scrolls up, offers a "Jump to latest" pill.
  - `sendStructured`'s `display` argument was discarded (`void display`), so tapping a chip showed nothing until the server echoed back. Now optimistically echoed and de-duplicated against the server's `user_message`.
  - `uploadSpec` was destructured and never referenced — the `upload_request` event drove nothing.
  - `FileUploadControl.onSubmit` was an empty function; a failed confirm looked identical to a success. Rewritten with real drag-and-drop, per-file state and surfaced errors.
  - `f/[slug]` silently fell back to a hardcoded empty `PublicFormConfig` on API failure, so a bad slug rendered a plausible chat that would never ask anything. Now `notFound()`.
  - Bot-bubble border was decided by comparing the theme background to a literal hex; now derived in `chatThemeVars`.
  - Duplicate `inputRef` in the composer removed.
- **F6.2 missing UX** ✅ Real **progress bar** (`percent` and `steps` — only the percent *text* existed, no bar anywhere); **typing indicator during generation** (previously shown only while connecting); blinking streaming caret; **markdown rendering** with a strict element allowlist (model output is untrusted); **ending CTA** (`ctaLabel`/`ctaUrl` were parsed and never rendered) and **redirect** honoured; resume banner; `aria-live` announcements; reconnect with exponential backoff + jitter and a visible "Reconnecting…" state; inline retry that reconnects the stream instead of reloading the page.
- **F6.3 composers** ✅ Every block type now has a real control. Rating uses fill-to-the-left lucide icons instead of emoji; NPS/opinion scales show anchor labels; **date gets a real calendar** with min/max/`disablePast` and quick options (it was a plain text input); **signature gets a real pointer-events pad** (it reused the file uploader, and the recorded shape was one `validateAnswer` rejects outright, so signatures could never succeed); ranking, matrix, contact_info and address get purpose-built composers (all four previously fell through to a text input that could not produce the required shape); payment shows an honest state rather than presenting "coming soon" as the control. Number-key shortcuts for choice lists, 44px touch targets.
- **Schema** ✅ `toPublicBlock` now projects the fields the runtime needs (`minDate`/`maxDate`/`disablePast`, `url`, `drawnNameRequired`, number bounds, selection bounds, `allowOther`). `toPublicConfig` projects `settings.meta` — the hosted form previously had **no OG tags at all**, so every share preview was blank — plus the agent's display name.
- **Verified E2E over HTTP**: session create → SSE greeting → conversational question → answer accepted → `answer_recorded` at 50% → contextual next question referencing the actual answer. `/f/<slug>` returns a real title and OG tags; an unknown slug 404s.
