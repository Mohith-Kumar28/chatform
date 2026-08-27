# Billing runbook

Operational companion to `/BILLING.md` (the plan and the research). This is the file to
open when something needs doing or has gone wrong.

---

## 1. First-time setup, per environment

Do this once for test mode and again for live. Nothing below is inferred from code — Dodo
product ids are per-environment by design, so a test key can never charge a real card.

### 1.0 The fast path

Put your Dodo API key into `apps/api/.dev.vars` (the file is gitignored) and run:

```bash
# test mode, against the deployed worker, secrets uploaded to it
pnpm dodo:provision -- \
  --webhook-url https://chatform-api.mohithkumar808.workers.dev \
  --remote --push-secrets
```

That creates all six products, the product collection, and the webhook endpoint; reads the
webhook signing key back and writes it into `.dev.vars`; and links every product id into
the `plans` table. It is idempotent — it lists what exists and creates only what is
missing, so running it twice is safe and re-running after a failure resumes.

| Flag | |
|---|---|
| `--webhook-url <origin>` | register the webhook and read its signing key back |
| `--remote` | write product ids to the deployed D1 instead of the local one |
| `--push-secrets` | upload `DODO_API_KEY`, `DODO_WEBHOOK_SECRET` and `DODO_ENVIRONMENT` to the worker |
| `--live` | live mode — **real money** |

The script never prints the API key, never passes it as a command-line argument, and never
writes it anywhere other than the file you put it in.

§1.1–1.5 below is the same thing done by hand, for when you want to see or change what it
would do.

### 1.1 Create the products in Dodo

Dashboard → Products → New product. Six of them:

| Product | Type | Price | Billing period |
|---|---|---|---|
| chatform Pro (monthly) | Subscription | $24.00 | Monthly |
| chatform Pro (yearly) | Subscription | $192.00 | Yearly |
| chatform Business (monthly) | Subscription | $84.00 | Monthly |
| chatform Business (yearly) | Subscription | $660.00 | Yearly |
| chatform seat (monthly) | Subscription add-on | $10.00 | Monthly |
| chatform seat (yearly) | Subscription add-on | $120.00 | Yearly |

A Dodo subscription product carries its own billing frequency — there is no separate price
object — which is why monthly and yearly are two *products* rather than one product with
two prices.

**Set "Subscription Period" to something long — 10 years.** It is the total *term* after
which renewals stop, not the billing interval. Setting it equal to the payment frequency
makes every subscription expire after a single cycle, which is the easiest way to
misconfigure this and the hardest to notice, because the first month works perfectly.

Then create a **Product Collection** containing the four plan products. That is what lets
a customer switch tier inside the customer portal without us building an upgrade flow.

### 1.2 Set the environment variables

`apps/api/.dev.vars` locally (see `.dev.vars.example`), or
`wrangler secret put` for a deployed worker:

```
DODO_ENVIRONMENT=test          # or "live". Absent means test — never live by accident.
DODO_API_KEY=...               # Dashboard → Developer → API Keys
DODO_WEBHOOK_SECRET=...        # Dashboard → Developer → Webhooks, per endpoint
```

### 1.3 Point the webhook at us

Dashboard → Developer → Webhooks → Add endpoint:

- URL: `https://<your-api-host>/api/billing/webhook`
- Events: all `subscription.*`, `payment.succeeded`, `payment.failed`, `refund.succeeded`

Copy the signing secret into `DODO_WEBHOOK_SECRET`. Without it the endpoint answers **503**
and no subscription will ever activate — deliberately, because the alternative is accepting
unverified deliveries.

### 1.4 Seed the plans and link the products

```bash
pnpm gen:plans      # regenerate tooling/seed-plans.sql from @repo/entitlements
pnpm seed:plans     # apply it locally  (seed:plans:remote for the deployed D1)
```

Then link each product id:

```bash
pnpm --filter @repo/api exec wrangler d1 execute chatform --local --command \
  "UPDATE plans SET dodo_product_monthly_id='pdt_...', dodo_product_yearly_id='pdt_...', seat_addon_product_id='pdt_...' WHERE id='pro'"
```

### 1.5 Confirm

As an owner, `GET /api/billing/config-check`. It reports every missing id, a missing key or
secret, and any drift between the seeded `plans` rows and the authored catalogue. `ok: true`
means this environment can actually take money.

### 1.6 Switch on the free revenue

Dashboard → Settings: enable **subscription payment retries**, **dunning emails** and
**abandoned cart recovery**. All three are switches, not integrations, and all three recover
money we would otherwise lose.

---

## 2. Changing prices or limits

