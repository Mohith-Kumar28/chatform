# API verification run `mubay3y8pxvt`

Target: `https://api.chatform.in` (production). 2026-09-21T13:52:12.079Z

## Coverage

| | |
| --- | --- |
| `/v1` operations in the spec | 69 |
| reached by this run | 69 |
| never reached | 0 |
| pass | 63 |
| fail | 0 |
| negative-only | 6 |
| skipped | 0 |

Response checking: **22** verified against a schema the spec declares, **20** against a hand-written expectation, **27** not checked.

Latency across 75 calls: p50 236ms, p95 6578ms, max 19040ms.

## Findings

### A schema validation failure does not use the documented error envelope

Severity: high.

`apps/web/content/docs/errors.mdx` opens with "Every error has the same shape" and shows `{error:{code,message,issues,request_id,doc_url}}`. A body the route's Zod schema rejects instead returns the validator's own output, in which `error` is an **array** of issues and there is no `code`, no `message`, no `request_id` and no `doc_url`:

```json
{"data":{"answers":{"wrong":"shape"}},"error":[{"code":"invalid_union","errors":[[{"expected":"array","code":"invalid_type","path":["answers"],"message":"Invalid input: expected array, received object"}],[{"expected":"string","code":"invalid_type","path":["ref"],"message":"Invalid input: expected string, received undefined"},{"code":"invalid_type","expected":"nonoptional","path":["value"],"message":"Invalid input: ex
```

Two consequences. Any client keying off `error.code` -- including `@chatformhq/js`, whose `ChatformError` degrades to `code: "http_400"` and `message: "Request failed with 400"` -- loses every field-level issue, so the developer is told the request failed but never which field. And the response **echoes the submitted body back** under `data`, so a rejected payload carrying an email or a phone number is reflected to the caller.

It reaches every route that validates a body or query: 23 of the 69 `/v1` operations. `validator` is imported straight from `hono-openapi` in `apps/api/src/routes/v1.ts` with no error hook, so the default output is what ships.

### A bodyless POST with a JSON content-type answers in plain text

Severity: medium.

`POST /v1/responses/{id}/complete` with `content-type: application/json` and no body returns HTTP 400 as `text/plain`:

```
Malformed JSON in request body
```

Not JSON, so not the documented envelope, and with no `request_id` to quote. Sending `content-type: application/json` on a POST with nothing to send is what most HTTP clients do by default. `@chatformhq/js` happens to be safe -- it sets the header only when there is a body -- but a developer writing `curl -X POST -H 'content-type: application/json'` by hand gets this.

### List endpoints do not share one envelope

Severity: medium.

`apps/web/content/docs/pagination.mdx` states that list endpoints return `{data, has_more, next_cursor}` and that you page by handing `next_cursor` back. 2 of 7 do:

| Endpoint | Response |
| --- | --- |
| `GET /v1/forms` | `{data, has_more, next_cursor}` |
| `GET /v1/forms/{id}/responses` | `{data, has_more, next_cursor}` |
| `GET /v1/templates` | `bare array` |
| `GET /v1/webhooks` | `bare array` |
| `GET /v1/exports` | `{data}` |
| `GET /v1/forms/{id}/versions` | `bare array` |
| `GET /v1/forms/{id}/integrations` | `bare array` |

A bare array cannot carry a cursor, so those endpoints have no paging at all and a client written to the documented contract reads `.data` of an array and gets `undefined`. Changing them is a breaking change to a published API, so the near-term fix is to correct the page; the envelope belongs to a future version.

### 47 of 69 `/v1` operations declare no response body

Severity: high.

The reference page generated for each of these shows a status code and a one-line description, and nothing about what comes back. The gap is not in the new endpoints -- templates, versions, knowledge, integrations, AI, exports and uploads all declare schemas. It is the original core that does not: `GET /v1/me`, `GET /v1/forms`, `POST /v1/forms`, every operation in the response lifecycle, and all of `/v1/sessions`.

It also means this harness cannot check those responses against anything but a hand-written expectation, and that `orval` generates the dashboard's own client against `unknown` for them.

Unschema'd:

