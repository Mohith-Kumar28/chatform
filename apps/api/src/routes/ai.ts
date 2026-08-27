import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import { FormDoc, lintFormDoc, hasErrors, migrateFormDoc, type Block } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { requireSession, requireOrg, assertFormAccess, type GuardVars } from "../lib/guards.js";
import { requirePermission, requireQuota, requireGauge, type AuthzVars } from "../lib/authorize.js";
import { meter } from "../lib/entitlements.js";
import { generateFormDraft, generateEdit, streamFormDraft, researchBrief, type GenerationDraft } from "../lib/ai.js";
import { buildFlowRules } from "../lib/flow-normalize.js";
import { buildFlowGeneratorPrompt, buildEditPrompt, type BuilderTurn } from "../lib/agent-prompts.js";
import { draftToDoc, normalizeEditBlocks, resolveBranches } from "../lib/draft-normalize.js";
import { extractUrls, readSites } from "../lib/research.js";
import { requireWorkspace, formSlug } from "../lib/workspace.js";

export const aiRouter = new Hono<{ Bindings: Bindings; Variables: Partial<AuthzVars & GuardVars> }>();

aiRouter.use("/ai/*", requireSession);
aiRouter.use("/ai/*", requireOrg);
// AI generation is a real cost, so it is both role-gated and quota-gated. The quota is
// checked here and consumed only on success, inside each handler — a generation that
// fails upstream must not spend someone's monthly allowance.
aiRouter.use("/ai/*", requirePermission("ai", "generate"));
aiRouter.use("/ai/*", requireQuota("ai_generations", "ai.generate"));
// The streaming generator writes the form itself, so it is gated like creating
// one. Denials land before the stream opens and are ordinary JSON, which is
// what lets the client's paywall interceptor see them.
aiRouter.post("/ai/generate-form/stream", requirePermission("form", "create"));
aiRouter.post("/ai/generate-form/stream", requireGauge("forms_count", "forms.create"));

const GenerateBody = z.object({
  prompt: z.string().min(5).max(2000),
  questionCount: z.number().int().min(2).max(20).default(6),
});

/** A generation that produced a valid document, plus what it cost. */
interface Generated {
  doc: ReturnType<typeof FormDoc.parse>;
  issues: ReturnType<typeof lintFormDoc>;
  tokens: number;
}

/**
 * Turn a draft into a document, retrying once with the linter's complaints fed
 * back in. Shared by both generation routes.
 */
async function generateWithRetry(opts: {
  env: Bindings;
  prompt: string;
  questionCount: number;
  research: { brief: string; sources: string[] } | null;
  /** Called for each question as it is drafted; enables the streaming path. */
  onBlock?: (b: { index: number; title: string; type: string }) => void;
  onRetry?: (reason: string) => void;
}): Promise<Generated> {
  let lastError = "";
  let tokens = 0;

  for (let attempt = 0; attempt < 2; attempt++) {
    const fixNote =
      attempt === 0 ? "" : `\n\nYour previous attempt had these problems — fix them:\n${lastError}`;
    const prompt = buildFlowGeneratorPrompt(opts.prompt, opts.questionCount, opts.research) + fixNote;

    let draft: GenerationDraft;
    try {
      const result = opts.onBlock
        ? await streamFormDraft({ env: opts.env, prompt, onBlock: opts.onBlock })
        : await generateFormDraft({ env: opts.env, prompt });
      draft = result.draft;
      tokens += result.tokens;
    } catch (err) {
      // An upstream failure — OpenRouter 5xx, a provider timeout, a schema the
      // provider rejected. Worth one retry; the second is the author's problem
      // to hear about rather than wait through.
      lastError = err instanceof Error ? err.message : String(err);
      console.error("generation_call_failed", lastError);
      if (attempt === 1) throw new Error(upstreamMessage(lastError));
      opts.onRetry?.("The model didn't respond — trying once more");
      continue;
    }

    let normalized;
    try {
      normalized = draftToDoc(draft);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt === 1) throw new Error("The AI couldn't produce a usable form. Try rephrasing the request.");
      opts.onRetry?.("The draft came back incomplete — trying once more");
      continue;
    }

    if (!hasErrors(normalized.issues)) {
      return { doc: normalized.doc, issues: normalized.issues, tokens };
    }

    lastError = normalized.issues
      .filter((i) => i.level === "error")
      .map((i) => `${i.path ?? ""}: ${i.message}`)
      .join("\n");
    if (attempt === 1) {
      // Second attempt still has lint errors. The document is structurally
      // valid — it parsed — so the author is better served by a form with a
      // flagged issue in the builder than by nothing at all.
      return { doc: normalized.doc, issues: normalized.issues, tokens };
    }
    opts.onRetry?.("Fixing a problem with the flow");
  }

  throw new Error("The AI couldn't produce a usable form. Try rephrasing the request.");
}