The catalogue in `packages/entitlements/src/plans.ts` is the only place to edit. Then:

```bash
pnpm gen:plans && pnpm seed:plans
pnpm --filter @repo/entitlements test      # catalogue invariants
```

`verifyCatalogue()` (and therefore `config-check`) fails until the DB matches, so a
half-applied change is loud rather than silent.

**Raising a price** also means creating a new Dodo product and relinking — existing
subscribers keep the product they bought, which is the correct behaviour and the reason we
never mutate a product's price in place.

---

## 3. Comping an organization

For design partners, enterprise deals, support gestures. No new plan row needed.

```sql
-- Grant one feature indefinitely
INSERT INTO entitlement_overrides (id, organization_id, kind, key, value, reason, created_at)
VALUES ('ovr_' || lower(hex(randomblob(8))), 'org_xxx', 'feature', 'partial_responses', 'true',
        'design partner', unixepoch() * 1000);

-- Raise one limit until a date
INSERT INTO entitlement_overrides (id, organization_id, kind, key, value, reason, expires_at, created_at)
VALUES ('ovr_' || lower(hex(randomblob(8))), 'org_xxx', 'limit', 'ai_conversations_per_month', '5000',
        'evaluating', 1790000000000, unixepoch() * 1000);

-- Unlimited: an empty value
UPDATE entitlement_overrides SET value = '' WHERE organization_id = 'org_xxx' AND key = 'responses_ceiling_per_month';
```

Then bust the cache, or wait up to 300 s:

```bash
pnpm --filter @repo/api exec wrangler kv key delete --binding KV_CONFIG "ent:org_xxx" --local
```

**A single month's bump** is better done on the counter, which needs no override row and
expires by itself when the period rolls over:

```sql
UPDATE usage_counters SET limit_override = 500
 WHERE organization_id = 'org_xxx' AND period = '2026-08' AND metric = 'ai_generations';
```

---

## 4. A webhook failed

Every delivery is recorded in `dodo_events` before it is acted on, keyed on Dodo's
`webhook-id`. That is what makes recovery safe.

```sql
SELECT dodo_event_id, type, status, error, datetime(created_at/1000, 'unixepoch')
  FROM dodo_events WHERE status != 'processed' ORDER BY created_at DESC LIMIT 20;
```

- **`status = 'failed'`** — the handler threw. `error` says why. The endpoint returned 5xx,
  so Dodo has already retried (8 attempts over ~28 hours). Fix the bug, deploy, then replay
  from Dashboard → Webhooks → the event → Resend. The replay arrives with a fresh
  `webhook-id`, and `dispatch` is itself idempotent, so this is safe.
- **`status = 'received'` with no `processed_at`** — the worker died mid-handler. Same
  recovery.
- **`error` contains "no organizationId"** — the checkout was created without metadata,
  which only happens if someone made a payment link by hand in the Dodo dashboard. Attribute
  it manually with an `INSERT INTO subscriptions`, or refund and let them buy through the app.

**Nothing in `dodo_events` at all** means the delivery never verified. Check
`config-check`, then the worker logs for `dodo_webhook_rejected` — the reason is logged:

| Reason | Meaning |
|---|---|
| `missing_secret` | `DODO_WEBHOOK_SECRET` not set (endpoint answered 503) |
| `missing_headers` | Not a Standard Webhooks request — check the endpoint URL |
| `stale_timestamp` | Clock skew over 5 minutes, or a replay attempt |
| `signature_mismatch` | Wrong secret, usually a test secret on a live endpoint |

---

## 5. "I paid and it still says Free"

In order of likelihood:

1. **The webhook has not arrived yet.** Check `dodo_events`.
2. **The entitlement cache is warm.** It has a 300 s TTL and every handler invalidates it,
   but a failed KV write would leave it. Delete `ent:<orgId>` as in §3.
3. **Two organizations.** `resolveOrgId` prefers `sessions.active_organization_id`; if they
   paid while one org was active and are now looking at another, the plan is on the first.
   `SELECT organization_id, plan_id, status FROM subscriptions WHERE organization_id IN (SELECT organization_id FROM members WHERE user_id = 'usr_xxx')`.
4. **The subscription is on the wrong plan.** `metadata.planId` from checkout decides it. If
   it is wrong, fix the row and invalidate.

---

## 6. A card failed

Nothing to do. `subscription.on_hold` opens a 7-day grace window during which the customer
keeps everything, Dodo's dunning retries the card, and the billing page shows them a banner
with a portal link. After grace they read as Free — and **their data is untouched**, which
is the point.

To extend a grace window for someone who is dealing with it:

