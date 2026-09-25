import { ANSWER_CATALOG, displayAnswer, type Block } from "@repo/form-schema";

/**
 * What a delivery looks like, built from this form's own questions.
 *
 * Mirrors `deliverWebhookEvent` in `apps/api/src/lib/webhooks.ts`: the body is
 * `{ event, formId, timestamp, submission, metadata, answers }`, with `submission` being
 * the raw D1 row (so `hidden_fields` and `meta` arrive as JSON text) and each
 * answer's value the canonical shape from `ANSWER_CATALOG`. Change one, change
 * the other.
 */
/** The catalog's example, re-pointed at this block's own option ids. */
function sampleValue(block: Block): unknown {
  const example = ANSWER_CATALOG[block.type]?.examples[0];
  if (!example) return undefined;
  const value = example.canonical ?? example.value;
  if (value === undefined) return undefined;
  const ids = ("options" in block && Array.isArray(block.options) ? block.options : [])
    .map((o: { id?: string }) => o.id)
    .filter((id): id is string => typeof id === "string");
  if (ids.length === 0) return value;
  if (typeof value === "string" && value.startsWith("opt_")) return ids[0];
  if (Array.isArray(value) && value.every((v) => typeof v === "string" && v.startsWith("opt_"))) {
    return block.type === "ranking" ? ids : ids.slice(0, value.length);
  }
  return value;
}

/** Answerable blocks only: a welcome or statement never lands in `answers`. */
export function hasAnswer(block: Block) {
  return sampleValue(block) !== undefined;
}

const STATUS_BY_EVENT: Record<string, string> = {
  "response.completed": "completed",
  "response.disqualified": "disqualified",
  "response.abandoned": "abandoned",
};

export function samplePayload(formId: string, blocks: Block[], event = "response.completed") {
  const now = Date.now();
  const answers = blocks.flatMap((block) => {
    const value = sampleValue(block);
    if (value === undefined) return [];
    const options =
      "options" in block && Array.isArray(block.options)
        ? block.options.map((o: { id: string; label: string }) => ({ id: o.id, label: o.label }))
        : null;
    let display: string | null = null;
    try {
      display = displayAnswer(block, value);
    } catch {
      display = null;
    }
    return [{ ref: block.ref, type: block.type, question: block.title, options, value, display }];
  });
  return {
    event,
    formId,
    timestamp: now,
    submission: {
      id: "sub_8f2c1a9d4b7e4c11",
      status: STATUS_BY_EVENT[event] ?? "in_progress",
      started_at: now - 184_000,
      completed_at: event === "response.completed" ? now : null,
      duration_ms: 184_000,
      hidden_fields: '{"utm_source":"newsletter"}',
      meta: null,
    },
    metadata: {
      channel: "popup",
      pageUrl: "https://example.com/pricing?utm_source=newsletter",
      referrer: "https://www.google.com/",
      referrerHost: "google.com",
      utm: { source: "newsletter" },
      language: "en-US",
      screen: "1440x900",
      timezone: "America/New_York",
      device: { type: "desktop", browser: "Chrome", browserVersion: "129", os: "macOS", osVersion: "10.15" },
      geo: {
        country: "US",
        region: "New York",
        regionCode: "NY",
        city: "Brooklyn",
        postalCode: "11201",
        latitude: 40.6943,
        longitude: -73.9903,
        continent: "NA",
        timezone: "America/New_York",
      },
      network: { asn: 7922, organization: "Comcast Cable" },
    },
    answers,
  };
}

/** A prompt an AI coding agent can follow end to end to receive this form's webhooks. */
export function aiSetupPrompt({
  formId,
  formTitle,
  blocks,
  events,
}: {
  formId: string;
  formTitle: string;
  blocks: Block[];
  events: string[];
}) {
  const questions = blocks
    .filter(hasAnswer)
    .map((b) => {
      const line = `- \`${b.ref}\` (${b.type}): "${b.title}". ${ANSWER_CATALOG[b.type].shape}`;
      const options = "options" in b && Array.isArray(b.options) ? b.options : [];
      const labels = options
        .map((o: { id?: string; label?: string }) => `\`${o.id}\` = "${o.label ?? ""}"`)
        .join(", ");
      return labels ? `${line} Options: ${labels}` : line;
    })
    .join("\n");

  return `Add a webhook endpoint to this project that receives responses from my ChatForm form "${formTitle}" (form id \`${formId}\`).

## What ChatForm sends

ChatForm sends an HTTP POST with a JSON body to my endpoint for these events: ${events.map((e) => `\`${e}\``).join(", ")}.