- `POST /v1/forms/{id}/responses`
- `GET /v1/forms/{id}/responses`
- `POST /v1/responses/{id}/answers`
- `DELETE /v1/responses/{id}/answers/{ref}`
- `POST /v1/responses/{id}/complete`
- `POST /v1/responses/{id}/abandon`
- `GET /v1/responses/{id}`
- `GET /v1/responses/{id}/next`
- `GET /v1/blocks`
- `GET /v1/blocks/{type}`
- `GET /v1/events`
- `GET /v1/me`
- `GET /v1/forms`
- `POST /v1/forms`
- `GET /v1/forms/{id}`
- `DELETE /v1/forms/{id}`
- `PUT /v1/forms/{id}/doc`
- `POST /v1/forms/{id}/unpublish`
- `POST /v1/forms/{id}/publish`
- `GET /v1/forms/{id}/analytics`
- `GET /v1/forms/{id}/followup-analytics`
- `POST /v1/templates/{slug}/use`
- `GET /v1/forms/{id}/versions/{version}`
- `POST /v1/forms/{id}/versions/{version}/restore`
- `POST /v1/ai/edit-form`
- `DELETE /v1/forms/{id}/integrations/spreadsheet`
- `POST /v1/webhooks`
- `DELETE /v1/webhooks/{id}`
- `GET /v1/webhooks/{id}/deliveries`
- `POST /v1/webhooks/{id}/deliveries/{deliveryId}/replay`
- `GET /v1/exports`
- `POST /v1/sessions/{sid}/messages`
- `POST /v1/sessions/{sid}/actions`
- `GET /v1/sessions/{sid}`
- `GET /v1/sessions/{sid}/events`
- `POST /v1/sessions/{sid}/token/rotate`
- `POST /v1/sessions/{sid}/auth/google`
- `POST /v1/sessions/{sid}/auth/phone/token`
- `POST /v1/sessions/{sid}/verify/phone-token`
- `POST /v1/chat/sessions/{sid}/messages`
- `POST /v1/chat/sessions/{sid}/actions`
- `GET /v1/chat/sessions/{sid}`
- `GET /v1/chat/sessions/{sid}/events`
- `POST /v1/chat/sessions/{sid}/token/rotate`
- `POST /v1/chat/sessions/{sid}/auth/google`
- `POST /v1/chat/sessions/{sid}/auth/phone/token`
- `POST /v1/chat/sessions/{sid}/verify/phone-token`

### The form document has no published schema

Severity: high.

`POST /v1/forms`, `PUT /v1/forms/{id}/doc` declare their `doc` parameter as `{}` -- an empty schema, which accepts anything and describes nothing. No documentation page describes an ending, an ending rule or a condition either.

So the one artifact a developer must compose to build a form programmatically is the one thing the API does not describe. `GET /v1/blocks/{type}` publishes a full JSON Schema per block type and is genuinely good; the document *around* the blocks -- `endings`, `endingRules`, `logic`, `variables`, `settings` -- has nothing. The only way to learn it is to read back `GET /v1/templates/{slug}` and imitate it, or to guess against the linter.

Guessing against the linter is what this run did, and it took three rounds. Two of the linter's messages were excellent (it named the option id to use, and explained that an ending rule pinned to a question can never fire). The third, for an `endings[].requirements` entry given as a string rather than `{id, label, when}`, was `"Requirements: This is missing"` -- which never says what was expected.

### 16 em dashes in the published API reference

Severity: low.

Two commits swept em dashes out of the product (`89c4ff7`, `9ef4be5`) and the developer surface was not in either. These strings are `summary` and `description` values on `/v1` routes, and they render onto the public reference pages at `chatform.in/docs/api/v1/*`. `apps/api/src/lib/guards.ts:289` ships one inside a live error message, and `apps/api/src/routes/v1/meta.ts:64` ships one inside a response body, where `GET /v1/blocks/{type}` returns `answered_by: "matched exactly — never sent to a model"`.

- `GET /v1/forms/{id} (summary)`
- `DELETE /v1/forms/{id} (summary)`
- `POST /v1/templates/{slug}/use (description)`
- `GET /v1/forms/{id}/versions (description)`
- `POST /v1/forms/{id}/versions/{version}/restore (description)`
- `POST /v1/ai/generate-form (description)`
- `POST /v1/ai/edit-form (description)`
- `POST /v1/ai/clarify-form (description)`
- `PUT /v1/forms/{id}/integrations/spreadsheet (description)`
- `POST /v1/webhooks (summary)`
- `GET /v1/files/{id} (description)`
- `POST /v1/sessions/{sid}/uploads/intent (summary)`
- ...and 4 more

### `docs/scopes.mdx` states an endpoint count that is out of date

Severity: low.

The page says "Twenty-one of the forty-three `/v1` endpoints accept a publishable key". There are now **69**. A hand-written count goes stale on the next endpoint; deriving it in `tooling/gen-api-docs.ts` would keep it honest.

