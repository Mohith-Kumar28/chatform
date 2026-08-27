# Billing, Plans & Entitlements — Research + Implementation Plan

> Scope: Dodo Payments subscriptions · a Youform-cloned 3-tier plan catalogue at $5 under
> their prices · RBAC (Better Auth access control) · a plan-entitlement layer enforced on
> both the API and the UI · usage metering with hard ceilings · and the conversion
> choreography that turns collected data into upgrades.
>
> Supersedes REBUILD.md §B7.4 (which correctly flagged that `enforceLimit` /
> `incrementUsage` are exported and called from nowhere).
>
> **Status: all 8 phases complete** — see the progress log in §12.

---

## 0. Decisions already taken

| Decision | Choice |
|---|---|
| Price positioning | −$5 on each monthly price; annual discount matched to a clean per-month figure (33% / 35%) |
| Free-plan AI cost | Responses stay unlimited; **AI conversations** are metered, and past the cap forms degrade to the deterministic `template` mode that already exists |
| Gate aggressiveness | Full Youform/Typeform playbook — collect freely, gate the moment of curiosity, never hide that the data exists |

---

## 1. Research

### 1.1 Youform (the model we are cloning)

Three plans. Free is deliberately extravagant — unlimited forms, unlimited responses,
unlimited questions, logic, webhooks, integrations, signatures, workspaces. Everything
that makes you *build and launch* is free. Everything that makes the collected data
*useful* costs money.

| | Free | Pro | Business |
|---|---|---|---|
| Monthly | $0 | **$29** | **$89** |
| Annual | — | **$240/yr** ($20/mo, −31%) | **$720/yr** ($60/mo, −33%) |

Free (all ✓): unlimited forms · unlimited responses · unlimited questions/form · images ·
custom colours & fonts¹ · logic builder · score & calculations · hidden fields · embed ·
Google Sheets · Slack · Zapier · email notifications · multiple endings · webhooks ·
signatures · Calendly/Cal.com/SavvyCal · workspaces & folders · non-English language ·
basic analytics · 10 MB file uploads · single user.

Gated to **Pro**: multiple-language support · custom fonts · redirect to URL · brand logo ·
customise form metadata · **remove Youform branding** · **partial submissions** · refill
link · **custom domains** · unlimited file uploads (fair use) · up to 3 team members ·
collect payments (Stripe) · Meta Pixel · Google Tag Manager · **advanced form analytics**.

Gated to **Business**: email verification (OTP) · phone verification (SMS OTP, BYO
Twilio) · activity log with CSV export · 5 seats included, +$10/mo per extra seat.

The shape of that list is the whole strategy: **the free tier is generous about input and
stingy about output.** A user builds a form for free, publishes it for free, collects a
hundred responses for free — and then discovers that the partial submissions, the drop-off
funnel, the branded URL and the removed watermark are all behind a wall, at the exact
moment they care most. The data is never taken away; it is put behind glass.

¹ "Custom colors/fonts" appears in the free column *and* "Custom fonts" appears as a Pro
gate — colours are free, the font *picker* is Pro.

### 1.2 Typeform (the same playbook, run harder)

Typeform's free tier is the opposite extreme (10 responses), so it is not our positioning
model — but three of its mechanics are worth stealing outright:

- **Base limit + hard cap.** Basic is "100 responses/mo" with a **750 max cap**; Business
  is 10,000/mo with a **50,000 cap**. Two numbers, not one: a soft monthly allowance and
  an absolute ceiling. This is exactly the structure needed to say "unlimited" honestly.
- **Graduated depth, not on/off.** Partial responses exist on every plan but at *1 save
  point* on Basic/Plus and *3* on Business. Drop-off analysis is Business-only. The gate
  is resolution, not access.
- **AI is the top-of-stack gate.** AI form creation is free everywhere; "Clarify with AI"
  and "Smart Insights" are Talent/Business+. Cheap AI is a lead magnet, expensive AI is a
  price lever.

| Plan | Monthly | Annual | Responses/mo | Hard cap | Seats |
|---|---|---|---|---|---|
| Basic | $29 | $348 | 100 | 750 | 1 |
| Plus | $59 | $708 | 1,000 | 2,500 | 3 |
| Business | $99 | $1,188 | 10,000 | 50,000 | 5 |
| Growth Flow | $266 | $3,192 | 10,000 | 50,000 | 5 |

Typeform also gates: remove branding (Plus+), custom subdomain (Plus+), custom domain
(Growth/Enterprise), brand kit & premium themes (Plus+), drop-off analysis (Business+),
reCAPTCHA (Talent+), multi-language (Talent+), follow-up emails (Growth+). Annual discount
is a flat 30% everywhere.

### 1.3 Dodo Payments — what the API actually looks like

Verified against `docs.dodopayments.com` (OpenAPI 1.113.6). The existing code in
`apps/api/src/routes/billing.ts` gets several of these wrong; see §9.

- **Base URLs.** `https://test.dodopayments.com` and `https://live.dodopayments.com`.
  Auth: `Authorization: Bearer <DODO_API_KEY>`.
- **Checkout.** `POST /checkouts` — one endpoint for one-time, subscription and mixed.
  Body: `product_cart: [{product_id, quantity}]` (required), plus `customer`,
  `billing_address`, `billing_currency`, `return_url`, `cancel_url`, `metadata`,
  `subscription_data: {trial_period_days, on_demand}`, `discount_codes[]`,
  `allowed_payment_method_types[]`, `product_collection_id`, `customization`
  (`theme`, `theme_config`, `force_language`, `show_order_details`), `feature_flags`
  (`allow_discount_code`, `allow_currency_selection`, `allow_editing_addons`, …),
  `confirm`, `short_link`. Response: `{session_id, checkout_url, client_secret?,
  payment_id?, publishable_key?}`.
- **Subscription lifecycle webhooks.** `subscription.active` (activated) ·
  `subscription.updated` (any field changed) · `subscription.renewed` (next period) ·
  `subscription.on_hold` (failed renewal) · `subscription.failed` (mandate creation
  failed) · `subscription.cancelled` / `.expired` · plus `payment.succeeded` /
  `payment.failed`. 47 event types total across payment, subscription, refund, dispute,
  license-key, payout, credit, abandoned-checkout, dunning and entitlement families.
- **Webhook envelope.** `{business_id, type, timestamp, data:{payload_type, …}}`.
- **Webhook signing — Standard Webhooks.** Headers `webhook-id`, `webhook-timestamp`,
  `webhook-signature`. The signed payload is `` `${webhook-id}.${webhook-timestamp}.${rawBody}` ``,
  HMAC-SHA256 with the endpoint secret, base64. `webhook-signature` may carry several
  space-separated `v1,<sig>` entries during secret rotation. Endpoint must answer 2xx
  within 15 s; retries are exponential over 8 attempts (immediate, 5 s, 5 min, 30 min,
  2 h, 5 h, 10 h, 10 h) — so **idempotency is mandatory**, not optional.
- **Plan changes.** `POST /subscriptions/{id}/change-plan` with `product_id`,
  `proration_billing_mode` (`prorated_immediately` | `full_immediately` |
  `difference_immediately` | `do_not_bill`), `effective_at` (`immediately` |
  `next_billing_date`), `on_payment_failure` (`prevent_change` | `apply_change`),
  `discount_codes[]`. `POST …/preview-change-plan` quotes it first;
  `POST …/cancel-change-plan` cancels a scheduled one. Upgrades →
  `prorated_immediately` + `immediately`; downgrades → `effective_at:
  next_billing_date` so the customer keeps what they paid for.
- **Customer portal.** `POST /customers/{customer_id}/customer-portal/session?return_url=…`
  → `{link}`. This is where cancellation, payment-method updates, invoices and (with a
  Product Collection configured) self-serve upgrades live. We do not rebuild any of it.
- **On-hold recovery.** `POST /subscriptions/{id}/update-payment-method`.
- **Also available, worth knowing:** Dodo's own Entitlements/feature-flag grants, Product
  Collections (upgrade/downgrade paths inside the portal), seat-based billing, usage-based
  metering with event ingestion, PPP pricing, abandoned-cart recovery and dunning. We keep
  entitlements **in our own DB** (§4) — Dodo is the source of truth for *money*, we are
  the source of truth for *access*. But Dodo's dunning and abandoned-cart recovery are
  free revenue and should simply be switched on in the dashboard.
