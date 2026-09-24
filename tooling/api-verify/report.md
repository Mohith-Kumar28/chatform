# API verification run `mubt6lbklrkm`

Target: `https://api.chatform.in` (production). 2026-09-21T22:21:46.754Z

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

Latency across 75 calls: p50 161ms, p95 4468ms, max 8491ms.

## Findings

### The form document has no published schema

Severity: high.

`POST /v1/forms`, `PUT /v1/forms/{id}/doc` declare their `doc` parameter as `{}` -- an empty schema, which accepts anything and describes nothing. No documentation page describes an ending, an ending rule or a condition either.

So the one artifact a developer must compose to build a form programmatically is the one thing the API does not describe. `GET /v1/blocks/{type}` publishes a full JSON Schema per block type and is genuinely good; the document *around* the blocks -- `endings`, `endingRules`, `logic`, `variables`, `settings` -- has nothing. The only way to learn it is to read back `GET /v1/templates/{slug}` and imitate it, or to guess against the linter.

Guessing against the linter is what this run did, and it took three rounds. Two of the linter's messages were excellent (it named the option id to use, and explained that an ending rule pinned to a question can never fire). The third, for an `endings[].requirements` entry given as a string rather than `{id, label, when}`, was `"Requirements: This is missing"` -- which never says what was expected.

## Every operation

