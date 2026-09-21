# API verification run `mubbyav699yb`

Target: `https://api.chatform.in` (production). 2026-09-21T14:20:36.622Z

## Coverage

| | |
| --- | --- |
| `/v1` operations in the spec | 69 |
| reached by this run | 69 |
| never reached | 0 |
| pass | 60 |
| fail | 0 |
| negative-only | 6 |
| skipped | 3 |

Response checking: **20** verified against a schema the spec declares, **19** against a hand-written expectation, **30** not checked.

Latency across 72 calls: p50 1344ms, p95 5752ms, max 7810ms.

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
| `DELETE /v1/forms/{id}` | 200 | 200/204 | unchecked | pass | 162 |
| `DELETE /v1/forms/{id}/integrations/spreadsheet` | 200 | 200/204/404 | unchecked | pass | 1177 |
| `DELETE /v1/forms/{id}/knowledge/{sourceId}` | 200 | 200/204 | schema-verified | pass | 1999 |
| `DELETE /v1/responses/{id}/answers/{ref}` | 200 | 200/204 | unchecked | pass | 1550 |
| `DELETE /v1/webhooks/{id}` | 200 | 200/204 | unchecked | pass | 175 |
| `GET /v1/blocks` | 200 | 200 | shape-asserted | pass | 911 |
| `GET /v1/blocks/{type}` | 200 | 200 | shape-asserted | pass | 784 |
| `GET /v1/chat/sessions/{sid}` | 200 | 200 | unchecked | pass | 431 |
| `GET /v1/chat/sessions/{sid}/events` | 200 | 200 | unchecked | pass | 335 |
| `GET /v1/events` | 200 | 200 | shape-asserted | pass | 801 |
| `GET /v1/exports` | 200 | 200 | unchecked | pass | 159 |
| `GET /v1/exports/{id}` | 200 | 200 | schema-verified | pass | 210 |
| `GET /v1/files/{id}` | 200 | 200 | schema-verified | pass | 164 |
| `GET /v1/forms` | 200 | 200 | shape-asserted | pass | 970 |
| `GET /v1/forms/{id}` | 200 | 200 | shape-asserted | pass | 938 |
| `GET /v1/forms/{id}/analytics` | 200 | 200 | shape-asserted | pass | 442 |
| `GET /v1/forms/{id}/followup-analytics` | 200 | 200 | shape-asserted | pass | 244 |
| `GET /v1/forms/{id}/integrations` | 200 | 200 | schema-verified | pass | 1163 |
| `GET /v1/forms/{id}/knowledge` | 200 | 200 | schema-verified | pass | 944 |
| `GET /v1/forms/{id}/responses` | 200 | 200 | shape-asserted | pass | 1374 |
| `GET /v1/forms/{id}/versions` | 200 | 200 | schema-verified | pass | 1286 |
| `GET /v1/forms/{id}/versions/{version}` | 200 | 200 | shape-asserted | pass | 1258 |
| `GET /v1/me` | 200 | 200 | shape-asserted | pass | 2110 |
| `GET /v1/responses/{id}` | 200 | 200 | shape-asserted | pass | 1348 |
| `GET /v1/responses/{id}/next` | 200 | 200 | unchecked | pass | 1344 |
| `GET /v1/sessions/{sid}` | 200 | 200 | unchecked | pass | 1390 |
| `GET /v1/sessions/{sid}/events` | 200 | 200 | unchecked | pass | 1085 |
| `GET /v1/templates` | 200 | 200 | schema-verified | pass | 954 |
| `GET /v1/templates/{slug}` | 200 | 200 | schema-verified | pass | 1224 |
| `GET /v1/webhooks` | 200 | 200 | schema-verified | pass | 1031 |
| `GET /v1/webhooks/{id}/deliveries` | 200 | 200 | unchecked | pass | 186 |
| `POST /v1/ai/clarify-form` | 0 | - | unchecked | skipped | 0 |
| `POST /v1/ai/edit-form` | 0 | - | unchecked | skipped | 0 |
| `POST /v1/ai/generate-form` | 0 | - | unchecked | skipped | 0 |
| `POST /v1/chat/sessions/{sid}/actions` | 200 | 200/400/409 | unchecked | pass | 5123 |
| `POST /v1/chat/sessions/{sid}/auth/google` | 400 | 400/401/403/409/422 | unchecked | negative-only | 198 |
| `POST /v1/chat/sessions/{sid}/auth/phone/token` | 400 | 400/401/403/409/422 | unchecked | negative-only | 2090 |
| `POST /v1/chat/sessions/{sid}/messages` | 200 | 200/202 | unchecked | pass | 7810 |
| `POST /v1/chat/sessions/{sid}/token/rotate` | 200 | 200 | unchecked | pass | 208 |
| `POST /v1/chat/sessions/{sid}/verify/phone-token` | 400 | 400/401/403/409/422 | unchecked | negative-only | 189 |
| `POST /v1/forms` | 201 | 200/201 | shape-asserted | pass | 1125 |
| `POST /v1/forms/{id}/chat/sessions` | 200 | 200/201 | schema-verified | pass | 5752 |
| `POST /v1/forms/{id}/exports` | 202 | 200/201/202 | schema-verified | pass | 2565 |
| `POST /v1/forms/{id}/knowledge/crawl` | 200 | 200/201/202 | schema-verified | pass | 2625 |
| `POST /v1/forms/{id}/knowledge/link` | 200 | 200/201 | schema-verified | pass | 1704 |
| `POST /v1/forms/{id}/knowledge/text` | 200 | 200/201 | schema-verified | pass | 1444 |
| `POST /v1/forms/{id}/knowledge/upload` | 200 | 200/201 | schema-verified | pass | 2874 |
| `POST /v1/forms/{id}/publish` | 200 | 200/201 | shape-asserted | pass | 1692 |
| `POST /v1/forms/{id}/responses` | 201 | 200/201 | shape-asserted | pass | 1972 |
| `POST /v1/forms/{id}/sessions` | 200 | 200/201 | schema-verified | pass | 6614 |
| `POST /v1/forms/{id}/unpublish` | 200 | 200/204 | unchecked | pass | 1220 |
| `POST /v1/forms/{id}/versions/{version}/restore` | 200 | 200 | shape-asserted | pass | 1406 |
| `POST /v1/responses/{id}/abandon` | 200 | 200/204 | unchecked | pass | 2267 |
| `POST /v1/responses/{id}/answers` | 200 | 200 | unchecked | pass | 2192 |
| `POST /v1/responses/{id}/complete` | 200 | 200 | shape-asserted | pass | 3214 |
| `POST /v1/sessions/{sid}/actions` | 200 | 200/400/409 | unchecked | pass | 6699 |
| `POST /v1/sessions/{sid}/auth/google` | 400 | 400/401/403/409/422 | unchecked | negative-only | 1137 |
| `POST /v1/sessions/{sid}/auth/phone/token` | 400 | 400/401/403/409/422 | unchecked | negative-only | 2050 |
| `POST /v1/sessions/{sid}/messages` | 200 | 200/202 | unchecked | pass | 6823 |
| `POST /v1/sessions/{sid}/token/rotate` | 200 | 200 | unchecked | pass | 1303 |
| `POST /v1/sessions/{sid}/uploads/intent` | 200 | 200/201 | schema-verified | pass | 1729 |
| `POST /v1/sessions/{sid}/uploads/{fileId}/confirm` | 200 | 200/201 | schema-verified | pass | 2538 |
| `POST /v1/sessions/{sid}/verify/phone-token` | 400 | 400/401/403/409/422 | unchecked | negative-only | 1076 |
| `POST /v1/templates/{slug}/use` | 200 | 200/201 | shape-asserted | pass | 1401 |
| `POST /v1/webhooks` | 201 | 200/201 | shape-asserted | pass | 1097 |
| `POST /v1/webhooks/{id}/deliveries/{deliveryId}/replay` | 200 | 200/201/202 | unchecked | pass | 1418 |
| `PUT /v1/forms/{id}/doc` | 200 | 200 | shape-asserted | pass | 2808 |
| `PUT /v1/forms/{id}/integrations/spreadsheet` | 200 | 200/201/402 | schema-verified | pass | 1397 |
| `PUT /v1/sessions/{sid}/uploads/{fileId}` | 200 | 200/201/204 | schema-verified | pass | 1312 |
