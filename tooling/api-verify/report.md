# API verification run `mube849nl8k7`

Target: `https://api.chatform.in` (production). 2026-09-21T15:24:58.108Z

## Coverage

| | |
| --- | --- |
| `/v1` operations in the spec | 69 |
| reached by this run | 69 |
| never reached | 0 |
| pass | 62 |
| fail | 1 |
| negative-only | 6 |
| skipped | 0 |

Response checking: **63** verified against a schema the spec declares, **0** against a hand-written expectation, **6** not checked.

Latency across 75 calls: p50 1372ms, p95 5775ms, max 8268ms.

## Failures

### `POST /v1/templates/{slug}/use`

Status 200, expected 200/201.
- $.status: required by the spec, absent from the response
- $.published: required by the spec, absent from the response
- $.created_at: required by the spec, absent from the response
- $.updated_at: required by the spec, absent from the response

## Findings

### The form document has no published schema

Severity: high.

`POST /v1/forms`, `PUT /v1/forms/{id}/doc` declare their `doc` parameter as `{}` -- an empty schema, which accepts anything and describes nothing. No documentation page describes an ending, an ending rule or a condition either.

So the one artifact a developer must compose to build a form programmatically is the one thing the API does not describe. `GET /v1/blocks/{type}` publishes a full JSON Schema per block type and is genuinely good; the document *around* the blocks -- `endings`, `endingRules`, `logic`, `variables`, `settings` -- has nothing. The only way to learn it is to read back `GET /v1/templates/{slug}` and imitate it, or to guess against the linter.

Guessing against the linter is what this run did, and it took three rounds. Two of the linter's messages were excellent (it named the option id to use, and explained that an ending rule pinned to a question can never fire). The third, for an `endings[].requirements` entry given as a string rather than `{id, label, when}`, was `"Requirements: This is missing"` -- which never says what was expected.

## Every operation

