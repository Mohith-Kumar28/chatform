# API verification run `mubdohzv4jjc`

Target: `https://api.chatform.in` (production). 2026-09-21T15:10:17.640Z

## Coverage

| | |
| --- | --- |
| `/v1` operations in the spec | 69 |
| reached by this run | 69 |
| never reached | 0 |
| pass | 61 |
| fail | 2 |
| negative-only | 6 |
| skipped | 0 |

Response checking: **61** verified against a schema the spec declares, **0** against a hand-written expectation, **8** not checked.

Latency across 74 calls: p50 1652ms, p95 6081ms, max 8923ms.

## Failures

### `GET /v1/templates/{slug}`

Status 404, expected 200.
- expected 200, got 404 (not_found: Template not found)

### `POST /v1/templates/{slug}/use`

Status 404, expected 200/201.
- expected 200 or 201, got 404 (not_found: Template not found)

## Findings

### The form document has no published schema

Severity: high.

`POST /v1/forms`, `PUT /v1/forms/{id}/doc` declare their `doc` parameter as `{}` -- an empty schema, which accepts anything and describes nothing. No documentation page describes an ending, an ending rule or a condition either.

So the one artifact a developer must compose to build a form programmatically is the one thing the API does not describe. `GET /v1/blocks/{type}` publishes a full JSON Schema per block type and is genuinely good; the document *around* the blocks -- `endings`, `endingRules`, `logic`, `variables`, `settings` -- has nothing. The only way to learn it is to read back `GET /v1/templates/{slug}` and imitate it, or to guess against the linter.

Guessing against the linter is what this run did, and it took three rounds. Two of the linter's messages were excellent (it named the option id to use, and explained that an ending rule pinned to a question can never fire). The third, for an `endings[].requirements` entry given as a string rather than `{id, label, when}`, was `"Requirements: This is missing"` -- which never says what was expected.

### A form you just created is invisible through both documented read paths

Severity: high.

`POST /v1/forms` answers 201 with an id. Immediately afterwards:

- `GET /v1/forms/{id}` answers **404** `not_published` ("Form not found"), for a form that plainly exists.
- `GET /v1/forms` does **not** list it.

Both have explanations and neither is discoverable. `GET /v1/forms/{id}` returns the *published* config, and the working document is behind `?view=document` -- a parameter declared nowhere in `openapi.json` (the operation lists `id` as its only parameter) and mentioned on no documentation page. `GET /v1/forms` defaults to `status: "published"`, so a draft needs `?status=draft` or `?status=all`; the default is not stated on the reference page either.

`@chatformhq/js` is unaffected, because `forms.getDocument()` sends `view=document` -- so the SDK quietly knows something the API reference does not say. A developer following the reference, which is the audience `docs/quickstart.mdx` addresses first, creates a form and cannot find it.

## Every operation