```sql
UPDATE subscriptions SET grace_until = unixepoch() * 1000 + 7*86400000
 WHERE organization_id = 'org_xxx';
```

---

## 7. Which gate is actually selling?

`feature_access_log` is the funnel. One row per (org, feature): when they first hit the
lock, how many times, and whether they then bought.

```sql
-- Conversion rate per gate
SELECT feature,
       COUNT(*) AS orgs_blocked,
       SUM(CASE WHEN converted_at IS NOT NULL THEN 1 ELSE 0 END) AS converted,
       ROUND(100.0 * SUM(CASE WHEN converted_at IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct
  FROM feature_access_log GROUP BY feature ORDER BY converted DESC;

-- Which surface a gate is hit on
SELECT feature, surface, SUM(denial_count) AS hits
  FROM feature_access_log GROUP BY feature, surface ORDER BY hits DESC;
```

Every *evaluation* — allow and deny — also goes to Analytics Engine
(`chatform_events`), blobs `[orgId, plan, feature, decision, surface]`. Query it for
sequences the table cannot show, e.g. how many gates someone met before buying.

Unconverted rows are pruned after 90 days by the existing cron. Converted rows are kept
forever: they are the attribution for a sale.

---

## 8. Deliberate choices worth not re-litigating

Each of these looks like an oversight and is not.

- **Data is never deleted.** No retention limit on any plan. The conversion mechanism
  depends on a free user knowing their partial responses are intact behind the glass, and
  deleting them would destroy both the leverage and the trust.
- **Cancellation lives in the Dodo portal.** We do not rebuild it and we add no friction.
  Confirm-shaming on cancel is the one dark pattern that reliably costs more than it returns.
- **Respondents never see a billing error.** An exhausted response ceiling presents as the
  form being closed, in the owner's own words. An exhausted AI cap degrades the interview to
  scripted questions. Neither is ever the respondent's problem.
- **Authoring is never gated; publishing is.** A free user can turn on every switch and see
  their form wearing their logo. `POST /publish` strips what the plan excludes and reports
  each removal by name — honest, and the highest-intent upsell moment in the product.
- **The working document is never modified by a strip.** Upgrading and republishing restores
  everything with no re-authoring, and no uploaded asset is deleted.
- **Blur is not a boundary.** Wherever data is gated the server withholds it and the client
  blurs a synthetic skeleton. Never put real withheld data behind CSS.
- **Unbuilt features are labelled.** Custom domains, payments, Meta Pixel/GTM, refill links
  and AI insights are priced but not built, and both the pricing page and the upgrade dialog
  say "coming soon". Selling an unbuilt feature as included is a misrepresentation, not a
  tactic.
- **Usage periods are UTC calendar months** on every plan, not subscription anniversaries.
  Simpler, matches what the usage page shows, and documented rather than accidental.

---

## 8b. Two things that look like auth failures and are not

**Cloudflare error 1010.** Dodo sits behind Cloudflare, and so does our own worker.
A request whose User-Agent looks automated is answered with HTTP **403** and a
`text/plain` body reading `error code: 1010`. It is indistinguishable from a rejected API
key unless you read the body. Both `lib/dodo.ts` and `tooling/provision-dodo.py` now send
an explicit User-Agent, and `lib/dodo.ts` logs `dodo_blocked_by_cloudflare` when it sees
1010 so nobody spends an afternoon rotating a key that was fine.

If you script against either host, send a User-Agent. `curl` does; `python-urllib` and
several HTTP libraries do not.

**Inconsistent list envelopes.** `/products` returns `{items: [...]}` with `page_number`
pagination; `/webhooks` returns `{data: [...], done, iterator}`. Assuming one shape gets
you an empty list for the other — which is how the provisioner created a *second* webhook
endpoint on its second run, and therefore duplicate deliveries of every event. Its
`list_all` handles both now.

---

## 9. The deployed environment

| | |
|---|---|
| API | `https://chatform-api.mohithkumar808.workers.dev` |
| Webhook endpoint | `…/api/billing/webhook` |
| Cloudflare account | `53fa8c878293e48df606b938d1accce1` |
| D1 | `chatform` · `fa46b30f-26d4-4076-a7c3-d609401c3e15` |
| KV | `chatform-config` · `a72116dbd29c4e07b7d887272c1e999e` |
| R2 | `chatform-uploads` |
| Queues | `q-submissions` (+dlq) · `q-webhooks` (+dlq) · `q-exports` |
| Cron | `*/5 * * * *` |
| Dodo mode | **test** |
| Dodo webhook endpoint | `ep_3IUCJQrmhTL5MssQsTxNu8jKR4z` |
| Dodo product collection | `pdc_0NmHTirlIydWZHZ1OW3P8` |

