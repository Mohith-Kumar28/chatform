# API verification run `mubekzacgai4`

Target: `https://api.chatform.in` (production). 2026-09-21T15:35:08.211Z

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

Response checking: **63** verified against a schema the spec declares, **0** against a hand-written expectation, **6** not checked.

Latency across 75 calls: p50 1393ms, p95 5154ms, max 7291ms.

## Findings

### The form document has no published schema

Severity: high.

`POST /v1/forms`, `PUT /v1/forms/{id}/doc` declare their `doc` parameter as `{}` -- an empty schema, which accepts anything and describes nothing. No documentation page describes an ending, an ending rule or a condition either.

So the one artifact a developer must compose to build a form programmatically is the one thing the API does not describe. `GET /v1/blocks/{type}` publishes a full JSON Schema per block type and is genuinely good; the document *around* the blocks -- `endings`, `endingRules`, `logic`, `variables`, `settings` -- has nothing. The only way to learn it is to read back `GET /v1/templates/{slug}` and imitate it, or to guess against the linter.

Guessing against the linter is what this run did, and it took three rounds. Two of the linter's messages were excellent (it named the option id to use, and explained that an ending rule pinned to a question can never fire). The third, for an `endings[].requirements` entry given as a string rather than `{id, label, when}`, was `"Requirements: This is missing"` -- which never says what was expected.

## Every operation

