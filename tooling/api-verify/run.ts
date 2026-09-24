/**
 * Walk every `/v1` operation against production, in the order a real
 * integration would, and report what happened.
 *
 * Ordered rather than independent, because most of this surface cannot be
 * tested in isolation: there is nothing to publish until a document has been
 * written, nothing to export until somebody has answered, and no delivery to
 * replay until a webhook has fired. The run therefore threads one form through
 * the whole lifecycle and reports each operation as it reaches it.
 *
 * Safety is structural, not procedural. Every object is titled with the run id,
 * every id the run mints goes into `created`, and the delete helper refuses an
 * id that is not in that set — so the harness cannot remove something it did
 * not make, including the live event form sitting in the same workspace. It
 * has to be the same workspace: `POST /v1/forms` picks the organization's
 * oldest and takes no parameter, so workspace-level isolation is not on offer.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { ApiClient, type CallSpec } from "./client.ts";
import { validateResponse, v1Operations } from "./validate.ts";
import { render, type OpResult, type Finding } from "./report.ts";
import { buildTestDoc } from "./form-doc.ts";
import { runProbes } from "./probes.ts";

const BASE = process.env.CHATFORM_BASE ?? "https://api.chatform.in";
const KEY = process.env.CHATFORM_SECRET_KEY;
const PK = process.env.CHATFORM_PUBLISHABLE_KEY;
const PK_ORIGIN = process.env.CHATFORM_PUBLISHABLE_ORIGIN ?? "http://localhost:3000";
const SKIP_AI = process.argv.includes("--skip-ai");

if (!KEY) {
  console.error("CHATFORM_SECRET_KEY is not set.");
  process.exit(1);
}

const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const client = new ApiClient(BASE, KEY);
const results: OpResult[] = [];
const findings: Finding[] = [];

/** Ids this run created. Nothing else may be deleted. */
const created = { forms: new Set<string>(), webhooks: new Set<string>(), knowledge: new Set<string>() };

interface Expect {
  status: number | number[];
  /** Keys the response must carry, for the 47 operations with no declared schema. */
  has?: string[];
  outcome?: OpResult["outcome"];
  note?: string;
}

function get(obj: any, path: string): unknown {
  return path.split(".").reduce<any>((cur, k) => (cur == null ? cur : cur[k]), obj);
}

async function step(spec: CallSpec, expect: Expect): Promise<any> {
  const rec = await client.call(spec);
  const op = `${spec.method} ${spec.path}`;
  const wanted = Array.isArray(expect.status) ? expect.status : [expect.status];
  const problems: string[] = [];

  if (!wanted.includes(rec.status)) {
    problems.push(
      `expected ${wanted.join(" or ")}, got ${rec.status}` +
        (rec.json?.error ? ` (${rec.json.error.code}: ${rec.json.error.message})` : ` ${rec.text.slice(0, 160)}`),
    );
  }

  let check: OpResult["check"] = "unchecked";
  if (rec.status < 300) {
    const verdict = validateResponse(spec.method, spec.path, rec.status, rec.json);
    if (verdict.verdict !== "no-schema") {
      check = "schema-verified";
      problems.push(...verdict.problems);
    } else if (expect.has?.length) {
      check = "shape-asserted";
      for (const k of expect.has) {
        if (get(rec.json, k) === undefined) problems.push(`response has no \`${k}\``);
      }
    }
  }

  const outcome: OpResult["outcome"] = problems.length ? "fail" : (expect.outcome ?? "pass");
  results.push({
    op,
    status: rec.status,
    expected: wanted.join("/"),
    ms: rec.ms,
    check,
    outcome,
    problems,
    note: expect.note,
  });

  const tag = outcome === "fail" ? "FAIL" : outcome === "negative-only" ? "neg " : "pass";
  console.log(`  ${tag}  ${op.padEnd(52)} ${rec.status}  ${String(rec.ms).padStart(5)}ms`);
  for (const p of problems) console.log(`        ${p}`);
  return rec.json;
}

function skip(op: string, note: string) {
  results.push({ op, status: 0, expected: "-", ms: 0, check: "unchecked", outcome: "skipped", problems: [], note });
  console.log(`  skip  ${op.padEnd(52)} ${note}`);
}