- **Gotchas from the docs.** Currency locks after the first charge — always send
  `billing_currency` explicitly. Minimum charge $1. Indian cards need an RBI e-mandate and
  can take 48 h to settle, and mandate amounts over ₹15,000 need
  `mandate_min_amount_inr_paise` consideration. Trials authorise $0 and charge at trial
  end.

### 1.4 What the codebase already has

Good news: the schema is largely already there. `plans`, `subscriptions`, `payments`,
`dodo_customers`, `dodo_events`, `usage_counters`, `audit_logs`, `ai_generations`,
`analytics_rollup_daily`, `idempotency_keys`, `members.role`, `invitations`. Better Auth
runs with the `organization()` plugin. `lib/guards.ts` already closes tenancy properly
(`requireSession` / `requireOrg` / `requireFormAccess` / `requireApiKey`). The `ANALYTICS`
Analytics Engine binding and a `*/5 * * * *` cron both exist and are underused.

Bad news: **none of it is wired.** `plans` is never seeded, so checkout always 503s.
`enforceLimit`, `incrementUsage` and `getPlanLimits` have zero callers. `hidePoweredBy` is
honoured straight out of the form doc with no plan check, so any free user removes the
watermark today. The webhook verifier rejects every genuine Dodo delivery. Full list in §9.

Gate-able surfaces that already exist and need no new product work:

| Surface | Where |
|---|---|
| Partial / abandoned responses | `results.ts` `?status=abandoned`, `results-client.tsx` "Partial" filter |
| Funnel, per-block answer rates, distributions | `GET /api/forms/:id/analytics`, `SummaryTab` + `AnalyticsTab` |
| CSV export | `GET /api/forms/:id/submissions/export` |
| "Powered by chatform" watermark | `settings.branding.hidePoweredBy` → `chat-client.tsx:250` |
| Respondent auth (Google, phone OTP) | `settings.requireAuth`, `lib/respondent-auth.ts` |
| Brand logo, custom fonts, background image | `ThemeDoc.logoUrl` / `fontHeading` / `fontBody` |
| Redirect on completion, notification emails, auto-reply | `settings.onComplete` |
| Form metadata / OG tags / noindex | `settings.meta` |
| Duplicate prevention | `settings.duplicates` |
| Agent persona, goal, guardrails, knowledge base | `settings.agent` |
| Model override | `settings.agent.model` |
| File uploads | `routes/uploads.ts`, R2 |
| Webhooks | `routes/webhook-admin.ts` |
| Headless API | `/v1/*`, `routes/keys.ts` |
| Team seats | Better Auth `members` / `invitations` |
| Activity log | `audit_logs` table |
| AI generation | `POST /api/ai/generate-form`, `/api/ai/add-blocks` |
| AI interview turns | `do/session-do.ts` |

Not yet built, and therefore shipped as **visible-and-locked** placeholders that name the
plan (see §7 rule 4): custom domains · collect payments · Meta Pixel / GTM · refill link ·
Google Sheets / Slack integrations · AI insights on results.

---

## 2. The plan catalogue

Three plans, mirroring Youform one-for-one, each $5 under theirs, with the yearly price
set so the per-month figure stays a clean round number — which lands the annual discount
just past Youform's (33% vs their 31% on Pro, 35% vs their 33% on Business).

| | Free | **Pro** | **Business** |
|---|---|---|---|
| Monthly | $0 | **$24/mo** | **$84/mo** |
| Annual | — | **$192/yr** ($16/mo) | **$660/yr** ($55/mo) |
| vs Youform | same | $29 / $240 | $89 / $720 |
| Annual saving | — | 33% | 35% |
| Extra seats | — | — | $10/mo each above 5 |

Currency USD, Dodo handles tax as merchant of record. Adaptive currency and PPP left on.
The pricing page defaults to the **annual** toggle (shows $16/mo) — standard practice and
worth several points of ARPU.

### 2.1 Feature matrix

`✓` included · `—` locked · numbers are limits.

| Feature | Free | Pro | Business | Youform parity |
|---|---|---|---|---|
| **Build** | | | | |
| Forms | unlimited | unlimited | unlimited | ✓ |
| Questions per form | unlimited | unlimited | unlimited | ✓ |
| Conditional logic, scoring, variables | ✓ | ✓ | ✓ | ✓ |
| Hidden fields | ✓ | ✓ | ✓ | ✓ |
| Multiple endings | ✓ | ✓ | ✓ | ✓ |
| Templates | ✓ | ✓ | ✓ | ✓ |
| Workspaces / folders | 1 | 10 | 25 | ✓ |
| Embed (inline, popup, side-tab) | ✓ | ✓ | ✓ | ✓ |
| **Design** | | | | |
| Custom colours & theme | ✓ | ✓ | ✓ | ✓ |
| Background & cover images | ✓ | ✓ | ✓ | ✓ |
| Custom fonts | — | ✓ | ✓ | Pro |
| Brand logo & brand name | — | ✓ | ✓ | Pro |
| **Remove "Powered by chatform"** | — | ✓ | ✓ | Pro |
| **Collect** | | | | |
| Responses / month | unlimited* | unlimited* | unlimited* | ✓ |
| Hard ceiling / month | 5,000 | 50,000 | 50,000 | new (fair use) |
| File uploads (per file) | 5 MB | 25 MB | 100 MB | Free 10 MB total |
| File storage (total) | 10 MB | 10 GB | 50 GB | Pro "unlimited*" |
| Password protection | ✓ | ✓ | ✓ | ✓ |
| CAPTCHA (Turnstile) | ✓ | ✓ | ✓ | — |
| Duplicate prevention (IP / field) | — | ✓ | ✓ | — |
| Close rules, response caps, schedule | ✓ | ✓ | ✓ | ✓ |
| Non-English language | ✓ | ✓ | ✓ | ✓ |
| Multi-language forms | — | ✓ | ✓ | Pro |
| **Google / email verification** | — | — | ✓ | Business |
| **Phone (SMS OTP) verification** | — | — | ✓ | Business |
| One response per verified identity | — | — | ✓ | Business |
| Collect payments *(not built)* | — | ✓ | ✓ | Pro |
| **Results** | | | | |
| Completed responses | ✓ | ✓ | ✓ | ✓ |
| Chat transcripts | ✓ | ✓ | ✓ | new |
| **Partial / abandoned responses** | — | ✓ | ✓ | **Pro** |
| Basic analytics (views, starts, completions, rate) | ✓ | ✓ | ✓ | ✓ |
| **Advanced analytics** (drop-off funnel, per-block rates, duration percentiles, distributions) | — | ✓ | ✓ | **Pro** |
| Conversational analytics (drop-off by turn, clarifications/block, off-topic rate, escalations) | — | ✓ | ✓ | new |
| CSV export — completed | ✓ | ✓ | ✓ | ✓ |
| CSV export — partials & transcripts | — | ✓ | ✓ | Pro |
| AI response summaries *(not built)* | — | — | ✓ | Typeform Business |
| **Share & deliver** | | | | |
| Public link, QR, embed | ✓ | ✓ | ✓ | ✓ |
| Custom form metadata / OG tags / noindex | — | ✓ | ✓ | Pro |
| Redirect to URL on completion | — | ✓ | ✓ | Pro |
| Email notifications to owner | ✓ | ✓ | ✓ | ✓ |
| Auto-reply / follow-up email to respondent | — | ✓ | ✓ | Pro |
| Refill link *(not built)* | — | ✓ | ✓ | Pro |
| **Custom domain** *(not built)* | — | ✓ | ✓ | **Pro** |
| Meta Pixel / GTM *(not built)* | — | ✓ | ✓ | Pro |
| **Integrate** | | | | |
| Webhooks | 2 / form | 10 / form | 25 / form | ✓ |
| Webhook retries & delivery log | ✓ | ✓ | ✓ | — |
| Zapier / Sheets / Slack *(not built)* | ✓ | ✓ | ✓ | ✓ |
| Headless API (`/v1`) + API keys | — | ✓ | ✓ | new |
| API requests / month | — | 50,000 | 250,000 | new |
| **Agent (our differentiator)** | | | | |
| AI conversational interviews | ✓ | ✓ | ✓ | n/a |
| AI conversations / month | **200** | **2,000** | **10,000** | n/a |
| Past the cap | template mode | template mode | template mode | n/a |
| AI form generation / month | 10 | 200 | 1,000 | n/a |
| Tone & display name | ✓ | ✓ | ✓ | n/a |
| Custom persona, goal, success criteria | — | ✓ | ✓ | n/a |
| Knowledge base | — | 20 entries / 20k chars | 20 entries / 20k chars | n/a |
| Guardrails (forbidden topics, refusal copy) | — | ✓ | ✓ | n/a |
| Max turns per session | 30 | 60 | 200 | n/a |
| Session token budget | 6,000 | 12,000 | 30,000 | n/a |
| Model picker | — | — | ✓ | n/a |
| **Team & governance** | | | | |
| Seats | 1 | 3 | 5 (+$10/mo each) | ✓ |
| Roles | owner | owner/admin/editor/viewer | owner/admin/editor/viewer | — |
| **Activity log** | — | — | ✓ + CSV export | Business |

