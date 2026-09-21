# @chatformhq/js

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

### Internal

- `HttpClient` gained a multipart arm for `knowledge.upload`, which leaves
  `content-type` to `fetch` so the boundary survives.
- Still zero runtime dependencies.