Test-mode product ids:

| Plan | Monthly | Yearly |
|---|---|---|
| Pro | `pdt_0NmHTTaWTtrASRA1M25Y5` | `pdt_0NmHTTc5x2DkD86HlMs0B` |
| Business | `pdt_0NmHTTdrTzJ7AbZaoXpXh` | `pdt_0NmHTTgFZ3u00c4cDafet` |
| Extra seat | `pdt_0NmHTTiGzGCwEF2cSwDmR` | `pdt_0NmHTTjrDGluqztWXEZLn` |

Secrets on the worker: `BETTER_AUTH_SECRET`, `SIGNING_SALT`, and whatever
`--push-secrets` has uploaded. Check with
`pnpm --filter @repo/api exec wrangler secret list`.

### Origins

Plain vars in `wrangler.jsonc`, not secrets. Two of them, and they are not the same thing:

| | |
|---|---|
| `APP_ORIGIN` | where **this API** answers. Better Auth's `baseURL`. |
| `WEB_ORIGINS` | comma-separated list of **browser app** origins allowed to drive it. First entry is the default redirect target. |

Currently `WEB_ORIGINS` is `http://localhost:3000,https://chatform-api.mohithkumar808.workers.dev`.
**Add the real web domain to that list when the frontend is deployed** — nothing else
changes, because `returnOrigin()` (see `lib/origins.ts`) picks whichever listed origin the
request actually came from. So one deployed API serves local dev and production at the same
time, and a purchase begun in either returns to the right place.

An unlisted origin is never reflected: doing so would hand anyone who can reach the
endpoint control of where checkout redirects.

**Cookies adapt automatically.** When the app is on a different host from the API, Better
Auth is configured with `SameSite=None; Secure` so the cross-site session cookie is
actually stored — its default `Lax` silently produces a working sign-in followed by 401s on
everything. When the API is plain-http localhost, `None` is impossible (it requires
`Secure`), so that is switched off rather than breaking local dev. All of it is pinned by
`tests/origins.test.ts`.

### The two-database trap

The deployed worker has its own D1, separate from your local one. A checkout started
against the *local* API carries a local `organizationId`, and the webhook arrives at the
*deployed* worker, which cannot find that organization — the handler throws, the event is
recorded `failed`, and nothing activates.

**The web app now points at the deployed API by default**, so the normal path is entirely
production and this does not arise. It only bites if you deliberately switch:

- **All production** (default) — nothing to do. `apps/web/.env.local` unset.
- **All local** — set `NEXT_PUBLIC_API_ORIGIN=http://localhost:8787` in
  `apps/web/.env.local`, then run a tunnel (`cloudflared tunnel --url http://localhost:8787`)
  and register *that* URL as a second webhook endpoint so deliveries reach the local D1.

---

## 10. Where things live

| Concern | File |
|---|---|
| The catalogue: prices, features, limits | `packages/entitlements/src/plans.ts` |
| Feature keys and their minimum plan | `packages/entitlements/src/features.ts` |
| Limit keys and enforcement modes | `packages/entitlements/src/limits.ts` |
| Plan resolution, grace window, overrides | `packages/entitlements/src/resolve.ts` |
| The 402/403 denial envelope | `packages/entitlements/src/envelope.ts` |
| RBAC roles and statements | `apps/api/src/lib/permissions.ts` |
| Entitlement resolution, metering, gauges | `apps/api/src/lib/entitlements.ts` |
| The gate middlewares | `apps/api/src/lib/authorize.ts` |
| Gate/audit/funnel logging | `apps/api/src/lib/gate-log.ts` |
| Publish stripping, runtime clamping, watermark | `apps/api/src/lib/doc-entitlements.ts` |
| Dodo client | `apps/api/src/lib/dodo.ts` |
| Standard Webhooks verification | `apps/api/src/lib/dodo-webhook.ts` |
| Billing routes and the webhook handler | `apps/api/src/routes/billing.ts` |
| Activity log | `apps/api/src/routes/audit.ts` |
| The UI hook | `apps/web/src/hooks/use-entitlements.ts` |
| Gate primitives, locks, overlays | `apps/web/src/components/billing/gate.tsx` |
| The one upgrade dialog | `apps/web/src/components/billing/upgrade-dialog.tsx` |
| Global 402 interception | `apps/web/src/lib/api/mutator.ts` |
| Pricing page · billing page | `apps/web/src/app/pricing/page.tsx` · `apps/web/src/app/(app)/billing/page.tsx` |