| Operation | Status | Expected | Check | Outcome | ms |
| --- | --- | --- | --- | --- | --- |
| `DELETE /v1/forms/{id}` | 200 | 200/204 | schema-verified | pass | 942 |
| `DELETE /v1/forms/{id}/integrations/spreadsheet` | 200 | 200/204/404 | schema-verified | pass | 1080 |
| `DELETE /v1/forms/{id}/knowledge/{sourceId}` | 200 | 200/204 | schema-verified | pass | 2121 |
| `DELETE /v1/responses/{id}/answers/{ref}` | 200 | 200/204 | schema-verified | pass | 1548 |
| `DELETE /v1/webhooks/{id}` | 200 | 200/204 | schema-verified | pass | 1360 |
| `GET /v1/blocks` | 200 | 200 | schema-verified | pass | 1117 |
| `GET /v1/blocks/{type}` | 200 | 200 | schema-verified | pass | 791 |
| `GET /v1/chat/sessions/{sid}` | 200 | 200 | schema-verified | pass | 1577 |
| `GET /v1/chat/sessions/{sid}/events` | 200 | 200 | schema-verified | pass | 1121 |
| `GET /v1/events` | 200 | 200 | schema-verified | pass | 793 |
| `GET /v1/exports` | 200 | 200 | schema-verified | pass | 965 |
| `GET /v1/exports/{id}` | 200 | 200 | schema-verified | pass | 942 |
| `GET /v1/files/{id}` | 200 | 200 | schema-verified | pass | 937 |
| `GET /v1/forms` | 200 | 200 | schema-verified | pass | 931 |
| `GET /v1/forms/{id}` | 200 | 200 | schema-verified | pass | 942 |
| `GET /v1/forms/{id}/analytics` | 200 | 200 | schema-verified | pass | 1134 |
| `GET /v1/forms/{id}/followup-analytics` | 200 | 200 | schema-verified | pass | 1102 |
| `GET /v1/forms/{id}/integrations` | 200 | 200 | schema-verified | pass | 1086 |
| `GET /v1/forms/{id}/knowledge` | 200 | 200 | schema-verified | pass | 965 |
| `GET /v1/forms/{id}/responses` | 200 | 200 | schema-verified | pass | 1094 |
| `GET /v1/forms/{id}/versions` | 200 | 200 | schema-verified | pass | 1372 |
| `GET /v1/forms/{id}/versions/{version}` | 200 | 200 | schema-verified | pass | 1301 |
| `GET /v1/me` | 200 | 200 | schema-verified | pass | 1310 |
| `GET /v1/responses/{id}` | 200 | 200 | schema-verified | pass | 1248 |
| `GET /v1/responses/{id}/next` | 200 | 200 | schema-verified | pass | 1395 |
| `GET /v1/sessions/{sid}` | 200 | 200 | schema-verified | pass | 1606 |
| `GET /v1/sessions/{sid}/events` | 200 | 200 | schema-verified | pass | 974 |
| `GET /v1/templates` | 200 | 200 | schema-verified | pass | 949 |
| `GET /v1/templates/{slug}` | 200 | 200 | schema-verified | pass | 1155 |
| `GET /v1/webhooks` | 200 | 200 | schema-verified | pass | 1051 |
| `GET /v1/webhooks/{id}/deliveries` | 200 | 200 | schema-verified | pass | 1118 |
| `POST /v1/ai/clarify-form` | 200 | 200 | schema-verified | pass | 2587 |
| `POST /v1/ai/edit-form` | 200 | 200/422 | schema-verified | pass | 3817 |
| `POST /v1/ai/generate-form` | 200 | 200 | schema-verified | pass | 5775 |
| `POST /v1/chat/sessions/{sid}/actions` | 200 | 200/400/409 | schema-verified | pass | 6986 |
| `POST /v1/chat/sessions/{sid}/auth/google` | 400 | 400/401/403/409/422 | unchecked | negative-only | 1088 |
| `POST /v1/chat/sessions/{sid}/auth/phone/token` | 400 | 400/401/403/409/422 | unchecked | negative-only | 2400 |
| `POST /v1/chat/sessions/{sid}/messages` | 200 | 200/202 | schema-verified | pass | 8268 |
| `POST /v1/chat/sessions/{sid}/token/rotate` | 200 | 200 | schema-verified | pass | 1261 |
| `POST /v1/chat/sessions/{sid}/verify/phone-token` | 400 | 400/401/403/409/422 | unchecked | negative-only | 1122 |
| `POST /v1/forms` | 201 | 200/201 | schema-verified | pass | 1102 |
| `POST /v1/forms/{id}/chat/sessions` | 200 | 200/201 | schema-verified | pass | 5517 |
| `POST /v1/forms/{id}/exports` | 202 | 200/201/202 | schema-verified | pass | 1847 |
| `POST /v1/forms/{id}/knowledge/crawl` | 200 | 200/201/202 | schema-verified | pass | 3166 |
| `POST /v1/forms/{id}/knowledge/link` | 200 | 200/201 | schema-verified | pass | 1645 |
| `POST /v1/forms/{id}/knowledge/text` | 200 | 200/201 | schema-verified | pass | 1437 |
| `POST /v1/forms/{id}/knowledge/upload` | 200 | 200/201 | schema-verified | pass | 2315 |
| `POST /v1/forms/{id}/publish` | 200 | 200/201 | schema-verified | pass | 2001 |
| `POST /v1/forms/{id}/responses` | 201 | 200/201 | schema-verified | pass | 2086 |
| `POST /v1/forms/{id}/sessions` | 200 | 200/201 | schema-verified | pass | 5717 |
| `POST /v1/forms/{id}/unpublish` | 200 | 200/204 | schema-verified | pass | 1250 |
| `POST /v1/forms/{id}/versions/{version}/restore` | 200 | 200 | schema-verified | pass | 1588 |
| `POST /v1/responses/{id}/abandon` | 200 | 200/204 | schema-verified | pass | 2421 |
| `POST /v1/responses/{id}/answers` | 200 | 200 | schema-verified | pass | 1875 |
| `POST /v1/responses/{id}/complete` | 200 | 200 | schema-verified | pass | 2386 |
| `POST /v1/sessions/{sid}/actions` | 200 | 200/400/409 | schema-verified | pass | 6555 |
| `POST /v1/sessions/{sid}/auth/google` | 400 | 400/401/403/409/422 | unchecked | negative-only | 1001 |
| `POST /v1/sessions/{sid}/auth/phone/token` | 400 | 400/401/403/409/422 | unchecked | negative-only | 2530 |
| `POST /v1/sessions/{sid}/messages` | 200 | 200/202 | schema-verified | pass | 7849 |
| `POST /v1/sessions/{sid}/token/rotate` | 200 | 200 | schema-verified | pass | 1094 |
| `POST /v1/sessions/{sid}/uploads/intent` | 200 | 200/201 | schema-verified | pass | 1565 |
| `POST /v1/sessions/{sid}/uploads/{fileId}/confirm` | 200 | 200/201 | schema-verified | pass | 2582 |
| `POST /v1/sessions/{sid}/verify/phone-token` | 400 | 400/401/403/409/422 | unchecked | negative-only | 1275 |
| `POST /v1/templates/{slug}/use` | 200 | 200/201 | schema-verified | **fail** | 1435 |
| `POST /v1/webhooks` | 201 | 200/201 | schema-verified | pass | 1095 |
| `POST /v1/webhooks/{id}/deliveries/{deliveryId}/replay` | 200 | 200/201/202 | schema-verified | pass | 1050 |
| `PUT /v1/forms/{id}/doc` | 200 | 200 | schema-verified | pass | 1821 |
| `PUT /v1/forms/{id}/integrations/spreadsheet` | 200 | 200/201/402 | schema-verified | pass | 1236 |
| `PUT /v1/sessions/{sid}/uploads/{fileId}` | 200 | 200/201/204 | schema-verified | pass | 3080 |