| Operation | Status | Expected | Check | Outcome | ms |
| --- | --- | --- | --- | --- | --- |
| `DELETE /v1/forms/{id}` | 200 | 200/204 | schema-verified | pass | 1110 |
| `DELETE /v1/forms/{id}/integrations/spreadsheet` | 200 | 200/204/404 | schema-verified | pass | 1841 |
| `DELETE /v1/forms/{id}/knowledge/{sourceId}` | 200 | 200/204 | schema-verified | pass | 2564 |
| `DELETE /v1/responses/{id}/answers/{ref}` | 200 | 200/204 | schema-verified | pass | 1867 |
| `DELETE /v1/webhooks/{id}` | 200 | 200/204 | schema-verified | pass | 2905 |
| `GET /v1/blocks` | 200 | 200 | schema-verified | pass | 1179 |
| `GET /v1/blocks/{type}` | 200 | 200 | schema-verified | pass | 1008 |
| `GET /v1/chat/sessions/{sid}` | 200 | 200 | schema-verified | pass | 1527 |
| `GET /v1/chat/sessions/{sid}/events` | 200 | 200 | schema-verified | pass | 1126 |
| `GET /v1/events` | 200 | 200 | schema-verified | pass | 1113 |
| `GET /v1/exports` | 200 | 200 | schema-verified | pass | 927 |
| `GET /v1/exports/{id}` | 200 | 200 | schema-verified | pass | 927 |
| `GET /v1/files/{id}` | 200 | 200 | schema-verified | pass | 920 |
| `GET /v1/forms` | 200 | 200 | schema-verified | pass | 1209 |
| `GET /v1/forms/{id}` | 200 | 200 | schema-verified | pass | 1209 |
| `GET /v1/forms/{id}/analytics` | 200 | 200 | schema-verified | pass | 1158 |
| `GET /v1/forms/{id}/followup-analytics` | 200 | 200 | schema-verified | pass | 1060 |
| `GET /v1/forms/{id}/integrations` | 200 | 200 | schema-verified | pass | 1346 |
| `GET /v1/forms/{id}/knowledge` | 200 | 200 | schema-verified | pass | 1222 |
| `GET /v1/forms/{id}/responses` | 200 | 200 | schema-verified | pass | 1368 |
| `GET /v1/forms/{id}/versions` | 200 | 200 | schema-verified | pass | 1534 |
| `GET /v1/forms/{id}/versions/{version}` | 200 | 200 | schema-verified | pass | 2441 |
| `GET /v1/me` | 200 | 200 | schema-verified | pass | 4881 |
| `GET /v1/responses/{id}` | 200 | 200 | schema-verified | pass | 1563 |
| `GET /v1/responses/{id}/next` | 200 | 200 | schema-verified | pass | 1204 |
| `GET /v1/sessions/{sid}` | 200 | 200 | schema-verified | pass | 1892 |
| `GET /v1/sessions/{sid}/events` | 200 | 200 | schema-verified | pass | 1363 |
| `GET /v1/templates` | 200 | 200 | schema-verified | pass | 1198 |
| `GET /v1/templates/{slug}` | 404 | 200 | unchecked | **fail** | 2865 |
| `GET /v1/webhooks` | 200 | 200 | schema-verified | pass | 1020 |
| `GET /v1/webhooks/{id}/deliveries` | 200 | 200 | schema-verified | pass | 1045 |
| `POST /v1/ai/clarify-form` | 200 | 200 | schema-verified | pass | 3140 |
| `POST /v1/ai/edit-form` | 200 | 200/422 | schema-verified | pass | 8188 |
| `POST /v1/ai/generate-form` | 200 | 200 | schema-verified | pass | 8923 |
| `POST /v1/chat/sessions/{sid}/actions` | 200 | 200/400/409 | schema-verified | pass | 5370 |
| `POST /v1/chat/sessions/{sid}/auth/google` | 400 | 400/401/403/409/422 | unchecked | negative-only | 1048 |
| `POST /v1/chat/sessions/{sid}/auth/phone/token` | 400 | 400/401/403/409/422 | unchecked | negative-only | 1435 |
| `POST /v1/chat/sessions/{sid}/messages` | 200 | 200/202 | schema-verified | pass | 5868 |
| `POST /v1/chat/sessions/{sid}/token/rotate` | 200 | 200 | schema-verified | pass | 1203 |
| `POST /v1/chat/sessions/{sid}/verify/phone-token` | 400 | 400/401/403/409/422 | unchecked | negative-only | 1090 |
| `POST /v1/forms` | 201 | 200/201 | schema-verified | pass | 2253 |
| `POST /v1/forms/{id}/chat/sessions` | 200 | 200/201 | schema-verified | pass | 4838 |
| `POST /v1/forms/{id}/exports` | 202 | 200/201/202 | schema-verified | pass | 1652 |
| `POST /v1/forms/{id}/knowledge/crawl` | 200 | 200/201/202 | schema-verified | pass | 3138 |
| `POST /v1/forms/{id}/knowledge/link` | 200 | 200/201 | schema-verified | pass | 2433 |
| `POST /v1/forms/{id}/knowledge/text` | 200 | 200/201 | schema-verified | pass | 1996 |
| `POST /v1/forms/{id}/knowledge/upload` | 200 | 200/201 | schema-verified | pass | 2600 |
| `POST /v1/forms/{id}/publish` | 200 | 200/201 | schema-verified | pass | 3197 |
| `POST /v1/forms/{id}/responses` | 201 | 200/201 | schema-verified | pass | 2085 |
| `POST /v1/forms/{id}/sessions` | 200 | 200/201 | schema-verified | pass | 6357 |
| `POST /v1/forms/{id}/unpublish` | 200 | 200/204 | schema-verified | pass | 1489 |
| `POST /v1/forms/{id}/versions/{version}/restore` | 200 | 200 | schema-verified | pass | 1695 |
| `POST /v1/responses/{id}/abandon` | 200 | 200/204 | schema-verified | pass | 2140 |
| `POST /v1/responses/{id}/answers` | 200 | 200 | schema-verified | pass | 2246 |
| `POST /v1/responses/{id}/complete` | 200 | 200 | schema-verified | pass | 4220 |
| `POST /v1/sessions/{sid}/actions` | 200 | 200/400/409 | schema-verified | pass | 6081 |
| `POST /v1/sessions/{sid}/auth/google` | 400 | 400/401/403/409/422 | unchecked | negative-only | 2127 |
| `POST /v1/sessions/{sid}/auth/phone/token` | 400 | 400/401/403/409/422 | unchecked | negative-only | 1192 |
| `POST /v1/sessions/{sid}/messages` | 200 | 200/202 | schema-verified | pass | 6442 |
| `POST /v1/sessions/{sid}/token/rotate` | 200 | 200 | schema-verified | pass | 1374 |
| `POST /v1/sessions/{sid}/uploads/intent` | 200 | 200/201 | schema-verified | pass | 1348 |
| `POST /v1/sessions/{sid}/uploads/{fileId}/confirm` | 200 | 200/201 | schema-verified | pass | 3821 |
| `POST /v1/sessions/{sid}/verify/phone-token` | 400 | 400/401/403/409/422 | unchecked | negative-only | 1184 |
| `POST /v1/templates/{slug}/use` | 404 | 200/201 | unchecked | **fail** | 1564 |
| `POST /v1/webhooks` | 201 | 200/201 | schema-verified | pass | 1364 |
| `POST /v1/webhooks/{id}/deliveries/{deliveryId}/replay` | 200 | 200/201/202 | schema-verified | pass | 1044 |
| `PUT /v1/forms/{id}/doc` | 200 | 200 | schema-verified | pass | 2669 |
| `PUT /v1/forms/{id}/integrations/spreadsheet` | 200 | 200/201/402 | schema-verified | pass | 3266 |
| `PUT /v1/sessions/{sid}/uploads/{fileId}` | 200 | 200/201/204 | schema-verified | pass | 1868 |