function section(name: string) {
  console.log(`\n${name}`);
}

async function main() {
  console.log(`API verification run ${runId} against ${BASE}\n`);

  // ---- Safety gate -------------------------------------------------------
  section("0. Safety gate");
  const me = await step({ method: "GET", path: "/v1/me" }, { status: 200, has: ["organization_id", "key.scopes", "plan"] });
  console.log(`        org ${me.organization_id}, plan ${me.plan}`);

  const before = await client.call({ method: "GET", path: "/v1/forms", query: { limit: 100 }, incidental: true });
  const preExisting: string[] = (before.json?.data ?? []).map((f: any) => f.id);
  console.log(`        ${preExisting.length} pre-existing form(s), none of which this run may touch:`);
  for (const f of before.json?.data ?? []) console.log(`          ${f.id}  ${f.title}`);

  const { doc, refs, endings, screenOutOptionId, pollOptionIds } = buildTestDoc(runId);

  // ---- Meta --------------------------------------------------------------
  section("1. Meta and discovery");
  const blocks = await step({ method: "GET", path: "/v1/blocks" }, { status: 200, has: ["schema_version", "blocks"] });
  await step({ method: "GET", path: "/v1/blocks/{type}", params: { type: "poll" } }, { status: 200, has: ["type", "config_schema"] });
  await step({ method: "GET", path: "/v1/events" }, { status: 200, has: ["events"] });
  console.log(`        ${blocks.blocks?.length} block types published`);

  // ---- Templates ---------------------------------------------------------
  section("2. Templates");
  const templates = await step({ method: "GET", path: "/v1/templates" }, { status: 200 });
  /** Every list answers `{data, has_more, next_cursor}` now; tolerate both while deployments catch up. */
  const rows = <T,>(b: any): T[] => (Array.isArray(b) ? b : Array.isArray(b?.data) ? b.data : []);
  const slug = rows<{ slug: string }>(templates)[0]?.slug;
  await step({ method: "GET", path: "/v1/templates/{slug}", params: { slug } }, { status: 200 });
  const fromTemplate = await step(
    { method: "POST", path: "/v1/templates/{slug}/use", params: { slug }, body: {} },
    { status: [200, 201], has: ["id"] },
  );
  if (fromTemplate?.id) created.forms.add(fromTemplate.id);

  // ---- Authoring ---------------------------------------------------------
  section("3. Authoring");
  const form = await step(
    { method: "POST", path: "/v1/forms", body: { title: doc.title } },
    { status: [200, 201], has: ["id", "slug", "status"] },
  );
  const F = form.id as string;
  created.forms.add(F);
  console.log(`        working form ${F}`);

  const linted = await step(
    { method: "PUT", path: "/v1/forms/{id}/doc", params: { id: F }, body: { doc } },
    { status: 200, has: ["ok", "issues"] },
  );
  const errors = (linted?.issues ?? []).filter((i: any) => i.level === "error");
  if (errors.length) {
    findings.push({
      severity: "high",
      title: "The hand-composed document did not lint clean",
      detail: "```json\n" + JSON.stringify(errors, null, 2) + "\n```",
    });
  }

  /**
   * Read the draft back. `GET /v1/forms/{id}` answers the *published* config,
   * so on a form created a moment ago it is a 404 -- and `?view=document`, the
   * parameter that does work, is declared nowhere in the spec. 200 and 404 are
   * both accepted here so the walk continues; the probe in section 16 is what
   * reports it.
   */
  await step({ method: "GET", path: "/v1/forms/{id}", params: { id: F }, query: { view: "document" } }, { status: 200, has: ["id", "doc"] });
  await step({ method: "GET", path: "/v1/forms", query: { limit: 5, status: "all" } }, { status: 200, has: ["data", "has_more"] });

  // ---- AI ----------------------------------------------------------------
  section("4. AI generation");
  if (SKIP_AI) {
    for (const op of ["POST /v1/ai/clarify-form", "POST /v1/ai/generate-form", "POST /v1/ai/edit-form"]) skip(op, "--skip-ai");
  } else {
    await step({ method: "POST", path: "/v1/ai/clarify-form", body: { prompt: "A signup form for a developer meetup" } }, { status: 200 });
    await step(
      { method: "POST", path: "/v1/ai/generate-form", body: { prompt: "A two-question signup form for a developer meetup", questionCount: 2 } },
      { status: 200 },
    );
    await step(
      { method: "POST", path: "/v1/ai/edit-form", body: { formId: F, prompt: "Make the notes question required" } },
      { status: [200, 422], has: ["doc"], note: "422 `would change nothing` is a documented normal outcome" },
    );
  }

  // ---- Knowledge ---------------------------------------------------------
  section("5. Knowledge base");
  const kText = await step(
    { method: "POST", path: "/v1/forms/{id}/knowledge/text", params: { id: F }, body: { title: `apitest ${runId}`, body: "Chatform turns a form into a conversation." } },
    { status: [200, 201] },
  );
  if (kText?.id) created.knowledge.add(kText.id);
  const kLink = await step(
    { method: "POST", path: "/v1/forms/{id}/knowledge/link", params: { id: F }, body: { url: "https://chatform.in/docs/quickstart" } },
    { status: [200, 201] },
  );
  if (kLink?.id) created.knowledge.add(kLink.id);
  const kCrawl = await step(
    { method: "POST", path: "/v1/forms/{id}/knowledge/crawl", params: { id: F }, body: { url: "https://chatform.in/docs", pages: 1 } },
    { status: [200, 201, 202] },
  );
  for (const id of kCrawl?.ids ?? (kCrawl?.id ? [kCrawl.id] : [])) created.knowledge.add(id);

  const fd = new FormData();
  fd.append("file", new Blob([`# apitest ${runId}\n\nA small uploaded note.\n`], { type: "text/markdown" }), `apitest-${runId}.md`);
  const kUp = await step(
    { method: "POST", path: "/v1/forms/{id}/knowledge/upload", params: { id: F }, raw: fd },
    { status: [200, 201] },
  );
  if (kUp?.id) created.knowledge.add(kUp.id);

  await step({ method: "GET", path: "/v1/forms/{id}/knowledge", params: { id: F } }, { status: 200 });
  for (const id of created.knowledge) {
    await step({ method: "DELETE", path: "/v1/forms/{id}/knowledge/{sourceId}", params: { id: F, sourceId: id } }, { status: [200, 204] });
  }
  created.knowledge.clear();

  // ---- Publish and versions ---------------------------------------------
  section("6. Publish and versions");
  await step({ method: "POST", path: "/v1/forms/{id}/publish", params: { id: F } }, { status: [200, 201], has: ["version"] });
  const v2doc = structuredClone(doc) as any;
  v2doc.description = "Second version, written by the verification run.";
  await client.call({ method: "PUT", path: "/v1/forms/{id}/doc", params: { id: F }, body: { doc: v2doc }, incidental: true });
  await step({ method: "POST", path: "/v1/forms/{id}/publish", params: { id: F } }, { status: [200, 201], has: ["version"] });

  await step({ method: "GET", path: "/v1/forms/{id}/versions", params: { id: F } }, { status: 200 });
  await step({ method: "GET", path: "/v1/forms/{id}/versions/{version}", params: { id: F, version: "2" }, query: { compare: 1 } }, { status: 200, has: ["doc"] });
  await step({ method: "POST", path: "/v1/forms/{id}/versions/{version}/restore", params: { id: F, version: "1" } }, { status: 200, has: ["ok"] });
  await step({ method: "POST", path: "/v1/forms/{id}/unpublish", params: { id: F } }, { status: [200, 204] });
  await step({ method: "POST", path: "/v1/forms/{id}/publish", params: { id: F } }, { status: [200, 201], has: ["version"] });

  // ---- Webhooks ----------------------------------------------------------
  section("7. Webhooks");
  const hook = await step(
    {
      method: "POST",
      path: "/v1/webhooks",
      body: { url: `https://chatform.in/__apitest__?run=${runId}`, events: ["response.completed"] },
    },
    { status: [200, 201], has: ["id"] },
  );
  if (hook?.id) created.webhooks.add(hook.id);
  await step({ method: "GET", path: "/v1/webhooks" }, { status: 200 });

  // ---- Integrations ------------------------------------------------------
  section("8. Integrations");
  const feed = await step(
    { method: "PUT", path: "/v1/forms/{id}/integrations/spreadsheet", params: { id: F }, body: {} },
    { status: [200, 201, 402] },
  );
  await step({ method: "GET", path: "/v1/forms/{id}/integrations", params: { id: F } }, { status: 200 });
  await step({ method: "DELETE", path: "/v1/forms/{id}/integrations/spreadsheet", params: { id: F } }, { status: [200, 204, 404] });

  // ---- Response lifecycle ------------------------------------------------
  section("9. Response lifecycle");
  const idem = crypto.randomUUID();
  const r1 = await step(
    { method: "POST", path: "/v1/forms/{id}/responses", params: { id: F }, body: {}, headers: { "idempotency-key": idem } },
    { status: [200, 201], has: ["id"] },
  );
  const R = r1.id as string;
  const replay = await client.call({
    method: "POST", path: "/v1/forms/{id}/responses", params: { id: F }, body: {},
    headers: { "idempotency-key": idem }, incidental: true,
  });
  if (replay.json?.id !== R) {
    findings.push({
      severity: "high",
      title: "`Idempotency-Key` did not replay on `POST /v1/forms/{id}/responses`",
      detail: `The same key returned \`${replay.json?.id}\` where the first call returned \`${R}\`. The docs promise the stored response, unchanged.`,
    });
  } else {
    console.log(`        idempotency replayed correctly (${R})`);
  }

  await step({ method: "GET", path: "/v1/responses/{id}/next", params: { id: R } }, { status: 200 });
  await step(
    {
      method: "POST", path: "/v1/responses/{id}/answers", params: { id: R },
      /**
       * An array of `{ref, value}` here, but a `{ref: value}` map on
       * `POST /v1/forms/{id}/responses`. Same field name, two shapes, two
       * adjacent endpoints.
       */
      body: { answers: [{ ref: refs.name, value: "Maya" }, { ref: refs.email, value: "maya@northwind.co" }] },
    },
    { status: 200 },
  );
  await step({ method: "DELETE", path: "/v1/responses/{id}/answers/{ref}", params: { id: R, ref: refs.name } }, { status: [200, 204] });
  /**
   * Both answers go back, not just the retracted one. Retracting rewinds the
   * flow to that question, so everything answered after it is discarded too --
   * which the reference page says, and which is easy to read as "one answer
   * removed" until a later `complete` answers 422.
   */
  await client.call({
    method: "POST", path: "/v1/responses/{id}/answers", params: { id: R },
    body: { answers: [{ ref: refs.name, value: "Maya" }, { ref: refs.email, value: "maya@northwind.co" }] },
    incidental: true,
  });

  // The happy branch, answered through to a success ending.
  await client.call({
    method: "POST", path: "/v1/responses/{id}/answers", params: { id: R },
    body: {
      /**
       * The optional questions are answered too. In the default `flow` mode a
       * question is refused until the flow has reached it, and an unanswered
       * optional question still sits in the way -- so skipping `q_team_size`
       * makes `q_consent` `block_not_reachable`, and `complete` then answers
       * 422 naming a question that was never refused.
       */
      answers: [
        { ref: refs.role, value: "Building something" },
        { ref: refs.poll, value: pollOptionIds[0] },
        { ref: refs.rating, value: 5 },
        { ref: refs.teamSize, value: 4 },
        { ref: refs.notes, value: "Recorded by the verification run." },
        { ref: refs.consent, value: true },
      ],
    },
    incidental: true,
  });
  await step({ method: "GET", path: "/v1/responses/{id}", params: { id: R } }, { status: 200, has: ["id", "status"] });
  const done = await step({ method: "POST", path: "/v1/responses/{id}/complete", params: { id: R }, body: {} }, { status: 200, has: ["status"] });
  console.log(`        completed with status ${done?.status}, ending ${JSON.stringify(done?.ending?.kind ?? null)}`);

  // The screen-out branch.
  const r2 = await client.call({ method: "POST", path: "/v1/forms/{id}/responses", params: { id: F }, body: {}, incidental: true });
  const R2 = r2.json?.id;
  if (R2) {
    await client.call({
      method: "POST", path: "/v1/responses/{id}/answers", params: { id: R2 },
      body: {
        answers: [
          { ref: refs.name, value: "Sam" },
          { ref: refs.email, value: "sam@example.com" },
          { ref: refs.role, value: screenOutOptionId },
          { ref: refs.poll, value: pollOptionIds[1] },
          { ref: refs.rating, value: 3 },
          { ref: refs.teamSize, value: 1 },
          { ref: refs.notes, value: "Screen-out branch." },
          { ref: refs.consent, value: true },
        ],
      },
      incidental: true,
    });
    const out = await client.call({ method: "POST", path: "/v1/responses/{id}/complete", params: { id: R2 }, body: {}, incidental: true });
    const kind = out.json?.ending?.kind;
    const status = out.json?.status;
    console.log(`        screen-out branch: status ${status}, ending.kind ${JSON.stringify(kind)}`);
    if (kind !== "screen_out" || status !== "disqualified") {
      findings.push({
        severity: "high",
        title: "The screen-out branch did not produce a screen-out",
        detail: `Answering the routed option gave status \`${status}\` and ending kind \`${kind}\`, where \`disqualified\` / \`screen_out\` was expected. Body: \`${JSON.stringify(out.json).slice(0, 500)}\``,
      });
    }
  }

  const r3 = await client.call({ method: "POST", path: "/v1/forms/{id}/responses", params: { id: F }, body: {}, incidental: true });
  if (r3.json?.id) await step({ method: "POST", path: "/v1/responses/{id}/abandon", params: { id: r3.json.id } }, { status: [200, 204] });
  await step({ method: "GET", path: "/v1/forms/{id}/responses", params: { id: F }, query: { limit: 10 } }, { status: 200, has: ["data", "has_more"] });

  // ---- Sessions ----------------------------------------------------------
  section("10. Conversational sessions");
  const sess = await step({ method: "POST", path: "/v1/forms/{id}/sessions", params: { id: F }, body: {} }, { status: [200, 201] });
  const S = sess?.id ?? sess?.sessionId ?? sess?.session?.id;
  if (S) {
    await step({ method: "POST", path: "/v1/sessions/{sid}/messages", params: { sid: S }, body: { type: "text", text: "Hello" } }, { status: [200, 202] });
    await step({ method: "GET", path: "/v1/sessions/{sid}", params: { sid: S } }, { status: 200 });
    await step({ method: "GET", path: "/v1/sessions/{sid}/events", params: { sid: S }, query: { since: 0 } }, { status: 200 });
    await step({ method: "POST", path: "/v1/sessions/{sid}/actions", params: { sid: S }, body: { action: "skip" } }, { status: [200, 400, 409] });
    await step({ method: "POST", path: "/v1/sessions/{sid}/token/rotate", params: { sid: S }, body: {} }, { status: 200 });

    // No script can mint a Google or Firebase identity token, so these three
    // are reachable only through their refusal path.
    for (const [path, body] of [
      ["/v1/sessions/{sid}/auth/google", { idToken: "not-a-real-token" }],
      ["/v1/sessions/{sid}/auth/phone/token", { idToken: "not-a-real-token" }],
      ["/v1/sessions/{sid}/verify/phone-token", { idToken: "not-a-real-token" }],
    ] as const) {
      await step(
        { method: "POST", path, params: { sid: S }, body },
        { status: [400, 401, 403, 409, 422], outcome: "negative-only", note: "needs a real identity token; only the refusal path is reachable from a script" },
      );
    }

    // The legacy `/v1/chat/sessions/...` spelling, proven to be a real alias.
    const chat = await step({ method: "POST", path: "/v1/forms/{id}/chat/sessions", params: { id: F }, body: {} }, { status: [200, 201] });
    const C = chat?.id ?? chat?.sessionId;
    if (C) {
      await step({ method: "POST", path: "/v1/chat/sessions/{sid}/messages", params: { sid: C }, body: { type: "text", text: "Hello" } }, { status: [200, 202] });
      await step({ method: "GET", path: "/v1/chat/sessions/{sid}", params: { sid: C } }, { status: 200 });
      await step({ method: "GET", path: "/v1/chat/sessions/{sid}/events", params: { sid: C }, query: { since: 0 } }, { status: 200 });
      await step({ method: "POST", path: "/v1/chat/sessions/{sid}/actions", params: { sid: C }, body: { action: "skip" } }, { status: [200, 400, 409] });
      await step({ method: "POST", path: "/v1/chat/sessions/{sid}/token/rotate", params: { sid: C }, body: {} }, { status: 200 });
      for (const path of [
        "/v1/chat/sessions/{sid}/auth/google",
        "/v1/chat/sessions/{sid}/auth/phone/token",
        "/v1/chat/sessions/{sid}/verify/phone-token",
      ] as const) {
        await step(
          { method: "POST", path, params: { sid: C }, body: { idToken: "not-a-real-token" } },
          { status: [400, 401, 403, 409, 422], outcome: "negative-only", note: "legacy alias; needs a real identity token" },
        );
      }
    }

    // ---- Uploads --------------------------------------------------------
    section("11. Uploads");
    const bytes = new TextEncoder().encode(`apitest ${runId}\n`);
    const intent = await step(
      { method: "POST", path: "/v1/sessions/{sid}/uploads/intent", params: { sid: S }, body: { ref: refs.notes, filename: `apitest-${runId}.txt`, mime: "text/plain", size: bytes.byteLength } },
      { status: [200, 201] },
    );
    const fileId = intent?.fileId ?? intent?.id;
    if (fileId) {
      await step(
        { method: "PUT", path: "/v1/sessions/{sid}/uploads/{fileId}", params: { sid: S, fileId }, raw: bytes, headers: { "content-type": "text/plain" } },
        { status: [200, 201, 204] },
      );
      await step({ method: "POST", path: "/v1/sessions/{sid}/uploads/{fileId}/confirm", params: { sid: S, fileId }, body: {} }, { status: [200, 201] });
      await step({ method: "GET", path: "/v1/files/{id}", params: { id: fileId } }, { status: 200 });
    } else {
      for (const op of ["PUT /v1/sessions/{sid}/uploads/{fileId}", "POST /v1/sessions/{sid}/uploads/{fileId}/confirm", "GET /v1/files/{id}"]) {
        skip(op, "no fileId came back from the intent");
      }
    }
  }

  // ---- Exports -----------------------------------------------------------
  section("12. Exports");
  const exp = await step(
    { method: "POST", path: "/v1/forms/{id}/exports", params: { id: F }, body: { format: "csv" } },
    { status: [200, 201, 202] },
  );
  const E = exp?.id;
  if (E) {
    for (let i = 0; i < 8; i++) {
      const poll = await client.call({ method: "GET", path: "/v1/exports/{id}", params: { id: E }, incidental: true });
      if (["ready", "done", "complete", "completed", "failed"].includes(poll.json?.status)) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    await step({ method: "GET", path: "/v1/exports/{id}", params: { id: E } }, { status: 200 });
  } else {
    skip("GET /v1/exports/{id}", "no export id came back");
  }
  await step({ method: "GET", path: "/v1/exports" }, { status: 200 });

  // ---- Analytics ---------------------------------------------------------
  section("13. Analytics");
  await step({ method: "GET", path: "/v1/forms/{id}/analytics", params: { id: F } }, { status: 200, has: ["views", "starts", "completed", "completionRate"] });
  await step({ method: "GET", path: "/v1/forms/{id}/followup-analytics", params: { id: F } }, { status: 200, has: ["sent", "clicked", "recovered"] });

  // ---- Webhook deliveries (after traffic) --------------------------------
  section("14. Webhook deliveries");
  if (hook?.id) {
    const deliveries = await step({ method: "GET", path: "/v1/webhooks/{id}/deliveries", params: { id: hook.id } }, { status: 200 });
    const d = rows<{ id: string }>(deliveries)[0];
    if (d?.id) {
      await step({ method: "POST", path: "/v1/webhooks/{id}/deliveries/{deliveryId}/replay", params: { id: hook.id, deliveryId: d.id }, body: {} }, { status: [200, 201, 202] });
    } else {
      skip("POST /v1/webhooks/{id}/deliveries/{deliveryId}/replay", "no delivery had been attempted yet");
    }
  }

  // ---- Negative matrix ---------------------------------------------------
  section("15. Auth and refusal paths");
  const neg = async (label: string, spec: CallSpec, want: number, code?: string) => {
    const rec = await client.call({ ...spec, incidental: true });
    const ok = rec.status === want && (!code || rec.json?.error?.code === code);
    console.log(`  ${ok ? "pass" : "FAIL"}  ${label.padEnd(52)} ${rec.status} ${rec.json?.error?.code ?? ""}`);
    if (!ok) {
      findings.push({
        severity: "medium",
        title: `Refusal path did not behave as documented: ${label}`,
        detail: `Expected ${want}${code ? ` \`${code}\`` : ""}, got ${rec.status} \`${rec.json?.error?.code}\`.`,
      });
    }
  };
  await neg("no key -> 401", { method: "GET", path: "/v1/me", anonymous: true }, 401, "unauthorized");
  await neg("bad key -> 401", { method: "GET", path: "/v1/me", key: "sk_live_" + "0".repeat(48) }, 401, "invalid_api_key");
  await neg("secret key + Origin -> 403", { method: "GET", path: "/v1/me", headers: { Origin: "https://evil.example.com" } }, 403, "secret_key_in_browser");
  await neg("unknown form -> 404", { method: "GET", path: "/v1/forms/{id}", params: { id: "frm_doesnotexist" } }, 404, "not_found");
  if (PK) {
    await neg("publishable key, no Origin -> 403", { method: "GET", path: "/v1/me", key: PK }, 403, "origin_not_allowed");
    await neg("publishable key, allowed Origin -> 200", { method: "GET", path: "/v1/me", key: PK, headers: { Origin: PK_ORIGIN } }, 200);
    await neg("publishable key beyond its ceiling -> 403", { method: "GET", path: "/v1/forms/{id}/responses", params: { id: F }, key: PK, headers: { Origin: PK_ORIGIN } }, 403);
  } else {
    console.log("  skip  publishable-key cases                           no CHATFORM_PUBLISHABLE_KEY set");
  }

  // ---- Contract probes ---------------------------------------------------
  section("16. Contract probes");
  const probeRes = await client.call({ method: "POST", path: "/v1/forms/{id}/responses", params: { id: F }, body: {}, incidental: true });
  findings.push(...(await runProbes(client, F, probeRes.json?.id ?? R)));

  // ---- Cleanup -----------------------------------------------------------
  section("17. Cleanup");
  await cleanup(preExisting);
}

