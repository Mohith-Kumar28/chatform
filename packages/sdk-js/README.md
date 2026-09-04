# @chatformhq/js

The official JavaScript client for [Chatform](https://chatform.in).

```bash
npm install @chatformhq/js
```

```ts
import { createClient } from "@chatformhq/js";

const chatform = createClient({ apiKey: process.env.CHATFORM_SECRET_KEY! });

const response = await chatform.responses.create(formId, {
  answers: { q_email: "maya@northwind.co" },
  complete: true,
});
```

Full documentation: https://chatform.in/docs

## In a browser

Secret keys must never reach a browser — the API refuses them outright. Use the
separate entrypoint, which will not let you:

```ts
import { createBrowserClient } from "@chatformhq/js/browser";

const chatform = createBrowserClient({ publishableKey: "pk_live_…" });
```

Better still, open the session on your server and hand the browser the
session-scoped `respondentToken` it returns.

## Verifying webhooks

```ts
import { verifyWebhook } from "@chatformhq/js/webhooks";

const event = await verifyWebhook({ body: rawBody, headers, secret });
```