Headers on every request:
- \`content-type: application/json\`
- \`x-chatform-event\`: the event name, e.g. \`response.completed\`
- \`x-chatform-delivery\`: a unique delivery id (\`whd_...\`). Use it to ignore duplicates.
- \`x-chatform-signature\`: \`t=<unix seconds>, v1=<hex>\`

Example body (values are samples; the shape is exact):

\`\`\`json
${JSON.stringify(samplePayload(formId, blocks, events[0]), null, 2)}
\`\`\`

Notes on the body:
- \`timestamp\`, \`submission.started_at\` and \`submission.completed_at\` are Unix epoch milliseconds.
- \`submission.hidden_fields\` and \`submission.meta\` are JSON-encoded strings or null. Parse them with JSON.parse.
- \`metadata\` says who filled the form and from where, already parsed: \`channel\` (\`link\`, \`inline\`, \`popup\`, \`side_tab\`, \`fullpage\`, \`embed\` or \`api\`), \`pageUrl\` (the page the form sat on), \`referrer\`, \`utm\`, \`language\`, \`screen\`, \`device\` (type, browser, OS), \`geo\` (country, region, city, postal code, latitude/longitude from the IP) and \`network\`. Any field can be null, and older responses carry only country and device.
- \`answers\` is an array. Look answers up by \`ref\`, never by position. A question the respondent skipped is missing from the array.
- Each answer carries \`question\` (the question text), \`type\`, \`options\` (\`[{ id, label }]\` for choice questions, otherwise null), \`value\` (the raw stored answer; choice answers are option ids) and \`display\` (the answer as readable text, e.g. the chosen option's label). \`question\` and \`options\` are null if the question was later deleted from the form.
- Store \`value\` for logic and \`display\` for humans (emails, CRM notes, Slack).
- \`submission.status\` is one of: completed, disqualified, abandoned, in_progress.

The form's questions, by ref:
${questions || "- (this form has no answerable questions yet)"}

## Steps

1. Detect this project's framework and language, and add a POST route (for example \`/api/webhooks/chatform\`) the way this project already defines routes.
2. Read the raw request body as text BEFORE parsing JSON. The signature is computed over the exact bytes.
3. Verify the signature:
   - Parse \`t\` and \`v1\` from the \`x-chatform-signature\` header.
   - Compute HMAC-SHA256 with the signing secret as the key (the full string, including the \`whsec_\` prefix, UTF-8 encoded) over the string \`\${t}.\${rawBody}\`, hex encoded.
   - Compare it to \`v1\` with a constant-time comparison. On mismatch, respond 401.
   - Reject requests where \`t\` is more than 5 minutes from the current time, to stop replays.
4. Read the secret from an environment variable named \`CHATFORM_WEBHOOK_SECRET\`. Add it to the project's env example file and config/validation if one exists. Never hardcode it.
5. Parse the JSON body, switch on \`event\`, and map the answers into a typed object keyed by the refs above. Write TypeScript types (or the language's equivalent) for the payload.
6. The "Test connection" button in ChatForm sends \`{ "event": "test", "timestamp": ..., "formId": null }\` with the same \`x-chatform-signature\` header (no \`x-chatform-delivery\`), and no answers. Verify it, then respond 200 without running business logic.
7. Make the handler idempotent: store processed \`x-chatform-delivery\` ids (or \`submission.id\` + \`event\`) and skip repeats. ChatForm retries failed deliveries for up to two hours (after 1m, 5m, 30m, 2h), so the same event can arrive more than once.
8. Respond with a 2xx within 10 seconds. Any non-2xx or timeout counts as a failure and is retried. Do slow work (emails, CRM calls) after responding or in a background job. After 20 consecutive failures ChatForm switches the endpoint off.
9. Put a clear TODO where my business logic goes (save to the database, notify, etc.). If the project already has a database layer, save the response there.
10. Add a test that signs a sample body with a test secret and asserts the handler accepts it, and rejects a wrong signature.
11. Tell me the final public URL path to paste into ChatForm (Integrate tab, Webhooks, Payload URL). It must be a public https URL; for local testing suggest a tunnel such as ngrok or cloudflared. ChatForm's "Test connection" button can then be used to check it.`;
}