/** Upstream error text is for logs; this is what the author is told. */
function upstreamMessage(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("abort") || lower.includes("timeout") || lower.includes("504")) {
    return "The AI provider timed out. Please try again.";
  }
  if (lower.includes("rate") && lower.includes("limit")) {
    return "The AI provider is rate-limiting us right now. Please try again in a moment.";
  }
  if (lower.includes("credit") || lower.includes("402") || lower.includes("insufficient")) {
    return "The AI provider rejected the request (billing). Please contact support.";
  }
  return "The AI provider failed to respond. Please try again.";
}

aiRouter.post(
  "/ai/generate-form",
  validator("json", GenerateBody),
  describeRoute({
    tags: ["dashboard"],
    summary: "Generate a form document from a natural-language prompt",
    responses: {
      200: {
        description: "Generated FormDoc + lint issues",
        content: {
          "application/json": {
            schema: resolver(z.object({ doc: z.unknown(), issues: z.array(z.any()), tokens: z.number() })),
          },
        },
      },
      502: { description: "Generation failed after retries" },
      503: { description: "AI not configured" },
    },
  }),
  async (c) => {
    if (!c.env.OPENROUTER_API_KEY) {
      return c.json({ error: { code: "ai_not_configured", message: "OPENROUTER_API_KEY is not set" } }, 503);
    }
    const { prompt, questionCount } = c.req.valid("json");

    const research = await researchFor(c.env, prompt);
    try {
      const { doc, issues, tokens } = await generateWithRetry({
        env: c.env,
        prompt,
        questionCount,
        research: research.brief,
      });
      // Consumed only now that a valid document exists. A generation that failed
      // upstream, or produced something unusable, must not spend the allowance.
      const orgId = c.get("orgId");
      if (orgId) {
        await meter(c.env, orgId, "ai_generations");
        const total = tokens + research.tokens;
        if (total > 0) await meter(c.env, orgId, "ai_tokens", total);
      }
      return c.json({ doc, issues, tokens });
    } catch (err) {
      return c.json(
        { error: { code: "generation_failed", message: err instanceof Error ? err.message : "Generation failed" } },
        502,
      );
    }
  },
);

/** Read whatever sites the prompt mentions. Never throws; never blocks for long. */
async function researchFor(
  env: Bindings,
  prompt: string,
): Promise<{ brief: { brief: string; sources: string[] } | null; urls: string[]; tokens: number }> {
  const urls = extractUrls(prompt);
  if (urls.length === 0) return { brief: null, urls, tokens: 0 };
  const sites = await readSites(urls);
  if (sites.length === 0) return { brief: null, urls, tokens: 0 };
  const brief = await researchBrief({ env, request: prompt, sites });
  return { brief: brief ? { brief: brief.brief, sources: brief.sources } : null, urls, tokens: brief?.tokens ?? 0 };
}

// ─── streaming generation ───