| Operation | Status | Expected | Check | Outcome | ms |
| --- | --- | --- | --- | --- | --- |
| `DELETE /v1/forms/{id}` | 200 | 200/204 | schema-verified | pass | 97 |
| `DELETE /v1/forms/{id}/integrations/spreadsheet` | 200 | 200/204/404 | schema-verified | pass | 135 |
| `DELETE /v1/forms/{id}/knowledge/{sourceId}` | 200 | 200/204 | schema-verified | pass | 214 |
| `DELETE /v1/responses/{id}/answers/{ref}` | 200 | 200/204 | schema-verified | pass | 157 |
| `DELETE /v1/webhooks/{id}` | 200 | 200/204 | schema-verified | pass | 193 |
| `GET /v1/blocks` | 200 | 200 | schema-verified | pass | 183 |
| `GET /v1/blocks/{type}` | 200 | 200 | schema-verified | pass | 128 |
| `GET /v1/chat/sessions/{sid}` | 200 | 200 | schema-verified | pass | 159 |
| `GET /v1/chat/sessions/{sid}/events` | 200 | 200 | schema-verified | pass | 139 |
| `GET /v1/events` | 200 | 200 | schema-verified | pass | 122 |
| `GET /v1/exports` | 200 | 200 | schema-verified | pass | 127 |
| `GET /v1/exports/{id}` | 200 | 200 | schema-verified | pass | 127 |
| `GET /v1/files/{id}` | 200 | 200 | schema-verified | pass | 132 |
| `GET /v1/forms` | 200 | 200 | schema-verified | pass | 127 |
| `GET /v1/forms/{id}` | 200 | 200 | schema-verified | pass | 163 |
| `GET /v1/forms/{id}/analytics` | 200 | 200 | schema-verified | pass | 134 |
| `GET /v1/forms/{id}/followup-analytics` | 200 | 200 | schema-verified | pass | 135 |
| `GET /v1/forms/{id}/integrations` | 200 | 200 | schema-verified | pass | 131 |
| `GET /v1/forms/{id}/knowledge` | 200 | 200 | schema-verified | pass | 128 |
| `GET /v1/forms/{id}/responses` | 200 | 200 | schema-verified | pass | 135 |
| `GET /v1/forms/{id}/versions` | 200 | 200 | schema-verified | pass | 141 |
| `GET /v1/forms/{id}/versions/{version}` | 200 | 200 | schema-verified | pass | 164 |
| `GET /v1/me` | 200 | 200 | schema-verified | pass | 1697 |
| `GET /v1/responses/{id}` | 200 | 200 | schema-verified | pass | 138 |
| `GET /v1/responses/{id}/next` | 200 | 200 | schema-verified | pass | 1307 |
| `GET /v1/sessions/{sid}` | 200 | 200 | schema-verified | pass | 145 |
| `GET /v1/sessions/{sid}/events` | 200 | 200 | schema-verified | pass | 135 |
| `GET /v1/templates` | 200 | 200 | schema-verified | pass | 199 |
| `GET /v1/templates/{slug}` | 200 | 200 | schema-verified | pass | 130 |
| `GET /v1/webhooks` | 200 | 200 | schema-verified | pass | 124 |
| `GET /v1/webhooks/{id}/deliveries` | 200 | 200 | schema-verified | pass | 135 |
| `POST /v1/ai/clarify-form` | 200 | 200 | schema-verified | pass | 4070 |
| `POST /v1/ai/edit-form` | 200 | 200/422 | schema-verified | pass | 4468 |
| `POST /v1/ai/generate-form` | 200 | 200 | schema-verified | pass | 8491 |
| `POST /v1/chat/sessions/{sid}/actions` | 200 | 200/400/409 | schema-verified | pass | 6223 |
| `POST /v1/chat/sessions/{sid}/auth/google` | 400 | 400/401/403/409/422 | unchecked | negative-only | 130 |
| `POST /v1/chat/sessions/{sid}/auth/phone/token` | 400 | 400/401/403/409/422 | unchecked | negative-only | 160 |
| `POST /v1/chat/sessions/{sid}/messages` | 200 | 200/202 | schema-verified | pass | 4053 |
| `POST /v1/chat/sessions/{sid}/token/rotate` | 200 | 200 | schema-verified | pass | 144 |
| `POST /v1/chat/sessions/{sid}/verify/phone-token` | 400 | 400/401/403/409/422 | unchecked | negative-only | 128 |
| `POST /v1/forms` | 201 | 200/201 | schema-verified | pass | 154 |
| `POST /v1/forms/{id}/chat/sessions` | 200 | 200/201 | schema-verified | pass | 3440 |
| `POST /v1/forms/{id}/exports` | 202 | 200/201/202 | schema-verified | pass | 1039 |
| `POST /v1/forms/{id}/knowledge/crawl` | 200 | 200/201/202 | schema-verified | pass | 1475 |
| `POST /v1/forms/{id}/knowledge/link` | 200 | 200/201 | schema-verified | pass | 1366 |
| `POST /v1/forms/{id}/knowledge/text` | 200 | 200/201 | schema-verified | pass | 906 |
| `POST /v1/forms/{id}/knowledge/upload` | 200 | 200/201 | schema-verified | pass | 650 |
| `POST /v1/forms/{id}/publish` | 200 | 200/201 | schema-verified | pass | 161 |
| `POST /v1/forms/{id}/responses` | 201 | 200/201 | schema-verified | pass | 190 |
| `POST /v1/forms/{id}/sessions` | 200 | 200/201 | schema-verified | pass | 3798 |
| `POST /v1/forms/{id}/unpublish` | 200 | 200/204 | schema-verified | pass | 143 |
| `POST /v1/forms/{id}/versions/{version}/restore` | 200 | 200 | schema-verified | pass | 161 |
| `POST /v1/responses/{id}/abandon` | 200 | 200/204 | schema-verified | pass | 1727 |
| `POST /v1/responses/{id}/answers` | 200 | 200 | schema-verified | pass | 181 |
| `POST /v1/responses/{id}/complete` | 200 | 200 | schema-verified | pass | 1732 |
| `POST /v1/sessions/{sid}/actions` | 200 | 200/400/409 | schema-verified | pass | 5894 |
| `POST /v1/sessions/{sid}/auth/google` | 400 | 400/401/403/409/422 | unchecked | negative-only | 125 |
| `POST /v1/sessions/{sid}/auth/phone/token` | 400 | 400/401/403/409/422 | unchecked | negative-only | 184 |
| `POST /v1/sessions/{sid}/messages` | 200 | 200/202 | schema-verified | pass | 5746 |
| `POST /v1/sessions/{sid}/token/rotate` | 200 | 200 | schema-verified | pass | 179 |
| `POST /v1/sessions/{sid}/uploads/intent` | 200 | 200/201 | schema-verified | pass | 155 |
| `POST /v1/sessions/{sid}/uploads/{fileId}/confirm` | 200 | 200/201 | schema-verified | pass | 1738 |
| `POST /v1/sessions/{sid}/verify/phone-token` | 400 | 400/401/403/409/422 | unchecked | negative-only | 767 |
| `POST /v1/templates/{slug}/use` | 200 | 200/201 | schema-verified | pass | 213 |
| `POST /v1/webhooks` | 201 | 200/201 | schema-verified | pass | 133 |
| `POST /v1/webhooks/{id}/deliveries/{deliveryId}/replay` | 200 | 200/201/202 | schema-verified | pass | 428 |
| `PUT /v1/forms/{id}/doc` | 200 | 200 | schema-verified | pass | 168 |
| `PUT /v1/forms/{id}/integrations/spreadsheet` | 200 | 200/201/402 | schema-verified | pass | 138 |
| `PUT /v1/sessions/{sid}/uploads/{fileId}` | 200 | 200/201/204 | schema-verified | pass | 503 |