\* "Unlimited" means no per-plan quota, subject to the hard monthly ceiling in the row
below it. That footnote goes on the pricing page verbatim — Youform's own "*subject to
fair usage policy". We say the number.

### 2.2 Why the AI columns exist

Youform can promise unlimited free responses because a response costs them a database row.
Here every response is an LLM conversation with real marginal cost, so an uncapped free
plan is an uncapped bill.

The resolution keeps the Youform promise intact. **Responses stay unlimited on every
plan.** What is metered is the *AI conversation* — and the codebase already has the
graceful failure mode: `settings.agent.mode` supports `"template"`, and `session-do.ts`
already implements a reliability floor that permanently drops a session to deterministic
`phrasing.ts`-driven template mode after three tool errors. We reuse that path.

Past the AI cap:

- The form **keeps working**. Respondents see scripted questions instead of a conversation.
  Nobody's data collection breaks, no respondent sees an error, our reputation with the
  people filling in forms is untouched.
- The owner gets a dashboard banner: *"Your forms are asking questions in basic mode —
  200/200 AI conversations used this month."*
- Cost is bounded, the upsell is honest, and the thing being sold is the thing the user
  can feel the absence of.

Two ceilings back it up: `ai_tokens_per_month` (a token-level circuit breaker independent
of conversation count, so one pathological form cannot burn the budget) and
`responses_hard_ceiling_per_month` (5,000 free / 50,000 paid — Typeform's cap structure).

### 2.3 Limits, as data

The single source of truth, shipped as `packages/entitlements`:

| Limit key | Free | Pro | Business | Enforcement |
|---|---|---|---|---|
| `responses_per_month` | `null` (unlimited) | `null` | `null` | soft — meter only |
| `responses_ceiling_per_month` | 5,000 | 50,000 | 50,000 | **hard** — form closes, respondent sees the form's closed message |
| `ai_conversations_per_month` | 200 | 2,000 | 10,000 | **degrade** → template mode |
| `ai_tokens_per_month` | 500,000 | 6,000,000 | 30,000,000 | **degrade** → template mode |
| `ai_generations_per_month` | 10 | 200 | 1,000 | **hard** — 402 |
| `forms_count` | 100 | 1,000 | 1,000 | **hard** — 402 |
| `blocks_per_form` | 100 | 300 | 300 | **hard** — publish rejected |
| `workspaces_count` | 1 | 10 | 25 | **hard** |
| `seats` | 1 | 3 | 5 | **hard** — invite rejected |
| `file_storage_mb` | 10 | 10,240 | 51,200 | **hard** — upload intent rejected |
| `max_upload_mb_per_file` | 5 | 25 | 100 | **hard** |
| `webhooks_per_form` | 2 | 10 | 25 | **hard** |
| `api_requests_per_month` | 0 | 50,000 | 250,000 | **hard** — 402 on `/v1` |
| `knowledge_entries` | 0 | 20 | 20 | **hard** — publish rejected |
| `knowledge_chars` | 0 | 20,000 | 20,000 | **hard** |
| `agent_max_turns` | 30 | 60 | 200 | **clamp** at read time |
| `agent_token_budget` | 6,000 | 12,000 | 30,000 | **clamp** at read time |
| `submission_retention_days` | `null` | `null` | `null` | never enforced — see below |

**Data is never deleted.** No retention limit on any plan, deliberately. The entire
conversion mechanism depends on the free user knowing their partial responses exist and
are intact; deleting them would destroy the leverage *and* be the kind of thing that gets
a form product talked about badly. We gate visibility, never existence.

Three enforcement modes, and the distinction matters:

- **hard** — 402 with a machine-readable envelope; the action does not happen.
- **degrade** — the action happens at reduced quality; nothing fails.
- **clamp** — a plan-capped value silently replaces a larger requested one at read time,
  so a form authored on Pro and downgraded to Free still runs, just shorter.

---

## 3. RBAC — roles and permissions

Better Auth's `organization()` plugin already ships the right primitive
(`createAccessControl` from `better-auth/plugins/access`), so we do not hand-roll roles.

`apps/api/src/lib/permissions.ts` — shared with the web client so `checkRolePermission`
works synchronously in the UI:

```ts
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc, ownerAc, memberAc } from "better-auth/plugins/organization/access";

export const statement = {
  ...defaultStatements,                                   // organization, member, invitation
  billing:    ["read", "manage"],
  form:       ["create", "read", "update", "delete", "publish"],
  submission: ["read", "read_partial", "export", "delete"],
  analytics:  ["read", "read_advanced"],
  webhook:    ["create", "read", "update", "delete"],
  apikey:     ["create", "read", "revoke"],
  workspace:  ["create", "update", "delete"],
  branding:   ["manage"],
  domain:     ["manage"],
  audit:      ["read"],
  ai:         ["generate"],
} as const;

export const ac = createAccessControl(statement);
```

| Role | Grants |
|---|---|
| `owner` | everything, including `organization:delete` and `billing:manage` |
| `admin` | everything except `organization:delete`; `billing:read` only |
| `editor` | full form lifecycle, all submission reads + export, analytics, webhooks, AI generate. No team, billing, API keys, domain or audit. |
| `viewer` | `form:read`, `submission:read`, `analytics:read`. No export, no edit, no partials. |

Registered on both sides: `organization({ ac, roles: { owner, admin, editor, viewer } })`
in `lib/auth.ts`, and the identical `ac`/`roles` in `organizationClient()` in
`apps/web/src/lib/auth/auth-client.ts`.

`editor` and `viewer` are new roles; existing rows are `owner` / `member`, so the
migration maps `member` → `editor` (the least surprising reading of the existing invite
flow, which hardcodes `role: "member"`).

### 3.1 RBAC and entitlements are orthogonal — and both must pass

This is the design's load-bearing idea, so it is worth stating flatly:

- **RBAC answers "is this person allowed to do this in this organisation?"** — a viewer
  cannot export, regardless of plan.
- **Entitlements answer "did this organisation buy this?"** — nobody on Free sees partial
  responses, not even the owner.

Every gated route ANDs them, and the two failures are distinguishable by the caller: RBAC
denial is **403 `forbidden`** (no upsell — upgrading changes nothing), entitlement denial
is **402 `feature_locked`** or **402 `limit_reached`** (upsell). Conflating them produces
the worst possible UX: showing an owner an upgrade button for something a role change
would fix, or showing a viewer a pricing page for something only their admin can grant.

Together they are ABAC in the useful sense: the decision is a function of
`(role, plan, feature, usage, resource ownership)` — but built out of Better Auth's role
statements plus a plan lookup rather than a policy engine, because a policy engine is not
warranted here.

---

## 4. The entitlement layer

### 4.1 `packages/entitlements` — one source of truth

A new dependency-free workspace package imported by `apps/api`, `apps/web`, and the seed
script, so the pricing page, the API gate and the seeded `plans` rows can never disagree.

```
packages/entitlements/src/
  features.ts   FEATURES — the union of feature keys + human labels + which plan unlocks each
  limits.ts     LIMITS — limit keys, enforcement mode, unit
  plans.ts      PLANS — the catalogue: id, name, prices, features Set, limits Record, sortOrder
  index.ts      can(plan, feature) · limitOf(plan, key) · minPlanFor(feature) · resolve(plan, overrides)
```

Feature keys are a closed union — adding a gate means adding a key here, which means the
pricing page, the marketing table, the API middleware and the UI `<Gate>` all learn about
it at once and TypeScript enforces exhaustiveness.

`plans` rows in D1 hold `features_json` and `limits_json` **copied from this package at
seed time**, plus the Dodo product ids. The DB is the runtime read path (one indexed
query, cacheable); the package is the authoring path. A `plans:verify` check in CI asserts
they match.

### 4.2 Resolution and caching

```ts
// apps/api/src/lib/entitlements.ts
export interface Entitlements {
  planId: "free" | "pro" | "business";
  planName: string;
  status: "active" | "trialing" | "past_due" | "on_hold" | "canceled";
  cycle: "monthly" | "yearly" | null;
  periodStart: number | null;
  periodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  seats: number;
  features: Record<FeatureKey, boolean>;
  limits: Record<LimitKey, number | null>;
  source: "subscription" | "free" | "override";
}

export async function getEntitlements(env, orgId): Promise<Entitlements>
```

Resolution order: active/trialing subscription → its plan row → merge
`entitlement_overrides` for that org (comps, enterprise deals, support grants) → fall back
to the `free` plan row. `past_due` and `on_hold` keep paid entitlements for a **7-day
grace window** (dunning is running; Dodo retries for days, and revoking a paying
customer's analytics over a temporarily declined card is how you create a churned
customer). After grace, drop to free entitlements — but never delete data.

Cached in `KV_CONFIG` under `ent:<orgId>` with a 300 s TTL, invalidated explicitly by the
webhook handler on every subscription event. Usage counters are **not** cached — they are
read fresh from D1 on every metered call.

### 4.3 Middleware

```ts
// apps/api/src/lib/authorize.ts
requirePermission(resource, action)   // RBAC  → 403 forbidden
requireFeature(feature)               // plan  → 402 feature_locked
requireQuota(metric, n?)              // usage → 402 limit_reached  (reserve, then commit)
requireSeat()                         // seats → 402 seat_limit
```

They compose with the existing guards and read `orgId` from the context that `requireOrg`
already sets, so wiring a route is one line:

```ts
resultsRouter.get("/forms/:id/submissions",
  requirePermission("submission", "read"),
  ...);

resultsRouter.get("/forms/:id/submissions/export",
  requirePermission("submission", "export"),
  requireFeature("export_partials"),   // only when ?status includes partials
  ...);
```

### 4.4 The 402 envelope

Every entitlement denial returns the same machine-readable body. This is what makes one
global UI interceptor able to render every paywall correctly, and it is why the envelope is
specified before any handler is written.

```json
{
  "error": {
    "code": "feature_locked",
    "message": "Partial responses are a Pro feature.",
    "feature": "partial_responses",
    "metric": null,
    "used": null,
    "limit": null,
    "plan": "free",
    "requiredPlan": "pro",
    "context": { "count": 14, "noun": "partial responses" },
    "upgradeUrl": "/billing?plan=pro&from=partial_responses"
  }
}
```

`context` is the conversion payload — the real number of rows sitting behind the gate. The
gate is far more persuasive saying *"14 people started and didn't finish"* than *"upgrade
for partial responses"*, and computing it server-side is both cheap and the only place the
number is knowable.

Codes: `feature_locked` · `limit_reached` · `seat_limit` · `ceiling_reached` (402) ·
`forbidden` (403). `Retry-After` accompanies `limit_reached` when the reset is a known
period boundary.

### 4.5 Metering

`usage_counters` is already keyed `(organization_id, period, metric)` with a unique index.

- `period` = `YYYY-MM` in **UTC calendar months** for every plan. Anchoring to the
  subscription's `current_period_start` is more "correct" and materially harder to get
  right (mid-cycle upgrades, 31st-of-month anchors, proration); calendar months are what
  the usage page shows and what users expect. Documented, not accidental.
- **Atomic reserve.** One statement, no read-then-write race:
  ```sql
  INSERT INTO usage_counters (id, organization_id, period, metric, used, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT (organization_id, period, metric)
    DO UPDATE SET used = used + excluded.used, updated_at = excluded.updated_at
  RETURNING used;
  ```
  Compare the returned value against the limit. Over a **hard** limit → 402 and leave the
  counter (it is genuinely over). Over a **degrade** limit → proceed in template mode.
  This replaces the current check-then-increment shape, which double-counts under
  concurrency — a real risk here, where a single form can have many simultaneous sessions.
- `limit_override` on the row stays supported for per-org one-off grants ("we bumped you
  to 500 this month while you evaluate").
- **Every** metered write goes through `meter()`. The direct upsert at
  `session-do.ts:1248` is deleted and replaced with a call, or it will drift.

Metrics: `responses` · `ai_conversations` · `ai_tokens` · `ai_generations` ·
`api_requests` · `storage_bytes` (a gauge, recomputed from R2/`files`, not incremented) ·
`emails_sent`.

### 4.6 Feature access logging

The user's "log the features" requirement, and independently the only way to know which
gate actually sells:

- **High volume → Analytics Engine** (`ANALYTICS` binding, already configured, unused).
  Every gate *evaluation* — allow and deny — as one data point: `blobs: [orgId, planId,
  feature, decision, surface]`, `doubles: [used, limit]`. Free, sampled, queryable, and it
  answers "which gate precedes an upgrade" directly.
- **Meaningful events → `audit_logs`** (table exists): subscription changes, plan changes,
  entitlement overrides granted, seat changes, every gate denial that a *human* saw, and
  every export. This is also exactly what the Business-tier "Activity log with CSV export"
  feature reads from, so building it serves two purposes.
- **`feature_access_log`** — a new small table, 90-day rolling, recording first-touch of
  each locked feature per org (`org_id, feature, first_denied_at, denial_count,
  converted_at`). This is the conversion funnel: which lock did they hit, how many times,
  did they buy. Pruned by the existing cron.

---

## 5. Dodo integration

### 5.1 Product setup (manual, once, per environment)

Six subscription products in the Dodo dashboard — Pro Monthly $24, Pro Yearly $192,
Business Monthly $84, Business Yearly $660, plus a $10/mo **seat add-on** attached to
Business — in both test and live mode. One **Product Collection** grouping all four plan
products, which is what enables self-serve upgrade/downgrade inside the customer portal.

Ids land in `plans` via the seed (`packages/db` migration + `tooling/seed-plans.sql`),
read from env so test and live differ: `DODO_PRODUCT_PRO_MONTHLY`, etc. A
`GET /api/billing/config-check` (owner-only) reports which ids are missing, so a
misconfigured environment says so instead of 503-ing at checkout.

### 5.2 Endpoints

| Route | Purpose |
|---|---|
| `GET /api/billing/entitlements` | plan + features + limits + usage + role + permissions — the one call the whole UI reads |
| `GET /api/billing/plans` | public plan catalogue for the pricing page |
| `POST /api/billing/checkout` | `{planId, cycle}` → `{url}` via `POST /checkouts` |
| `POST /api/billing/portal` | → Dodo customer-portal `{link}` |
| `POST /api/billing/change-plan` | upgrade/downgrade an existing subscription |
| `POST /api/billing/preview-change` | quote a plan change before committing |
| `POST /api/billing/webhook` | Standard Webhooks receiver, idempotent |
| `GET /api/billing/invoices` | from `payments` |

Checkout call, corrected against the OpenAPI spec:

```ts
await fetch(`${dodoBase(env)}/checkouts`, {
  method: "POST",
  headers: { authorization: `Bearer ${env.DODO_API_KEY}`, "content-type": "application/json" },
  body: JSON.stringify({
    product_cart: [{ product_id: productId, quantity: 1 }],
    customer: { email: billingEmail, name: orgName },
    billing_currency: "USD",
    return_url: `${env.APP_ORIGIN}/billing?checkout=success`,
    cancel_url: `${env.APP_ORIGIN}/billing?checkout=cancelled`,
    metadata: { organizationId: orgId, planId, cycle, userId },
    feature_flags: { allow_discount_code: true },
    customization: { show_order_details: true },
  }),
  signal: AbortSignal.timeout(15_000),
});
// → { session_id, checkout_url }
```

`dodoBase(env)` returns test or live from `DODO_ENVIRONMENT`. Metadata carries
`organizationId` — it is how the webhook attributes the subscription, so it is required,
and the webhook must **reject** an event without it rather than guessing.

Upgrade path for an org that already has a subscription: `change-plan` with
`proration_billing_mode: "prorated_immediately"`, `effective_at: "immediately"`.
Downgrade: `effective_at: "next_billing_date"`, so they keep what they paid for and
entitlements drop at the period boundary, not at the click. Cancellation and payment-method
updates are the customer portal's job — we link, we do not rebuild.

### 5.3 Webhook handling, done correctly

Rewritten against Standard Webhooks:

1. Read the raw body **once**, as text, before anything else.
2. Require `webhook-id`, `webhook-timestamp`, `webhook-signature`.
3. Reject a timestamp more than **5 minutes** from now (replay window).
4. Compute `HMAC-SHA256(secret, \`${id}.${timestamp}.${rawBody}\`)`, base64.
5. Compare against **every** space-separated `v1,<sig>` entry using the existing
   `timingSafeEqual` from `lib/crypto.ts` — not `===`, and not a comma-split.
6. Idempotency: insert into `dodo_events` keyed on `webhook-id`; a duplicate returns 200
   immediately. Dodo retries 8 times over ~28 hours, so this is what stands between us and
   eight subscriptions from one payment.
7. Dispatch, then set `processed_at`. A handler throw records `status='failed'` + `error`
   and returns **5xx** so Dodo retries; a *validation* failure returns 4xx so it does not.
8. Answer within 15 s. Anything slow goes to a queue.

Events handled: `subscription.active` → upsert subscription, set plan, invalidate KV ·
`subscription.renewed` → roll `current_period_*` · `subscription.updated` → reconcile
plan/seats/`cancel_at_period_end` from the payload rather than from our own assumptions ·
`subscription.on_hold` / `payment.failed` → `past_due`, start the 7-day grace, notify the
owner · `subscription.cancelled` / `.expired` → `canceled` **scoped to that
`dodo_subscription_id`**, not to every subscription the org has · `payment.succeeded` →
`payments` row + invoice URL · `refund.succeeded` → record, and re-evaluate entitlements.

Every handler invalidates `ent:<orgId>` in KV and writes an `audit_logs` row.

### 5.4 Test plan

Dodo test mode + the dashboard's event replay covers the happy paths. For the rest,
`apps/api/tests/billing.test.ts` posts synthetic Standard-Webhooks-signed bodies at
`/api/billing/webhook` using the existing `applySchema`/`seedTenant` harness: valid
signature, tampered body, wrong secret, stale timestamp, rotated-secret second signature,
duplicate `webhook-id`, missing metadata, cancel-scoping, and the full
active → renewed → on_hold → grace → expiry → free-entitlements sequence.

---

## 6. Wiring the gates

### 6.1 API

| Route | Gate |
|---|---|
| `POST /p/forms/:slug/sessions` | `requireQuota("responses")`; over `responses_ceiling_per_month` → form reads as closed, respondent sees the form's own closed message (never a billing error) |
| `SessionDO` agent turn | `meter("ai_conversations")` once per session, `meter("ai_tokens")` per turn; over → set `degraded=true`, `mode="template"`, persist, emit `rate_limited` SSE |
| `POST /api/ai/generate-form`, `/ai/add-blocks` | `requirePermission("ai","generate")` + `requireQuota("ai_generations")` |
| `POST /api/forms` | `requireQuota("forms_count")` |
| `POST /api/forms/:id/publish` | validate the doc against entitlements — see §6.2 |
| `PUT /api/forms/:id/doc` | never gated. Authoring is always free; publishing is where plans bite. |
| `GET /api/forms/:id/submissions` | `requirePermission("submission","read")`; `status` in `abandoned`/`in_progress`/`all` needs `requireFeature("partial_responses")`, and the 402 carries the real partial count in `context` |
| `GET …/submissions/export` | `requirePermission("submission","export")`; partials/transcripts need `requireFeature("export_partials")` |
| `GET /api/forms/:id/analytics` | basic block always returned; `perBlock`, `distributions`, duration percentiles and conversational metrics need `advanced_analytics`. Response carries `{locked:["perBlock","distributions"], context:{…}}` — headline numbers real, detail withheld. |
| `GET /p/forms/:slug/config` | **`brandingHidden` forced to `false` unless `can(plan,"remove_branding")`.** Also strips `theme.logoUrl`, custom fonts, and `settings.meta` overrides when unentitled. This is the enforcement point that matters — the client must not be trusted with it. |
| `POST /p/sessions/:id/uploads/intent` | `max_upload_mb_per_file` + `file_storage_mb` gauge |
| `POST /api/webhooks` | `requirePermission("webhook","create")` + `requireQuota("webhooks_per_form")` |
| `POST /api/keys` | `requirePermission("apikey","create")` + `requireFeature("api_access")` |
| `/v1/*` | `requireFeature("api_access")` + `requireQuota("api_requests")` |
| Better Auth `invite-member` | `requireSeat()` — hook the organization plugin's `before` |
| `POST /api/workspaces` | `requireQuota("workspaces_count")` |
| `GET /api/audit-logs` | `requirePermission("audit","read")` + `requireFeature("activity_log")` |
| Respondent auth start | `requireFeature("respondent_auth_google" / "…_phone")` — and the session gate must refuse to *ask* for auth the plan does not include, rather than asking and then failing |

### 6.2 Publish-time validation, not save-time

Authoring is never blocked — a free user can turn on every switch in the builder and see
their form with their logo and their custom font. `POST /publish` runs
`validateAgainstEntitlements(doc, ent)` and returns `{ published: true, stripped: [
{path, feature, requiredPlan} ] }`. The builder then shows exactly what was dropped and
what it costs.

This is deliberate on both counts. It is honest — nothing silently disappears — and it is
the single highest-intent upsell moment in the product: they have just built the thing,
they can see it, and the only thing between them and shipping it is $24.

`clamp`-mode limits (`agent_max_turns`, `agent_token_budget`) are applied at read time
instead, so a form authored on Pro keeps working after a downgrade.

### 6.3 Web

- `useEntitlements()` — one TanStack Query hook over `/api/billing/entitlements`,
  `staleTime: 60s`. Returns `{ plan, can(feature), limit(key), usage(metric), pct(metric),
  role, allows(resource, action) }`.
- `<Gate feature="partial_responses">` — renders children, or the locked variant.
- `<LockedOverlay>` — the workhorse: blurs its children (`filter: blur(6px)` +
  `pointer-events: none` + `aria-hidden`), overlays a lock badge, a real count, one line of
  copy and one CTA. Real content stays in the DOM behind it only where the content is
  already public to that user; anywhere the *data* is gated the server withholds it and the
  overlay blurs a **synthetic skeleton** — blurred CSS is not a security boundary and must
  never be the only thing between a free user and Pro data.
- `<UpgradeDialog>` — one global dialog, driven by a small Zustand store, that takes a 402
  envelope and renders feature name, required plan, price, the `context` count, and a
  checkout button. Deep-linkable as `/billing?plan=pro&from=<feature>`.
- **Global 402 interception in `mutator.ts`.** `ApiError` already carries `status`; extend
  it to carry the parsed envelope and have `customFetch` push `feature_locked` /
  `limit_reached` into the store. Every existing and future call site then gets the correct
  paywall for free, with no per-call-site work.
- `/pricing` — public, three cards, annual default, the full comparison table from §2.1,
  the fair-use footnote.
- `/billing` — current plan, cycle, renewal date, usage meters, upgrade/downgrade, invoice
  list, portal link. Replaces and absorbs today's `/usage` page.

---

## 7. The conversion choreography

The tactic being copied is not "have a paywall". It is *where* the paywall stands. Youform
and Typeform both let you invest — build the form, publish it, share it, collect real
answers from real people — and place every gate downstream of that investment, at the
moment curiosity peaks. A gate before the data is a bounce. The same gate after the data is
a purchase.

Five rules, then the placements.

1. **Never gate before there is data.** No upsell on an empty dashboard, an empty results
   page, or during onboarding. The first gate a user meets should be one they walked into
   on their own.
2. **Always name the number.** "14 people started and didn't finish" converts; "Upgrade for
   partial responses" does not. The count comes from the server, in `context`.
3. **Show, don't hide.** Every locked control is visible, in place, switched off, with a
   lock chip naming the plan. A hidden feature is a feature they will never want.
4. **Never break the respondent's experience.** Every gate is owner-facing. Respondents
   never see a billing error, a watermark change mid-session, or a broken form. The AI cap
   degrades quality; it does not fail.
5. **Never imply the data is gone.** "Behind glass", never "lost". Locked, never deleted.

### The placements

| # | Surface | Free experience | Copy |
|---|---|---|---|
| 1 | **Results → Partial tab** ★ | Tab visible with a real badge count. Opens to blurred rows with real timestamps; the newest row's first answer is shown in full as a teaser. | *"14 people started and didn't finish. See what they told you before they left."* |
| 2 | **Results → Analytics** | Views, Starts, Completed and Completion % are real and unblurred. Drop-off funnel, per-block answer rates and duration percentiles are blurred. The overlay names the worst block without its number. | *"Most people drop off at question 4. Unlock to see why."* |
| 3 | **Results → Summary** | Chart shells blurred, real N above them. | *"47 responses, charted."* |
| 4 | **Export CSV** | Button reads "Export 47 responses" and works. A second, locked row: "Include 14 partial responses and chat transcripts". | *"Partial responses and transcripts export on Pro."* |
| 5 | **Watermark toggle** | Visible in Design, off, lock chip. Toggling opens the upgrade dialog with a live preview of the footer gone. | *"Remove 'Powered by chatform' — Pro."* |
| 6 | **Brand logo & custom fonts** | Fully usable **in the builder preview** — they upload their logo and see their form wearing it. Publish strips it with a named notice (§6.2). | *"Your logo is ready. Publishing it is Pro."* |
| 7 | **Custom domain** | Share tab shows the field with their org slug pre-filled — `forms.acme.com/feedback` — locked. | *"Your form, on your domain."* |
| 8 | **Redirect on completion** | Field accepts the URL, locked at publish. | *"Send respondents where you want them next — Pro."* |
| 9 | **Respondent verification** | Google / phone toggles visible in Access, locked at Business. | *"Verify who's answering — Business."* |
| 10 | **AI cap reached** | Dashboard banner + a chip in the builder's AI bar. Forms keep running in basic mode. | *"200/200 AI conversations used. Your forms are asking questions in basic mode."* |
| 11 | **First-response moment** | One-time toast when a form's first response lands — fired **only if a partial already exists**. | *"Your first response is in. 1 more person started and didn't finish."* |
| 12 | **Seat invite** | Invite form accepts the address, then explains. | *"Pro includes 3 teammates."* |
| 13 | **Usage pill** | Amber at 80%, red at 100%, links to `/billing`. Already built; wire it to the real numbers and fix its types. | — |
| 14 | **Approaching the ceiling** | Email + banner at 80% of `responses_ceiling_per_month`. | *"4,000 of 5,000 responses this month."* |
| 15 | **Annual default** | Pricing page opens on annual. | *"$16/mo billed yearly — save 33%."* |
| 16 | **Downgrade & lapse** | Gated settings revert with a named list; data stays whole and visible under free rules. | *"Your responses are all here. Partial responses are hidden until you resubscribe."* |

Placement 1 is the single most important one in this document. It is the exact mechanism
the user described, it is the mechanism Youform monetises with, and it is already 90% built
in `results-client.tsx` — the Partial filter, the badge and the status query all exist.

### Where we deliberately stop

Dark patterns that would work and that we are not doing, because they cost more in trust
than they return: no fake counts, no countdown timers, no gate that pretends data was
deleted, no confirm-shaming on cancel (the Dodo portal handles cancellation and we do not
interfere), no cancellation friction, and no gate that a respondent can see. If any gate
here would embarrass us in a screenshot on social media, it does not ship.

---

## 8. Schema changes

`packages/db/drizzle/0003_billing_entitlements.sql` (+ schema.ts + snapshot):

```sql
ALTER TABLE plans ADD COLUMN slug TEXT;                        -- 'free' | 'pro' | 'business'
ALTER TABLE plans ADD COLUMN price_yearly_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN features_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE plans ADD COLUMN dodo_product_monthly_id TEXT;     -- supersedes dodo_price_monthly_id
ALTER TABLE plans ADD COLUMN dodo_product_yearly_id TEXT;      -- supersedes dodo_price_yearly_id
ALTER TABLE plans ADD COLUMN seat_addon_product_id TEXT;
ALTER TABLE plans ADD COLUMN seat_price_cents INTEGER NOT NULL DEFAULT 0;

ALTER TABLE subscriptions ADD COLUMN cycle TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE subscriptions ADD COLUMN dodo_customer_id TEXT;
ALTER TABLE subscriptions ADD COLUMN trial_ends_at INTEGER;
ALTER TABLE subscriptions ADD COLUMN grace_until INTEGER;
ALTER TABLE subscriptions ADD COLUMN scheduled_plan_id TEXT;   -- pending downgrade
ALTER TABLE subscriptions ADD COLUMN scheduled_at INTEGER;

CREATE TABLE entitlement_overrides (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,              -- 'feature' | 'limit'
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  reason TEXT,
  expires_at INTEGER,
  created_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX uq_override_org_key ON entitlement_overrides(organization_id, kind, key);

CREATE TABLE feature_access_log (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  feature TEXT NOT NULL,
  surface TEXT,
  first_denied_at INTEGER NOT NULL,
  last_denied_at INTEGER NOT NULL,
  denial_count INTEGER NOT NULL DEFAULT 1,
  converted_at INTEGER
);
CREATE UNIQUE INDEX uq_fal_org_feature ON feature_access_log(organization_id, feature);

-- existing 'member' rows become 'editor' under the new role set
UPDATE members SET role = 'editor' WHERE role = 'member';
```

The `dodo_price_*_id` columns stay for now (SQLite drops are awkward and D1 migrations are
forward-only) but are unused; a later migration removes them. Naming them *product* ids
matters because Dodo subscription products carry their own billing frequency — there is no
separate price object, so a monthly and a yearly plan are two products.

`tooling/seed-plans.sql`, generated from `packages/entitlements`, inserts the three plan
rows. `pnpm setup` runs it, so a fresh clone has a working catalogue — today it does not,
which is why checkout 503s.

---

## 9. Bugs found in the existing billing code

Every one of these is in `apps/api/src/routes/billing.ts` unless noted, and every one is
fixed by this plan. Listed separately because several are live security or correctness
problems rather than missing features.

1. **The webhook verifier rejects every genuine Dodo delivery.** It signs `` `${ts}.${raw}` ``;
   Standard Webhooks signs `` `${id}.${ts}.${raw}` ``. It also splits the signature header on
   commas and looks for entries starting `v1,` — but multiple signatures are *space*-separated,
   so a comma split can never produce a `v1,`-prefixed entry. Billing cannot work today.
2. **No replay protection.** `webhook-timestamp` is read but never bounded, so a captured
   valid delivery replays forever.
3. **Signature comparison uses `===`.** `lib/crypto.ts` already exports `timingSafeEqual`.
4. **The checkout body is wrong for `/checkouts`.** It sends `payment_link: true` and
   `customisation.redirect_url`; the endpoint takes `return_url` at the top level and spells
   the object `customization`. `payment_link` is not a field on this endpoint.
5. **Live URL hardcoded.** `https://live.dodopayments.com` with no test-mode switch — you
   cannot exercise checkout without moving real money.
6. **`plans` is never seeded.** `/api/billing/checkout` 503s unconditionally on a fresh DB.
7. **`enforceLimit` / `incrementUsage` / `getPlanLimits` have no callers anywhere.** Already
   flagged as REBUILD.md B7.4. The only real metering is the inline upsert at
   `do/session-do.ts:1248`.
8. **Feature flags and counters share one namespace.** `FREE_LIMITS` holds
   `advanced_analytics: 0` and `remove_branding: 0` alongside `responses_per_month: 100`, so
   `enforceLimit("remove_branding")` would answer *"Monthly remove branding limit reached
   (0). Upgrade to continue."* Fixed by the features/limits split in §4.1.
9. **`hidePoweredBy` is honoured with no plan check** (`routes/public.ts:99` and `:242`).
   Any free user removes the watermark today, which is Youform's single most-purchased Pro
   feature.
10. **`resolveOrgId` ignores the active organisation** (`lib/guards.ts`). Its comment says
    "Prefers the session's active org"; the SQL takes the oldest membership by
    `created_at`. A user in two orgs meters and bills against the wrong one.
11. **`subscription.cancelled` cancels the wrong rows** — `UPDATE subscriptions SET status =
    'canceled' WHERE organization_id = ?` hits every subscription the org has, not the one
    the event is about.
12. **A missing `planId` in webhook metadata defaults to `"pro"`** — a Business payment can
    silently provision Pro.
13. **Check-then-increment metering double-counts** under the concurrency a single popular
    form produces. Fixed by the atomic `RETURNING used` reserve in §4.5.
14. **`usage-pill.tsx` mistypes the payload** (`plan?: {id, name}`; the API returns
    `plan: string`) and uses query key `["billing","usage"]` while `usage/page.tsx` uses
    `["usage"]`, so the same data is fetched twice and cached twice.
15. **`billingRouter` rolls its own session middleware** instead of using
    `requireSession` / `requireOrg`, and `listOrgsFor` is a shim around `resolveOrgId`
    returning a one-element array. Both should go.

---

## 10. Delivery phases

Each phase ends green on `pnpm check` (typecheck + lint + test) and is independently
shippable.

**Phase 1 — Foundations.** `packages/entitlements` · migration `0003` · `seed-plans.sql`
· `lib/permissions.ts` with the Better Auth access-control statements · `lib/entitlements.ts`
(resolution + KV cache) · `lib/authorize.ts` (the four middlewares) · the 402 envelope ·
`meter()` with the atomic reserve · unit tests for `can`/`limitOf`/resolution/grace.
*Nothing user-visible; everything downstream depends on it.*

**Phase 2 — Dodo, correctly.** Rewrite `routes/billing.ts`: Standard Webhooks verification
with replay bound and timing-safe compare · idempotency · test/live switch · corrected
`/checkouts` body · portal · change-plan + preview · invoices · `GET /entitlements` ·
`GET /plans` · `config-check`. Fixes §9 items 1–6, 11, 12, 15. Full webhook test suite.

**Phase 3 — API enforcement.** Wire every gate in §6.1. Publish-time
`validateAgainstEntitlements`. Force `brandingHidden` server-side (§9.9). Fix
`resolveOrgId` (§9.10). Replace the inline DO upsert with `meter()`. AI degrade path into
the existing `template` mode. Seat check on invite. Tests: one per gate, free vs Pro vs
Business, plus role matrix tests extending `tenancy.test.ts`.

**Phase 4 — Feature logging.** Analytics Engine gate events · `audit_logs` writes ·
`feature_access_log` with cron pruning · `GET /api/audit-logs` behind `activity_log` ·
Business-tier CSV export of it.

**Phase 5 — UI primitives.** `useEntitlements` · `<Gate>` · `<LockedOverlay>` ·
`<UpgradeDialog>` · the Zustand store · global 402 interception in `mutator.ts` ·
`checkRolePermission` wired into `auth-client.ts`. Regenerate orval hooks
(`pnpm gen:api`) — no hand-written frontend API code, per REBUILD.md constraint 2.

**Phase 6 — The choreography.** All 16 placements from §7, in that priority order.
Placements 1, 2, 5 and 6 are the revenue; the rest is polish.

**Phase 7 — Pricing & billing pages.** `/pricing` (public, annual-default) · `/billing`
(absorbing `/usage`) · landing-page pricing section (REBUILD.md F-series already asks for
this).

**Phase 8 — Hardening.** Downgrade/lapse behaviour · grace-window emails · 80%-of-ceiling
warnings · `plans:verify` in CI · a `docs/BILLING-RUNBOOK.md` covering product setup,
comping an org via `entitlement_overrides`, and replaying a failed webhook.

Phases 1–3 are the load-bearing work; a correct backend with no UI is a working product
with an ugly paywall, while the reverse is a paywall a `curl` walks through.

---

## 11. Open items and risks

- **Not-yet-built Pro features.** Custom domains, payment collection, Meta Pixel/GTM,
  refill link, Sheets/Slack and AI insights are on the matrix as locked placeholders. That
  is defensible on the *pricing page* only if the page marks them "coming soon" rather than
  implying they ship today. Flagging explicitly: **listing an unbuilt feature as included
  in a plan someone pays for is a misrepresentation, and the pricing page must label them.**
- **The 5,000 free ceiling is a guess.** It should be re-derived from real AI cost per
  conversation once there is traffic. The number lives in one place, so changing it is a
  one-line edit plus a re-seed.
- **Seat add-on billing** ($10/mo above 5 on Business) needs Dodo add-ons or a quantity-based
  subscription. Phase 1 ships the *limit*; the metered add-on can follow.
- **Calendar-month periods** will look off by a few days to a customer who subscribed
  mid-month. Accepted, documented, revisit if it generates support load.
- **Blur is not security.** Stated in §6.3 and worth repeating: anywhere the data itself is
  gated, the server withholds it and the client blurs a skeleton.
- **`resolveOrgId`'s multi-org bug** is a correctness problem beyond billing. It is in
  Phase 3, but it arguably deserves to jump the queue.


---

## 12. Progress log

One entry per completed phase. §10 is the plan; this is what has actually shipped.

### Phase 1 — Foundations ✅

**`packages/entitlements`** — new dependency-free workspace package, the single source of
truth, imported by the API, the web app and the plan-seed generator.

| File | Contents |
|---|---|
| `features.ts` | 28 feature keys as a closed union, each with its minimum plan, a user-facing label and a `soon` flag for the six that are priced but not built |
| `limits.ts` | 19 limit keys with an enforcement mode (`hard` / `degrade` / `clamp` / `meter`) and a kind (`monthly` / `gauge` / `document`); the six `usage_counters` metrics |
| `plans.ts` | the catalogue — Free / Pro $24·$192 / Business $84·$660, with `orphanedFeatures()` so a key nothing grants cannot ship |
| `resolve.ts` | plan + status + overrides → flat entitlements, including the 7-day grace window and `clampToLimit` |
| `envelope.ts` | the 402/403 gate-denial body, shared with the web interceptor |
| `period.ts` | UTC calendar-month period keys and reset instants |

**Migration `0003_watery_vanisher.sql`** — `plans` gains `slug`, `price_yearly_cents`,
`features_json`, `seat_price_cents` and the correctly-named `dodo_product_*_id` columns;
`subscriptions` gains `cycle`, `dodo_customer_id`, `trial_ends_at`, `grace_until` and the
scheduled-downgrade pair; new `entitlement_overrides` and `feature_access_log` tables;
`members.role = 'member'` normalised to `'editor'`. Applied to local D1, 20 statements.

**`tooling/gen-seed-plans.ts` → `tooling/seed-plans.sql`** — the seed is generated from
the catalogue rather than hand-written, so the two cannot drift. New root scripts
`gen:plans`, `seed:plans`, `seed:plans:remote`, and `setup` now seeds plans. This closes
finding 6: `plans` was empty, so checkout 503'd unconditionally on a fresh database.

**`apps/api/src/lib/permissions.ts`** — RBAC on Better Auth's `createAccessControl`. Eleven
resources, four roles (owner / admin / editor / viewer) plus `member` retained as an alias,
registered on the `organization()` plugin so `editor` and `viewer` resolve to real
permissions instead of none. `roleAllows()` answers locally from the statements rather than
round-tripping `auth.api.hasPermission` on a hot path.

**`apps/api/src/lib/entitlements.ts`** — resolution against D1 with a 300 s KV cache and
explicit invalidation; `meter()` as a single atomic `INSERT … ON CONFLICT … RETURNING used`
reservation; `checkQuota` / `releaseMeter`; live gauges for forms, workspaces, seats,
storage and webhooks; `verifyCatalogue()` reporting seed drift.

**`apps/api/src/lib/authorize.ts`** — `requirePermission` (403) · `requireFeature` (402) ·
`requireQuota` · `requireGauge` · `requireSeat` · `checkDocumentLimit`, all funnelling
through one `deny()` so logging a denial is not something a gate can forget.

**`apps/api/src/lib/gate-log.ts`** — Analytics Engine for every evaluation,
`feature_access_log` for the conversion funnel, `audit_logs` for what a human must account
for, `markConverted()` to attribute a sale to the locks that caused it. Pruning wired into
the existing 5-minute cron.

**Fixed along the way**

- **Finding 10** — `resolveOrgId` now reads `sessions.active_organization_id` and falls
  back to the oldest membership. Its comment already claimed to prefer the active org; the
  SQL did not, so a user in two organizations metered and billed against the wrong one.
- **Finding 6** — `plans` is seeded by `pnpm setup`.
- **Finding 8** — features and limits are separate namespaces, so nothing can ever answer
  "Monthly remove branding limit reached (0)".
- **Finding 13** — the atomic reserve replaces check-then-increment; there is a test that
  fires two concurrent `meter()` calls at a limit boundary and asserts exactly one passes.
- A pricing arithmetic slip caught by its own test: $192/yr against $24/mo is 33% off, not
  the 31% first written down. The prices are the approved ones; the label was wrong.

**Tests** — 32 in `packages/entitlements` (catalogue invariants, resolution, grace,
overrides, the envelope, periods) and 36 in `apps/api/tests/entitlements.test.ts` against
real D1 (seeded-catalogue drift, hard/degrade/ceiling metering, concurrency, gauges
including pending invitations and form-less org assets, the full role matrix, gate
logging). Repo total 150 passing, `pnpm typecheck` green across all 7 packages.

**Known-red, pre-existing** — `apps/web` lint reports 6 React Compiler errors in
`use-autosave`, `share-tab`, `chat-client` and `theme-toggle`. All predate this work
(REBUILD.md already records them) and none of those files were touched, but it does mean
`pnpm check` is not green and was not green before.

### Phase 2 — Dodo, correctly ✅

**`lib/dodo.ts`** — checkout, customer portal, change-plan and preview, all against the
verified OpenAPI. `dodoBase()` defaults to **test** mode, so a missing `DODO_ENVIRONMENT`
produces a sandbox charge rather than a real one. Upgrades prorate and apply immediately;
downgrades are scheduled for `next_billing_date`, so a customer keeps what they paid for.

**`lib/dodo-webhook.ts`** — Standard Webhooks verification, isolated so it is testable
without a router. Signs `id.timestamp.body`, splits the signature header on **spaces**,
accepts any of several `v1,` entries during secret rotation, compares with
`timingSafeEqual`, and bounds the timestamp to ±5 minutes in both directions.

**`routes/billing.ts`** — rewritten. Nine endpoints: `plans` (public), `entitlements`,
`usage` (kept working for the existing callers), `checkout`, `portal`, `change-plan`,
`preview-change`, `invoices`, `config-check`. Webhook handler is idempotent on
`webhook-id`, records every delivery before acting, returns 5xx so Dodo retries a genuine
failure and 4xx so it does not retry a bad request, and writes what it decided into
`dodo_events.error` — including for events it deliberately ignores.

**A second reason billing never worked, found by a test.** Every mounted router declares
`.use("*", requireSession)`, which `app.route("/api", …)` expands to `/api/*` — so those
middlewares match *every* `/api` request, whichever router handles it. The webhook was
being rejected with "Sign in required" no matter how it was written. It and the public
plan catalogue now live on `billingPublicRouter`, mounted before everything else in
`app.ts`, which is the only placement that reliably escapes an auth rule it is not
mounted under.

**Tests** — 45 in `apps/api/tests/billing.test.ts`: the spec's three-part payload,
rotated secrets, tampered body, substituted id, wrong secret, replay bounds in both
directions, every named failure code, eight retries of one delivery, no-metadata events,
unrecognised plan ids, the full active → renewed → on_hold → grace → expiry sequence,
cancel-scoping, `subscription.updated` reconciliation, payments, and the route surface
including the 403-with-no-upsell for a non-owner.

### Phase 3 — API enforcement ✅

Every gate from §6.1 wired. `lib/doc-entitlements.ts` holds the three document
operations: `stripForPublish` (removes gated settings from the version being published and
reports each removal by path), `clampForRuntime` (applies plan-capped values *and*
re-derives respondent verification when a published doc is read, so a lapse takes effect
with no republish), and `brandingHiddenFor` (the single place the watermark is decided).

`routes/audit.ts` is new — the Business-tier activity log, reading `audit_logs` with
keyset pagination and a CSV export.

**Fixed:** finding 9 (`hidePoweredBy` honoured with no plan check — any free user removed
the watermark), and the inline `usage_counters` upsert in `session-do.ts:1248` replaced
with `meter()`, so response and token metering can no longer drift from the limit
decisions made everywhere else.

**Tests** — 51 in `apps/api/tests/gates.test.ts`, covering each gate on Free, Pro and
Business plus the role matrix. Three pre-existing tests were updated rather than deleted:
`public-gates` asserted the watermark bug as correct behaviour and now asserts both halves
of the real rule; `results` and `tenancy` needed paying tenants, because `all` and `/v1`
are plan-dependent surfaces now.

### Phase 4 — Feature logging ✅

Shipped with Phase 1 (`lib/gate-log.ts`) and completed here: `markConverted()` fires on
`subscription.active`, so a sale is attributed to every lock the org had hit; role denials
are deliberately excluded from `feature_access_log`, because counting them as "hit a
paywall" would poison the conversion numbers; pruning runs on the existing cron.

### Phase 5 — UI primitives ✅

`stores/paywall-store.ts` · `hooks/use-entitlements.ts` · `components/billing/gate.tsx`
(`Gate`, `LockChip`, `LockedControl`, `LockedOverlay`, `SkeletonRows`, `SkeletonChart`,
`useUpgrade`) · `components/billing/upgrade-dialog.tsx`, mounted once in `ApiProvider`.

**Global 402 interception** in `mutator.ts`: `ApiError` now carries the parsed envelope and
`customFetch` pushes plan denials into the store, so every existing and future call site
gets the right paywall with no per-call-site work. Role denials are recognised and
deliberately *not* shown as a paywall — upgrading cannot fix a role.

All frontend fetching goes through orval-generated hooks (`pnpm gen:api` re-run; the
committed client now includes `apps/web/src/lib/api/billing/`), per REBUILD.md constraint 2.

### Phase 6 — The choreography ✅

All 16 placements from §7. The four that carry the revenue:

1. **Partial tab** — real badge count from the free `abandoned` field, blurred synthetic
   table, and a 402 carrying the true number.
2. **Analytics** — headline numbers real and unblurred; funnel, per-block rates and
   duration percentiles withheld, with `worstBlockTitle`/`worstBlockIndex` sent *without*
   their numbers so the overlay can truthfully say "most people drop off at question 4".
5. **Watermark** — `LockedControl` keeps the toggle visible and off with a plan chip.
6. **Brand logo** — fully usable in the builder, so they see their form wearing their logo;
   publish strips the reference and `PublishStrippedDialog` names everything dropped.

Also: `FirstPartialToast` (once per form, only when there is both a response and an
unfinished one), the usage banner at 80% of either the AI cap or the response ceiling,
`CustomDomainField` pre-filled with their own slug, and the usage pill rewritten — it had
mistyped its payload and used a different query key from the usage page, fetching the same
data twice.

### Phase 7 — Pricing & billing pages ✅

`/pricing` (public, annual-default, full comparison built from the API payload so it can
never promise what the gates do not enforce, with the fair-use ceiling stated as a number
rather than as "subject to fair usage") and `/billing` (plan, meters, gauges, upgrade,
invoices, portal link, grace-window banner). `/usage` redirects to `/billing` rather than
being deleted, so the pill, the palette and any bookmark still work.

### Phase 8 — Hardening ✅

`docs/BILLING-RUNBOOK.md` — product setup, price changes, comping an org, replaying a
failed webhook, the "I paid and it still says Free" checklist, the funnel queries, and the
list of deliberate choices worth not re-litigating. `pnpm plans:verify` added to
`pnpm check`: it regenerates the seed and fails if the committed SQL no longer matches the
catalogue, so a price change cannot be half-applied.

---

## 13. Final state

- **248 tests passing** — 32 in `packages/entitlements`, 216 in `apps/api`.
- `pnpm typecheck` green across all 7 packages.
- `apps/api` lint clean.
- `apps/web` lint: the same **6 pre-existing** React Compiler errors it had before this
  work (`use-autosave` ×3, `share-tab`, `chat-client`, `theme-toggle`), none in a file
  touched here. `pnpm check` is therefore still red, and was red before.
- Migration `0003` applied; all three plans seeded and verified.

**One real bug caught by lint on the way through:** `useUpgrade` was being called after an
early return in `AnalyticsTab`, so hook order changed between renders. Moved above the
return.

**Still not built, and labelled everywhere it appears:** custom domains, payment
collection, Meta Pixel/GTM, refill links, Sheets/Slack, AI insights. The pricing page and
the upgrade dialog both render "coming soon" for these from the `soon` flag on the feature
metadata, so the label cannot be forgotten in one place and remembered in another.