/**
 * The same generation, narrated.
 *
 * Two problems with the JSON route above, both felt by the author rather than
 * visible in a log.
 *
 * The first is honesty. Drafting takes tens of seconds, and the dashboard could
 * only show one indefinite spinner labelled "Drafting your form…", which is
 * indistinguishable from a hang — an author reasonably assumed it was broken and
 * reloaded. Every stage here is a real step with a real duration, and questions
 * appear as the model writes them, so the wait shows its work.
 *
 * The second is Cloudflare's edge. A Worker that sends no response headers for
 * 100 seconds has its request terminated with a 524, and the old flow was three
 * sequential requests — generate, create, save — with two model calls inside the
 * first. Streaming flushes headers immediately, so the connection is never idle,
 * and doing all three steps in one request removes two round trips as well.
 */
const streamHeaders = {
  "content-type": "text/event-stream; charset=utf-8",
  // no-transform is what stops an intermediary from buffering the whole
  // response and delivering it at the end, which would undo all of the above.
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
} as const;

/** One stage of the pipeline, as the client renders it. */
type StageId = "reading" | "researching" | "drafting" | "logic" | "saving";

aiRouter.post(
  "/ai/generate-form/stream",
  validator("json", GenerateBody),
  describeRoute({
    tags: ["dashboard"],
    summary: "Generate a form and create it, streaming progress as server-sent events",
    description:
      "Server-sent events: `stage` (a step started or finished), `question` (one drafted question), `sources` (pages read), `done` (the created form), `error`. The form is created and saved server-side, so a `done` event means it exists.",
    responses: {
      200: { description: "text/event-stream" },
      503: { description: "AI not configured" },
    },
  }),
  async (c) => {
    if (!c.env.OPENROUTER_API_KEY) {
      return c.json({ error: { code: "ai_not_configured", message: "OPENROUTER_API_KEY is not set" } }, 503);
    }
    const { prompt, questionCount } = c.req.valid("json");
    const ws = await requireWorkspace(c);
    if (!ws) {
      return c.json({ error: { code: "no_organization", message: "Create an organization first" } }, 403);
    }
    const userId = c.get("userId") as string;
    const orgId = c.get("orgId");

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    let closed = false;

    const send = async (event: string, data: unknown) => {
      if (closed) return;
      try {
        await writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      } catch {
        // The author navigated away or hit cancel. Stop writing; the pipeline
        // below checks `closed` and unwinds.
        closed = true;
      }
    };
    const stage = (id: StageId, status: "start" | "done" | "skip", label?: string) =>
      send("stage", { id, status, label });

    const pipeline = async () => {
      try {
        const urls = extractUrls(prompt);
        let research: { brief: string; sources: string[] } | null = null;
        let researchTokens = 0;

        if (urls.length > 0) {
          await stage("reading", "start", urls.length === 1 ? hostOf(urls[0]!) : `${urls.length} pages`);
          const sites = await readSites(urls);
          await stage("reading", sites.length > 0 ? "done" : "skip");

          if (sites.length > 0) {
            await send("sources", { pages: sites.map((s) => ({ url: s.url, title: s.title })) });
            await stage("researching", "start");
            const brief = await researchBrief({ env: c.env, request: prompt, sites });
            if (brief) {
              research = { brief: brief.brief, sources: brief.sources };
              researchTokens = brief.tokens;
              if (brief.sources.length > 0) {
                await send("sources", { searched: brief.sources.map((u) => ({ url: u, title: hostOf(u) })) });
              }
            }
            await stage("researching", brief ? "done" : "skip");
          } else {
            // The site could not be read — client-rendered, bot-walled, down.
            // Say so rather than implying the questions know about it.
            await stage("researching", "skip");
          }
        } else {
          await stage("reading", "skip");
          await stage("researching", "skip");
        }

        await stage("drafting", "start");
        const { doc, issues, tokens } = await generateWithRetry({
          env: c.env,
          prompt,
          questionCount,
          research,
          onBlock: (b) => {
            // Fire-and-forget: the model is not waiting on the socket, and an
            // author who closed the tab must not stall the generation.
            void send("question", { index: b.index, title: b.title, type: b.type });
          },
          onRetry: (reason) => void send("retry", { reason }),
        });
        await stage("drafting", "done");

        const questions = doc.blocks.filter((b) => b.type !== "welcome" && b.type !== "statement").length;
        const rules = doc.logic.filter((r) => r.action_kind === "goto").length;
        await stage("logic", "start");
        await stage("logic", rules > 0 ? "done" : "skip", rules > 0 ? String(rules) : undefined);

        await stage("saving", "start");
        const id = `frm_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
        const title = doc.title || "AI form";
        const now = Date.now();
        await c.env.DB.prepare(
          `INSERT INTO forms (id, organization_id, workspace_id, created_by, title, slug, status, working_schema, fingerprint_salt, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
        )
          .bind(id, ws.orgId, ws.wsId, userId, title, formSlug(title), JSON.stringify(doc), crypto.randomUUID().slice(0, 16), now, now)
          .run();
        await stage("saving", "done");

        // Metered after the form exists, for the same reason as the JSON route:
        // an allowance should only be spent on something the author can open.
        if (orgId) {
          await meter(c.env, orgId, "ai_generations");
          const total = tokens + researchTokens;
          if (total > 0) await meter(c.env, orgId, "ai_tokens", total);
        }

        await send("done", {
          formId: id,
          title,
          questions,
          rules,
          issues: issues.filter((i) => i.level === "error").length,
        });
      } catch (err) {
        console.error("generate_form_stream_failed", err);
        await send("error", {
          message: err instanceof Error ? err.message : "Generation failed",
        });
      } finally {
        closed = true;
        try {
          await writer.close();
        } catch {
          // Already closed by the client disconnecting.
        }
      }
    };

    // Held open explicitly. The response returns immediately so headers reach
    // the edge inside its window; without waitUntil the runtime is free to
    // consider the request finished and cancel the work still writing to it.
    c.executionCtx.waitUntil(pipeline());

    return new Response(readable, { headers: streamHeaders });
  },
);

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ─── extending an existing form ───