| Operation | Status | Expected | Check | Outcome | ms |
| --- | --- | --- | --- | --- | --- |
| `DELETE /v1/forms/{id}` | 200 | 200/204 | schema-verified | pass | 982 |
| `DELETE /v1/forms/{id}/integrations/spreadsheet` | 200 | 200/204/404 | schema-verified | pass | 1068 |
| `DELETE /v1/forms/{id}/knowledge/{sourceId}` | 200 | 200/204 | schema-verified | pass | 2229 |
| `DELETE /v1/responses/{id}/answers/{ref}` | 200 | 200/204 | schema-verified | pass | 1537 |
| `DELETE /v1/webhooks/{id}` | 200 | 200/204 | schema-verified | pass | 1189 |
| `GET /v1/blocks` | 200 | 200 | schema-verified | pass | 1070 |
| `GET /v1/blocks/{type}` | 200 | 200 | schema-verified | pass | 841 |
| `GET /v1/chat/sessions/{sid}` | 200 | 200 | schema-verified | pass | 1584 |
| `GET /v1/chat/sessions/{sid}/events` | 200 | 200 | schema-verified | pass | 1121 |
| `GET /v1/events` | 200 | 200 | schema-verified | pass | 890 |
| `GET /v1/exports` | 200 | 200 | schema-verified | pass | 923 |
| `GET /v1/exports/{id}` | 200 | 200 | schema-verified | pass | 996 |
| `GET /v1/files/{id}` | 200 | 200 | schema-verified | pass | 955 |
| `GET /v1/forms` | 200 | 200 | schema-verified | pass | 968 |
| `GET /v1/forms/{id}` | 200 | 200 | schema-verified | pass | 1020 |
| `GET /v1/forms/{id}/analytics` | 200 | 200 | schema-verified | pass | 1079 |
| `GET /v1/forms/{id}/followup-analytics` | 200 | 200 | schema-verified | pass | 1145 |
| `GET /v1/forms/{id}/integrations` | 200 | 200 | schema-verified | pass | 1065 |
| `GET /v1/forms/{id}/knowledge` | 200 | 200 | schema-verified | pass | 915 |
| `GET /v1/forms/{id}/responses` | 200 | 200 | schema-verified | pass | 2139 |
| `GET /v1/forms/{id}/versions` | 200 | 200 | schema-verified | pass | 1233 |
| `GET /v1/forms/{id}/versions/{version}` | 200 | 200 | schema-verified | pass | 1244 |
| `GET /v1/me` | 200 | 200 | schema-verified | pass | 3074 |
| `GET /v1/responses/{id}` | 200 | 200 | schema-verified | pass | 1350 |
| `GET /v1/responses/{id}/next` | 200 | 200 | schema-verified | pass | 1393 |
| `GET /v1/sessions/{sid}` | 200 | 200 | schema-verified | pass | 1338 |
| `GET /v1/sessions/{sid}/events` | 200 | 200 | schema-verified | pass | 1011 |
| `GET /v1/templates` | 200 | 200 | schema-verified | pass | 938 |
| `GET /v1/templates/{slug}` | 200 | 200 | schema-verified | pass | 939 |
| `GET /v1/webhooks` | 200 | 200 | schema-verified | pass | 1077 |
| `GET /v1/webhooks/{id}/deliveries` | 200 | 200 | schema-verified | pass | 1068 |
| `POST /v1/ai/clarify-form` | 200 | 200 | schema-verified | pass | 3325 |
| `POST /v1/ai/edit-form` | 200 | 200/422 | schema-verified | pass | 4218 |
| `POST /v1/ai/generate-form` | 200 | 200 | schema-verified | pass | 5653 |
| `POST /v1/chat/sessions/{sid}/actions` | 200 | 200/400/409 | schema-verified | pass | 6128 |
| `POST /v1/chat/sessions/{sid}/auth/google` | 400 | 400/401/403/409/422 | unchecked | negative-only | 1086 |
| `POST /v1/chat/sessions/{sid}/auth/phone/token` | 400 | 400/401/403/409/422 | unchecked | negative-only | 2110 |
| `POST /v1/chat/sessions/{sid}/messages` | 200 | 200/202 | schema-verified | pass | 7291 |
| `POST /v1/chat/sessions/{sid}/token/rotate` | 200 | 200 | schema-verified | pass | 1297 |
| `POST /v1/chat/sessions/{sid}/verify/phone-token` | 400 | 400/401/403/409/422 | unchecked | negative-only | 1075 |
| `POST /v1/forms` | 201 | 200/201 | schema-verified | pass | 1115 |
| `POST /v1/forms/{id}/chat/sessions` | 200 | 200/201 | schema-verified | pass | 5154 |
| `POST /v1/forms/{id}/exports` | 202 | 200/201/202 | schema-verified | pass | 1632 |
| `POST /v1/forms/{id}/knowledge/crawl` | 200 | 200/201/202 | schema-verified | pass | 4731 |
| `POST /v1/forms/{id}/knowledge/link` | 200 | 200/201 | schema-verified | pass | 2308 |
| `POST /v1/forms/{id}/knowledge/text` | 200 | 200/201 | schema-verified | pass | 1479 |
| `POST /v1/forms/{id}/knowledge/upload` | 200 | 200/201 | schema-verified | pass | 3615 |
| `POST /v1/forms/{id}/publish` | 200 | 200/201 | schema-verified | pass | 2041 |
| `POST /v1/forms/{id}/responses` | 201 | 200/201 | schema-verified | pass | 2108 |
| `POST /v1/forms/{id}/sessions` | 200 | 200/201 | schema-verified | pass | 4776 |
| `POST /v1/forms/{id}/unpublish` | 200 | 200/204 | schema-verified | pass | 1268 |
| `POST /v1/forms/{id}/versions/{version}/restore` | 200 | 200 | schema-verified | pass | 1409 |
| `POST /v1/responses/{id}/abandon` | 200 | 200/204 | schema-verified | pass | 4196 |
| `POST /v1/responses/{id}/answers` | 200 | 200 | schema-verified | pass | 1830 |
| `POST /v1/responses/{id}/complete` | 200 | 200 | schema-verified | pass | 2387 |
| `POST /v1/sessions/{sid}/actions` | 200 | 200/400/409 | schema-verified | pass | 5065 |
| `POST /v1/sessions/{sid}/auth/google` | 400 | 400/401/403/409/422 | unchecked | negative-only | 996 |
| `POST /v1/sessions/{sid}/auth/phone/token` | 400 | 400/401/403/409/422 | unchecked | negative-only | 2555 |
| `POST /v1/sessions/{sid}/messages` | 200 | 200/202 | schema-verified | pass | 6578 |
| `POST /v1/sessions/{sid}/token/rotate` | 200 | 200 | schema-verified | pass | 1162 |
| `POST /v1/sessions/{sid}/uploads/intent` | 200 | 200/201 | schema-verified | pass | 1520 |
| `POST /v1/sessions/{sid}/uploads/{fileId}/confirm` | 200 | 200/201 | schema-verified | pass | 2256 |
| `POST /v1/sessions/{sid}/verify/phone-token` | 400 | 400/401/403/409/422 | unchecked | negative-only | 1120 |
| `POST /v1/templates/{slug}/use` | 200 | 200/201 | schema-verified | pass | 1391 |
| `POST /v1/webhooks` | 201 | 200/201 | schema-verified | pass | 1061 |
| `POST /v1/webhooks/{id}/deliveries/{deliveryId}/replay` | 200 | 200/201/202 | schema-verified | pass | 1185 |
| `PUT /v1/forms/{id}/doc` | 200 | 200 | schema-verified | pass | 2631 |
| `PUT /v1/forms/{id}/integrations/spreadsheet` | 200 | 200/201/402 | schema-verified | pass | 1468 |
| `PUT /v1/sessions/{sid}/uploads/{fileId}` | 200 | 200/201/204 | schema-verified | pass | 3683 |
