# @chatformhq/js

## Unreleased

### Breaking

- `paymentAccounts.connectStripe()` is gone, with the endpoint behind it.
  Stripe now connects the way Razorpay and Cashfree do:
  `paymentAccounts.startOAuth("stripe", { returnTo })` returns Stripe's consent
  page for a person to open. No Stripe key is pasted or stored.

## 0.3.0

Every type is now generated from the API's OpenAPI spec instead of written by
hand. The hand-written ones had drifted: `ChatformResponse` had no `metadata`,
`TurnResult` had no `pendingPayment`, `SessionAction` was missing three
actions, and `sessions.get()` returned `Record<string, unknown>` where the API
documents the whole shape. A spec change now reaches these types through
`pnpm --filter @chatformhq/js gen:types`, and CI fails until it has run.

### Fixed

- **`verifyWebhook` rejected every real delivery.** Chatform signs with the
  base64-decoded bytes after `whsec_`, as Standard Webhooks specifies; this
  keyed its HMAC with the literal string. Pinned to the spec's published test
  vector.
- Retries backed off by zero seconds when a 5xx carried no `Retry-After`.

### New

- `chatform.forms.settings`: `get`, `update`. Settings by key, with the plan's
  refusals listed in `rejected`.
- `chatform.forms.payments.list()`: payments a form's payment questions took.
- `chatform.forms.knowledge.downloadFile()`.
- `chatform.paymentAccounts`: `list`, `connectStripe`, `startOAuth`,
  `onboardCashfree`, `update`, `disconnect`.
- `chatform.import({ url })`: a form from Google Forms, Typeform, Tally,
  Jotform, Youform or any public page. Saves nothing.
- `sessions.auth.email.start()` / `.verify()`: emailed sign-in codes.
- `sessions.startPayment()` / `confirmPayment()`: the headless Pay button.
- `templates.use(slug, { workspace })`.
- `webhooks.update()`, `stats()`, `retryFailed()`, and a `status` filter on
  `deliveries()`, for the delivery queue.
- Types for the 202 a slow turn answers with (`TurnProcessing`, and
  `TurnOutcome` for either), `SessionState`, `PendingPayment`,
  `CheckoutLaunch`, `Analytics`, `FormSettings` and the rest, all exported.

### Breaking

- `webhooks.deliveries(id, request)` is now `deliveries(id, options, request)`.
  It returns the whole page (`{ data, has_more, next_cursor }`).
- `respondent.ipHash` is gone from `responses.create()` and
  `sessions.create()`. The API no longer reads or stores IP addresses.
- `forms.get()` is typed as what it returns: the public config, or the draft
  document for a form that was never published. Narrow on `"doc" in result`,
  or call `getDocument()`.
- Types that were loose are now exact, so code that relied on an index
  signature (`question.anything`) may need a cast. `KnowledgeSource`,
  `Integration` and `RespondentAuthResult` are the ones most likely to notice.
- `forms.analytics()` returns every breakdown the API sends, not a subset.

## 0.2.0

The API grew from 43 operations to 69 while this package sat at 0.1.1. This
covers the rest of it, and ships three behaviours that were written before
0.1.1 shipped and never published.

### New resources

- `chatform.templates` — `list`, `get`, `use`. `use` creates a draft, exactly as
  `forms.create` does.
- `chatform.ai` — `generateForm`, `editForm`, `clarifyForm`. Its own resource
  because `ai:generate` is the one scope that spends money per call; a 402 here
  means the month's generations are gone, not that a card failed. Nothing is
  saved: pass the document you get back to `forms.create` or
  `forms.updateDocument` to keep it.
- `chatform.forms.versions` — `list`, `get` (optionally diffed against another
  version), `restore`. `restore` writes the draft, so respondents see nothing
  change until you publish.
- `chatform.forms.knowledge` — `list`, `addText`, `addLink`, `crawl`, `upload`,
  `remove`. Indexing happens after the call returns; `list` is where you watch
  it finish.
- `chatform.forms.integrations` — `list`, `setSpreadsheet`,
  `rotateSpreadsheet`, `removeSpreadsheet`. Rotating has its own name because
  revoking a leaked feed URL is done in a hurry.
- `chatform.sessions.auth` — `google`, `phone`. Available on the browser client
  too, since the page is where the identity token is minted.

### New methods

- `forms.unpublish()` — the inverse of `publish()`, which had no pair.
- `forms.followupAnalytics()` — how the abandonment emails for a form are doing.
- `sessions.verifyPhoneAnswer()` — settles a pending phone verification on a
  question. Not under `auth`: it attaches no identity, it proves one answer.

### Now published

Written before 0.1.1 and never released, so anyone on the registry version had
types that could not represent what the API was already sending:

- `SessionAction` gains `resend_code`, `change_answer` and `undo_screen_out`.
- `ResponseStatus` gains `disqualified`.
- `PublicEnding` gains `kind` (`"success" | "screen_out"`) and `requirements`.
- `TurnResult` gains `pendingVerification`.

`SessionAction` is now exported from both entrypoints, which is what
`@chatformhq/react` needs to type its own `act`.

### Changed

- `forms.getDocument()` returns `doc: FormDocument` rather than `doc: unknown`.
  `FormDocument` leaves `blocks` as `unknown[]` on purpose: the API publishes a
  full JSON Schema per block type at `GET /v1/blocks/{type}`, which is the
  authority and which gains a block type without this package being
  republished. The document *around* the blocks has no published schema at all,
  so those field names were read off `GET /v1/templates/{slug}`.
- `forms.get()` documents what it actually does: it reads the **published**
  form, so a draft answers 404. `getDocument()` is the one that works before you
  publish. `forms.list()` likewise hides drafts unless you pass
  `status: "draft"` or `"all"`.

### Reads both list envelopes

`/v1/templates`, `/v1/webhooks`, `/v1/forms/{id}/versions` and
`/v1/forms/{id}/integrations` used to answer a bare array and now answer
`{data, has_more, next_cursor}` like every other list. This version reads either,
so it works against a deployment on either side of that change, and keeps
returning an array from `list()` for all four: they are bounded, so there is no
cursor for a caller to carry.

**If you are on 0.1.1, one method breaks against the updated API**:
`webhooks.list()` returns the envelope object rather than an array. Nothing else
does — `exports.list()` already unwrapped `data`, and every other method is
unaffected. Upgrading to 0.2.0 fixes it.

### Internal

- `HttpClient` gained a multipart arm for `knowledge.upload`, which leaves
  `content-type` to `fetch` so the boundary survives.
- Still zero runtime dependencies.