/**
 * "Ask AI to make changes" — an edit to a form that already exists.
 *
 * Was `POST /ai/add-blocks`, and the name was the bug. It could only append,
 * so a request that changed nothing but the routing had no valid answer: the
 * schema demanded at least one new block and this handler returned 502 when
 * none arrived. The model duly padded. Asked to route iPhone users to a plain
 * email question and Android users to their Play Store email — both questions
 * already in the form — it wrote the correct summary, invented "Is there
 * anything else you would like us to know?" to satisfy the schema, and left
 * the old contradicting rule in place beside its new one.
 *
 * An edit can now be entirely about the wiring, and rewiring means replacing.
 */
const EditFormBody = z.object({
  formId: z.string(),
  prompt: z.string().min(3).max(1000),
  /**
   * The builder's AI bar thread, oldest first. Optional so an older client
   * keeps working, but without it the model cannot resolve "also", "it" or
   * "instead" and answers a question nobody asked.
   */
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) }))
    .max(20)
    .default([]),
  /** Accepted and ignored. The pre-rename client sent it; see the alias below. */
  count: z.number().int().min(1).max(10).optional(),
});

/**
 * Both the current path and the one it replaced.
 *
 * `/ai/add-blocks` is kept because renaming it broke a tab that was already
 * open: the browser holds the JavaScript bundle it loaded, so for as long as
 * that tab lives it keeps calling the old path, and the builder's chat answered
 * "Route not found" — a deploy of the server quietly breaking a page nobody
 * reloaded. The alias costs one line and removes the whole class of problem.
 * It can go once no bundle predating the rename is plausibly still running.
 */