### A form you just created is invisible through both documented read paths

Severity: high.

`POST /v1/forms` answers 201 with an id. Immediately afterwards:

- `GET /v1/forms/{id}` answers **404** `not_found` ("Form not found"), for a form that plainly exists.
- `GET /v1/forms` does **not** list it.

Both have explanations and neither is discoverable. `GET /v1/forms/{id}` returns the *published* config, and the working document is behind `?view=document` -- a parameter declared nowhere in `openapi.json` (the operation lists `id` as its only parameter) and mentioned on no documentation page. `GET /v1/forms` defaults to `status: "published"`, so a draft needs `?status=draft` or `?status=all`; the default is not stated on the reference page either.

`@chatformhq/js` is unaffected, because `forms.getDocument()` sends `view=document` -- so the SDK quietly knows something the API reference does not say. A developer following the reference, which is the audience `docs/quickstart.mdx` addresses first, creates a form and cannot find it.

## Every operation

| Operation | Status | Expected | Check | Outcome | ms |
| --- | --- | --- | --- | --- | --- |
| `DELETE /v1/forms/{id}` | 200 | 200/204 | unchecked | pass | 986 |
| `DELETE /v1/forms/{id}/integrations/spreadsheet` | 200 | 200/204/404 | unchecked | pass | 168 |
| `DELETE /v1/forms/{id}/knowledge/{sourceId}` | 200 | 200/204 | schema-verified | pass | 821 |
| `DELETE /v1/responses/{id}/answers/{ref}` | 200 | 200/204 | unchecked | pass | 214 |
| `DELETE /v1/webhooks/{id}` | 200 | 200/204 | unchecked | pass | 212 |
| `GET /v1/blocks` | 200 | 200 | shape-asserted | pass | 226 |
| `GET /v1/blocks/{type}` | 200 | 200 | shape-asserted | pass | 138 |
| `GET /v1/chat/sessions/{sid}` | 200 | 200 | unchecked | pass | 220 |
| `GET /v1/chat/sessions/{sid}/events` | 200 | 200 | unchecked | pass | 302 |
| `GET /v1/events` | 200 | 200 | shape-asserted | pass | 144 |
| `GET /v1/exports` | 200 | 200 | unchecked | pass | 149 |
| `GET /v1/exports/{id}` | 200 | 200 | schema-verified | pass | 155 |
| `GET /v1/files/{id}` | 200 | 200 | schema-verified | pass | 1155 |
| `GET /v1/forms` | 200 | 200 | shape-asserted | pass | 154 |
| `GET /v1/forms/{id}` | 200 | 200 | shape-asserted | pass | 528 |
| `GET /v1/forms/{id}/analytics` | 200 | 200 | shape-asserted | pass | 166 |
| `GET /v1/forms/{id}/followup-analytics` | 200 | 200 | shape-asserted | pass | 229 |
| `GET /v1/forms/{id}/integrations` | 200 | 200 | schema-verified | pass | 178 |
| `GET /v1/forms/{id}/knowledge` | 200 | 200 | schema-verified | pass | 161 |
| `GET /v1/forms/{id}/responses` | 200 | 200 | shape-asserted | pass | 154 |
| `GET /v1/forms/{id}/versions` | 200 | 200 | schema-verified | pass | 323 |
| `GET /v1/forms/{id}/versions/{version}` | 200 | 200 | shape-asserted | pass | 172 |
| `GET /v1/me` | 200 | 200 | shape-asserted | pass | 1485 |
| `GET /v1/responses/{id}` | 200 | 200 | shape-asserted | pass | 272 |
| `GET /v1/responses/{id}/next` | 200 | 200 | unchecked | pass | 188 |
| `GET /v1/sessions/{sid}` | 200 | 200 | unchecked | pass | 196 |
| `GET /v1/sessions/{sid}/events` | 200 | 200 | unchecked | pass | 150 |
| `GET /v1/templates` | 200 | 200 | schema-verified | pass | 154 |
| `GET /v1/templates/{slug}` | 200 | 200 | schema-verified | pass | 158 |
| `GET /v1/webhooks` | 200 | 200 | schema-verified | pass | 1045 |
| `GET /v1/webhooks/{id}/deliveries` | 200 | 200 | unchecked | pass | 155 |
| `POST /v1/ai/clarify-form` | 200 | 200 | schema-verified | pass | 2161 |
| `POST /v1/ai/edit-form` | 200 | 200/422 | shape-asserted | pass | 4198 |
| `POST /v1/ai/generate-form` | 200 | 200 | schema-verified | pass | 6578 |
| `POST /v1/chat/sessions/{sid}/actions` | 200 | 200/400/409 | unchecked | pass | 19040 |
| `POST /v1/chat/sessions/{sid}/auth/google` | 400 | 400/401/403/409/422 | unchecked | negative-only | 159 |
| `POST /v1/chat/sessions/{sid}/auth/phone/token` | 400 | 400/401/403/409/422 | unchecked | negative-only | 146 |
| `POST /v1/chat/sessions/{sid}/messages` | 200 | 200/202 | unchecked | pass | 11004 |
| `POST /v1/chat/sessions/{sid}/token/rotate` | 200 | 200 | unchecked | pass | 549 |
| `POST /v1/chat/sessions/{sid}/verify/phone-token` | 400 | 400/401/403/409/422 | unchecked | negative-only | 146 |
| `POST /v1/forms` | 201 | 200/201 | shape-asserted | pass | 172 |
| `POST /v1/forms/{id}/chat/sessions` | 200 | 200/201 | schema-verified | pass | 11350 |
| `POST /v1/forms/{id}/exports` | 202 | 200/201/202 | schema-verified | pass | 1164 |
| `POST /v1/forms/{id}/knowledge/crawl` | 200 | 200/201/202 | schema-verified | pass | 1715 |
| `POST /v1/forms/{id}/knowledge/link` | 200 | 200/201 | schema-verified | pass | 1958 |
| `POST /v1/forms/{id}/knowledge/text` | 200 | 200/201 | schema-verified | pass | 1036 |
| `POST /v1/forms/{id}/knowledge/upload` | 200 | 200/201 | schema-verified | pass | 2833 |
| `POST /v1/forms/{id}/publish` | 200 | 200/201 | shape-asserted | pass | 224 |
| `POST /v1/forms/{id}/responses` | 201 | 200/201 | shape-asserted | pass | 236 |
| `POST /v1/forms/{id}/sessions` | 200 | 200/201 | schema-verified | pass | 4578 |
| `POST /v1/forms/{id}/unpublish` | 200 | 200/204 | unchecked | pass | 194 |
| `POST /v1/forms/{id}/versions/{version}/restore` | 200 | 200 | shape-asserted | pass | 347 |
| `POST /v1/responses/{id}/abandon` | 200 | 200/204 | unchecked | pass | 2385 |
| `POST /v1/responses/{id}/answers` | 200 | 200 | unchecked | pass | 250 |
| `POST /v1/responses/{id}/complete` | 200 | 200 | shape-asserted | pass | 1121 |
| `POST /v1/sessions/{sid}/actions` | 200 | 200/400/409 | unchecked | pass | 10774 |
| `POST /v1/sessions/{sid}/auth/google` | 400 | 400/401/403/409/422 | unchecked | negative-only | 158 |
| `POST /v1/sessions/{sid}/auth/phone/token` | 400 | 400/401/403/409/422 | unchecked | negative-only | 164 |
| `POST /v1/sessions/{sid}/messages` | 200 | 200/202 | unchecked | pass | 5897 |
| `POST /v1/sessions/{sid}/token/rotate` | 200 | 200 | unchecked | pass | 173 |
| `POST /v1/sessions/{sid}/uploads/intent` | 200 | 200/201 | schema-verified | pass | 197 |
| `POST /v1/sessions/{sid}/uploads/{fileId}/confirm` | 200 | 200/201 | schema-verified | pass | 4854 |
| `POST /v1/sessions/{sid}/verify/phone-token` | 400 | 400/401/403/409/422 | unchecked | negative-only | 162 |
| `POST /v1/templates/{slug}/use` | 200 | 200/201 | shape-asserted | pass | 220 |
| `POST /v1/webhooks` | 201 | 200/201 | shape-asserted | pass | 221 |
| `POST /v1/webhooks/{id}/deliveries/{deliveryId}/replay` | 200 | 200/201/202 | unchecked | pass | 1242 |
| `PUT /v1/forms/{id}/doc` | 200 | 200 | shape-asserted | pass | 221 |
| `PUT /v1/forms/{id}/integrations/spreadsheet` | 200 | 200/201/402 | schema-verified | pass | 306 |
| `PUT /v1/sessions/{sid}/uploads/{fileId}` | 200 | 200/201/204 | schema-verified | pass | 1202 |