async function cleanup(preExisting: string[]) {
  for (const id of created.webhooks) {
    await step({ method: "DELETE", path: "/v1/webhooks/{id}", params: { id } }, { status: [200, 204] });
  }
  for (const id of created.forms) {
    if (preExisting.includes(id)) {
      console.log(`  REFUSED to delete ${id}: it existed before this run`);
      continue;
    }
    await step({ method: "DELETE", path: "/v1/forms/{id}", params: { id } }, { status: [200, 204] });
  }

  const after = await client.call({ method: "GET", path: "/v1/forms", query: { limit: 100 }, incidental: true });
  const left = (after.json?.data ?? []).filter((f: any) => String(f.title).includes("apitest"));
  if (left.length) {
    findings.push({
      severity: "medium",
      title: "Cleanup left objects behind",
      detail: left.map((f: any) => `- \`${f.id}\` ${f.title}`).join("\n"),
    });
    console.log(`  CLEANUP INCOMPLETE: ${left.length} left`);
  } else {
    console.log("  clean");
  }

  const survivors = (after.json?.data ?? []).map((f: any) => f.id);
  const lost = preExisting.filter((id) => !survivors.includes(id));
  if (lost.length) {
    findings.push({
      severity: "high",
      title: "A form that existed before the run is gone",
      detail: lost.map((id) => `- \`${id}\``).join("\n"),
    });
  } else {
    console.log(`  all ${preExisting.length} pre-existing form(s) still present`);
  }
}

try {
  await main();
} catch (err) {
  console.error("\nRun aborted:", (err as Error).message);
  findings.push({ severity: "high", title: "The run aborted", detail: "```\n" + (err as Error).stack + "\n```" });
  await cleanup([]).catch(() => {});
} finally {
  const md = render(results, findings, v1Operations(), client.records, runId);
  mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
  const out = new URL(`./results/${runId}.md`, import.meta.url);
  writeFileSync(out, md);
  writeFileSync(new URL("./report.md", import.meta.url), md);
  console.log(`\nReport written to tooling/api-verify/report.md`);
}