for (const path of ["/ai/edit-form", "/ai/add-blocks"] as const) {
  aiRouter.post(
    path,
    validator("json", EditFormBody),
    describeRoute({
      tags: ["dashboard"],
      summary:
        path === "/ai/edit-form"
          ? "AI-edit an existing form: add or remove questions, and rewire the flow"
          : "Deprecated alias of /ai/edit-form, for bundles loaded before the rename",
      deprecated: path !== "/ai/edit-form",
      description:
        "Returns the proposed document without saving it. An edit may add no questions at all — most requests about a working form change the routing.",
      responses: {
        200: {
          description: "The proposed document and what changed",
          content: {
            "application/json": {
              schema: resolver(
                z.object({
                  doc: z.unknown(),
                  added: z.number(),
                  removed: z.number(),
                  rules: z.number(),
                  rewired: z.number(),
                  summary: z.string(),
                  tokens: z.number(),
                }),
              ),
            },
          },
        },
        422: { description: "The model proposed nothing that would change the form" },
        502: { description: "The model failed upstream" },
        503: { description: "AI not configured" },
      },
    }),
    async (c) => {
      if (!c.env.OPENROUTER_API_KEY) {
        return c.json({ error: { code: "ai_not_configured", message: "OPENROUTER_API_KEY is not set" } }, 503);
      }
      const { formId, prompt, history } = c.req.valid("json");
      // formId arrives in the body, so path middleware cannot guard it — check here.
      const form = await assertFormAccess(c, formId);
      if (!form) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);
      const row = await c.env.DB.prepare(`SELECT working_schema FROM forms WHERE id = ? AND deleted_at IS NULL`)
        .bind(formId)
        .first<{ working_schema: string }>();
      if (!row) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);
      const doc = FormDoc.parse(migrateFormDoc(JSON.parse(row.working_schema)));

      // The model call is a network call to a third party, and it fails: two 504s
      // from OpenRouter in one afternoon while this was being written. Uncaught,
      // it reached the app's error handler and the builder's chat printed
      // "Internal server error" into the thread — which reads as a bug in
      // chatform and tells the author nothing about what to do next.
      let draft, tokens;
      try {
        const result = await generateEdit({
          env: c.env,
          prompt: buildEditPrompt(doc, prompt, history as BuilderTurn[]),
        });
        draft = result.draft;
        tokens = result.tokens;
      } catch (err) {
        console.error("edit_form_failed", err);
        const message = err instanceof Error ? err.message : String(err);
        return c.json({ error: { code: "generation_failed", message: upstreamMessage(message) } }, 502);
      }

      // ─── removals first, so a ref freed here can be reused below ───
      const removable = new Set(
        doc.blocks
          .filter((b) => b.type !== "welcome")
          .map((b) => b.ref),
      );
      const removed = draft.removeRefs.filter((ref) => removable.has(ref));
      if (removed.length > 0) {
        const gone = new Set(removed);
        doc.blocks = doc.blocks.filter((b) => !gone.has(b.ref));
        // A rule pointing at, or hanging off, a question that no longer exists is
        // a dead end rather than a route.
        doc.logic = doc.logic.filter(
          (r) => !(r.action_kind === "goto" && ((r.from && gone.has(r.from)) || ((r.targetKind ?? "block") === "block" && gone.has(r.target)))),
        );
      }

      // ─── additions, each where the model asked for it ───
      // Resolving against the list as it grows lets one new block follow another.
      // Appending everything to the end — which is all this route used to do —
      // puts the arms of a condition below the questions they should skip.
      const existingRefs = new Set(doc.blocks.map((b) => b.ref));
      const { blocks: proposed, optionIdsByRef, renamed } = normalizeEditBlocks(draft, existingRefs);

      const added: Block[] = [];
      for (const { block, insertAfter } of proposed) {
        const anchor = renamed.get(insertAfter) ?? insertAfter;
        const at = anchor ? doc.blocks.findIndex((x) => x.ref === anchor) : -1;
        if (at >= 0) doc.blocks.splice(at + 1, 0, block);
        else doc.blocks.push(block);
        added.push(block);
      }

      // Option ids for questions that were already here come from the form
      // itself; only the new ones come from this draft.
      for (const b of doc.blocks) {
        if (optionIdsByRef.has(b.ref)) continue;
        if ("options" in b && Array.isArray(b.options)) {
          optionIdsByRef.set(
            b.ref,
            new Map((b.options as { id: string; label: string }[]).map((o) => [o.label.toLowerCase(), o.id])),
          );
        }
      }

      const branches = resolveBranches(
        draft.branches.map((br) => ({
          ...br,
          whenRef: renamed.get(br.whenRef) ?? br.whenRef,
          then: renamed.get(br.then) ?? br.then,
        })),
        doc.blocks,
        optionIdsByRef,
      );
      const priorGotos = doc.logic.filter((r) => r.action_kind === "goto");
      const newRules = buildFlowRules(branches, doc.blocks, doc.endings.map((e) => e.ref), priorGotos);

      /**
       * Replacement is per ANSWER, not per question.
       *
       * The first version of this dropped every existing branch from any question
       * the model listed in `rewireRefs`, on the reasoning that its new branches
       * were then the whole truth. They are not reliably the whole truth: asked
       * to send Chrome users straight to the ending, the model rewired
       * `q_platform` and restated two of its three options — so the Android route
       * was deleted and iOS was quietly pointed at the wrong question. A model
       * that forgets one arm should cost that arm nothing.
       *
       * So an old rule is dropped only when a new rule speaks about exactly the
       * same question and the same condition. Anything the edit did not mention
       * keeps working.
       */
      const conditionKey = (from: string | null | undefined, when: unknown): string => {
        const conditions = (when as { conditions?: unknown[] } | undefined)?.conditions ?? [];
        return `${from ?? ""}\u0000${JSON.stringify(conditions)}`;
      };
      const replaced = new Set(newRules.map((r) => conditionKey(r.action_kind === "goto" ? r.from : null, r.when)));
      const supersededCount = doc.logic.filter(
        (r) => r.action_kind === "goto" && replaced.has(conditionKey(r.from, r.when)),
      ).length;
      if (newRules.length > 0) {
        const kept = doc.logic.filter(
          (r) => !(r.action_kind === "goto" && replaced.has(conditionKey(r.from, r.when))),
        );
        doc.logic = FormDoc.parse({ ...doc, logic: [...kept, ...newRules] }).logic;
      }
      const rewired = supersededCount;

      // An edit has to change something. This replaces the old "no new blocks"
      // rejection, which is what forced the model to invent one: a routing-only
      // edit is now a complete answer, and only an edit that touches nothing at
      // all is worth telling the builder about.
      if (added.length === 0 && removed.length === 0 && newRules.length === 0) {
        return c.json(
          {
            error: {
              code: "no_change",
              message: draft.summary?.trim()
                ? `Nothing to change — ${draft.summary.trim()}`
                : "That already looks the way you described. Try describing the change differently.",
            },
          },
          422,
        );
      }

      // Deliberately not persisted. The builder reviews the proposal and
      // applies it, and applying is what saves — so declining leaves the form
      // exactly as it was. Writing here meant a rejected suggestion was already
      // in the database, and the client's own copy then had to fight it.
      const issues = lintFormDoc(doc);
      const orgId = c.get("orgId");
      if (orgId) {
        await meter(c.env, orgId, "ai_generations");
        if (tokens > 0) await meter(c.env, orgId, "ai_tokens", tokens);
      }
      return c.json({
        doc,
        added: added.length,
        addedRefs: added.map((b) => b.ref),
        removed: removed.length,
        removedRefs: removed,
        rules: newRules.length,
        rewired,
        summary: draft.summary,
        tokens,
        issues,
      });
    },
  );
}
