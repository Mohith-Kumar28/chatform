import { Hono, type Context } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import { FormDoc } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { validator } from "../lib/validator.js";
import { getAuth, requireOrg, requireSession, type GuardVars } from "../lib/guards.js";
import { assertPermission, requireGauge, requirePermission, type AuthzVars } from "../lib/authorize.js";
import { getEntitlements, storageBytes } from "../lib/entitlements.js";
import { rehostImages } from "../lib/import/rehost.js";
import { publishForm } from "../lib/forms-service.js";
import { enqueueMail } from "../lib/mail.js";
import { withOwnerNotification } from "../lib/owner-notification.js";
import { formSlug, requireWorkspace } from "../lib/workspace.js";
import { convertImport } from "../lib/import/phrase.js";
import { IMPORT_TRIAL_ORG, IMPORT_TRIAL_WORKSPACE, ImportError, type ImportReport } from "../lib/import/types.js";
import { quotaKey, remainingImports, spendImport } from "../lib/import-quota.js";

/**
 * Bringing a form over from Typeform, Google Forms or Tally.
 *
 * Three doors, one conversion (`lib/import/`), and no model call in any of
 * them: the questions, options and jumps are read and converted by code, so
 * an import is exact where the source is exact and costs nothing to run.
 *
 * - `POST /api/import/preview` is public. The marketing page's converter:
 *   anyone can paste a link and talk to the result before having an account.
 *   The form is published in the system trial organization and handed back
 *   with a token. Signed-out visitors get `DEVICE_DAILY_LIMIT` a day.
 * - `POST /api/import/claim` is that token, after sign-in: the trial is copied
 *   into the person's own workspace as a draft they own.
 * - `POST /api/import/forms` is the dashboard's New form dialog: straight into
 *   the workspace, no trial.
 */

const TRIAL_TTL_MS = 24 * 60 * 60 * 1000;

type Vars = Partial<AuthzVars & GuardVars>;
type ImportCtx = Context<{ Bindings: Bindings; Variables: Vars }>;

export const importRouter = new Hono<{ Bindings: Bindings; Variables: Vars }>();

// Session-only doors. Scoped to their own paths: this router is mounted ahead of
// the others precisely so that `/import/preview` is reachable signed out.
importRouter.use("/import/claim", requireSession, requireOrg);
importRouter.use("/import/forms", requireSession, requireOrg);
importRouter.post("/import/claim", requirePermission("form", "create"), requireGauge("forms_count", "forms.create"));
importRouter.post("/import/forms", requirePermission("form", "create"), requireGauge("forms_count", "forms.create"));

const Url = z.string().trim().min(4).max(2000);

export const ImportReportSchema = z.object({
  provider: z.enum(["typeform", "google_forms", "tally", "jotform", "youform", "website"]),
  sourceUrl: z.string(),
  questions: z.number(),
  branches: z.number(),
  endings: z.number(),
  notCopied: z.array(z.string()),
  closed: z.boolean(),
  outline: z.array(z.object({ title: z.string(), type: z.string(), required: z.boolean() })),
});

const ImportErrorEnvelope = z.object({
  error: z.object({ code: z.string(), message: z.string(), remaining: z.number().optional() }),
});

function importFailed(c: ImportCtx, err: unknown) {
  if (err instanceof ImportError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.code === "unreachable" ? 502 : 422);
  }
  console.error("import_failed", { message: err instanceof Error ? err.message : String(err) });
  return c.json({ error: { code: "import_failed", message: "We couldn't convert that form. Try again, or start from a blank form." } }, 500);
}

const newFormId = () => `frm_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

async function insertForm(
  env: Bindings,
  args: { orgId: string; wsId: string; userId: string | null; doc: FormDoc },
): Promise<string> {
  const id = newFormId();
  const now = Date.now();
  const title = (args.doc.title || "Imported form").slice(0, 200);
  const doc = args.userId ? await withOwnerNotification(env.DB, args.userId, args.doc) : args.doc;
  await env.DB.prepare(
    `INSERT INTO forms (id, organization_id, workspace_id, created_by, title, slug, status, working_schema, fingerprint_salt, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
  )
    .bind(id, args.orgId, args.wsId, args.userId, title, formSlug(title), JSON.stringify(doc), crypto.randomUUID().slice(0, 16), now, now)
    .run();
  return id;
}

// ─── the public converter ───

export const PreviewBody = z.object({
  url: Url,
  /** The visitor's FingerprintJS id, from `getRespondentSignal()`. Hashed before it is stored. */
  deviceSignal: z.string().max(200).optional(),
});

importRouter.post(
  "/import/preview",
  validator("json", PreviewBody),
  describeRoute({
    tags: ["dashboard"],
    summary: "Convert a public Typeform, Google Form or Tally form into a live trial form",
    description:
      "Public. Reads the form behind the link, converts it, and publishes it in a trial account for 24 hours so the visitor can talk to it. " +
      "Returns a token that `POST /api/import/claim` exchanges for a copy in the visitor's own workspace once they sign in. " +
      "Signed-out visitors get three conversions a day.",
    responses: {
      200: {
        description: "The trial form and what was copied",
        content: {
          "application/json": {
            schema: resolver(
              z.object({ token: z.string(), slug: z.string(), report: ImportReportSchema, remaining: z.number().nullable() }),
            ),
          },
        },
      },
      422: { description: "The link cannot be imported, with the reason", content: { "application/json": { schema: resolver(ImportErrorEnvelope) } } },
      429: { description: "Today's free conversions are used up", content: { "application/json": { schema: resolver(ImportErrorEnvelope) } } },
    },
  }),
  async (c) => {
    const { url, deviceSignal } = c.req.valid("json");
    // Signed in, the daily cap does not apply; their account is who it is.
    const session = await getAuth(c.env)
      .api.getSession({ headers: c.req.raw.headers })
      .catch(() => null);
    // Counted by the device alone, never by address. A signed-out browser that
    // sent no device id cannot be counted, so it is asked to sign in instead.
    const key = session ? null : await quotaKey(c.env, deviceSignal);
    if (!session && !key) {
      return c.json(
        {
          error: {
            code: "device_required",
            message: "We couldn't start a free conversion in this browser. Sign up free to import your form straight into the builder.",
            remaining: 0,
          },
        },
        429,
      );
    }
    if (key) {
      const left = await remainingImports(c.env, key);
      if (left <= 0) {
        return c.json(
          {
            error: {
              code: "import_limit",
              message: "You've used today's 3 free conversions. Sign up free to import as many forms as you like.",
              remaining: 0,
            },
          },
          429,
        );
      }
    }

    let converted: Awaited<ReturnType<typeof convertImport>>;
    try {
      converted = await convertImport(c.env, url, IMPORT_TRIAL_ORG);
    } catch (err) {
      return importFailed(c, err);
    }

    // Images come with the form, copied into our storage so they outlive the source.
    const hosted = await rehostImages(c.env, converted.doc, { orgId: IMPORT_TRIAL_ORG, apiOrigin: new URL(c.req.url).origin });
    const formId = await insertForm(c.env, { orgId: IMPORT_TRIAL_ORG, wsId: IMPORT_TRIAL_WORKSPACE, userId: null, doc: hosted.doc });
    const published = await publishForm(c.env, {
      formId,
      userId: null,
      ent: await getEntitlements(c.env, IMPORT_TRIAL_ORG),
      orgId: IMPORT_TRIAL_ORG,
      source: "api",
    });
    if (!published.ok) {
      console.error("import_trial_publish_failed", { formId, status: published.status, body: JSON.stringify(published.body).slice(0, 500) });
      await c.env.DB.prepare(`UPDATE forms SET deleted_at = ? WHERE id = ?`).bind(Date.now(), formId).run();
      return c.json(
        { error: { code: "import_failed", message: "We copied the form but couldn't build a working preview. Sign in to import it straight into the builder." } },
        422,
      );
    }

    const token = `imp_${crypto.randomUUID().replace(/-/g, "")}`;
    const now = Date.now();
    await c.env.DB.prepare(
      `INSERT INTO import_trials (token, form_id, provider, source_url, report_json, device_hash, ip_hash, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(token, formId, converted.report.provider, converted.report.sourceUrl.slice(0, 2000), JSON.stringify(converted.report), key, null, now, now + TRIAL_TTL_MS)
      .run();
    if (key) await spendImport(c.env, key);

    const slug = await c.env.DB.prepare(`SELECT slug FROM forms WHERE id = ?`).bind(formId).first<{ slug: string }>();
    const remaining = key ? await remainingImports(c.env, key) : null;
    console.log("import_preview", { provider: converted.report.provider, questions: converted.report.questions, signedIn: !!session });
    return c.json({ token, slug: slug!.slug, report: converted.report, remaining });
  },
);

// ─── claiming a trial ───

export const ClaimBody = z.object({
  token: z.string().min(8).max(100),
  /** The workspace to create into, a slug or an id. Omitted: the organization's first. */
  workspaceId: z.string().optional(),
});

importRouter.post(
  "/import/claim",
  validator("json", ClaimBody),
  describeRoute({
    tags: ["dashboard"],
    summary: "Copy an imported trial form into your workspace",
    responses: {
      200: {
        description: "The new form in your workspace",
        content: { "application/json": { schema: resolver(z.object({ formId: z.string(), report: ImportReportSchema })) } },
      },
      404: { description: "No such trial, or it expired" },
      409: { description: "Someone else already claimed it" },
    },
  }),
  async (c) => {
    const { token, workspaceId } = c.req.valid("json");
    const userId = c.get("userId") as string;
    const trial = await c.env.DB.prepare(
      `SELECT t.form_id, t.report_json, t.claimed_by, t.claimed_form_id, t.expires_at, f.working_schema
         FROM import_trials t JOIN forms f ON f.id = t.form_id
        WHERE t.token = ?`,
    )
      .bind(token)
      .first<{ form_id: string; report_json: string; claimed_by: string | null; claimed_form_id: string | null; expires_at: number; working_schema: string }>();
    if (!trial) return c.json({ error: { code: "not_found", message: "That import has expired. Paste the link again to convert it." } }, 404);
    const report = JSON.parse(trial.report_json) as ImportReport;

    // A reload of the claim page, or a second tab: hand back the same form.
    if (trial.claimed_by) {
      if (trial.claimed_by === userId && trial.claimed_form_id) return c.json({ formId: trial.claimed_form_id, report });
      return c.json({ error: { code: "already_claimed", message: "This import was already added to another account." } }, 409);
    }
    // A little grace past the cron's day: someone who converted, then signed up
    // over lunch, still gets their form while the row exists.
    if (trial.expires_at + 6 * 60 * 60 * 1000 < Date.now()) {
      return c.json({ error: { code: "not_found", message: "That import has expired. Paste the link again to convert it." } }, 404);
    }

    const ws = await requireWorkspace(c, workspaceId);
    if (!ws) return c.json({ error: { code: "no_workspace", message: "No workspace to add it to" } }, ws === undefined ? 404 : 403);
    const denied = await assertPermission(c, "form", "create", { workspaceId: ws.wsId });
    if (denied) return denied;

    const doc = FormDoc.parse(JSON.parse(trial.working_schema));
    const formId = await insertForm(c.env, { orgId: ws.orgId, wsId: ws.wsId, userId, doc });
    // Conditional on still being unclaimed, so two tabs racing produce one owner.
    const won = await c.env.DB.prepare(
      `UPDATE import_trials SET claimed_by = ?, claimed_form_id = ? WHERE token = ? AND claimed_by IS NULL`,
    )
      .bind(userId, formId, token)
      .run();
    if ((won.meta?.changes ?? 0) === 0) {
      await c.env.DB.prepare(`DELETE FROM forms WHERE id = ?`).bind(formId).run();
      const again = await c.env.DB.prepare(`SELECT claimed_by, claimed_form_id FROM import_trials WHERE token = ?`)
        .bind(token)
        .first<{ claimed_by: string | null; claimed_form_id: string | null }>();
      if (again?.claimed_by === userId && again.claimed_form_id) return c.json({ formId: again.claimed_form_id, report });
      return c.json({ error: { code: "already_claimed", message: "This import was already added to another account." } }, 409);
    }
    await enqueueMail(c.env, { kind: "admin_new_form", formId, source: "import" });
    return c.json({ formId, report });
  },
);

// ─── straight from the dashboard ───

export const ImportFormBody = z.object({
  url: Url,
  workspaceId: z.string().optional(),
});

importRouter.post(
  "/import/forms",
  validator("json", ImportFormBody),
  describeRoute({
    tags: ["dashboard"],
    summary: "Import a Typeform, Google Form or Tally form into a workspace",
    responses: {
      200: {
        description: "The new form and what was copied",
        content: { "application/json": { schema: resolver(z.object({ formId: z.string(), report: ImportReportSchema })) } },
      },
      422: { description: "The link cannot be imported, with the reason", content: { "application/json": { schema: resolver(ImportErrorEnvelope) } } },
    },
  }),
  async (c) => {
    const { url, workspaceId } = c.req.valid("json");
    const userId = c.get("userId") as string;
    const ws = await requireWorkspace(c, workspaceId);
    if (!ws) return c.json({ error: { code: "no_workspace", message: "No workspace to add it to" } }, ws === undefined ? 404 : 403);
    const denied = await assertPermission(c, "form", "create", { workspaceId: ws.wsId });
    if (denied) return denied;
    let converted: Awaited<ReturnType<typeof convertImport>>;
    try {
      converted = await convertImport(c.env, url, ws.orgId);
    } catch (err) {
      return importFailed(c, err);
    }
    // Within the plan's file storage: images past it keep their original links.
    const quota = (await getEntitlements(c.env, ws.orgId)).limits.file_storage_mb;
    const budgetBytes = quota == null ? null : Math.max(0, quota * 1024 * 1024 - (await storageBytes(c.env, ws.orgId)));
    const hosted = await rehostImages(c.env, converted.doc, { orgId: ws.orgId, apiOrigin: new URL(c.req.url).origin, budgetBytes });
    const formId = await insertForm(c.env, { orgId: ws.orgId, wsId: ws.wsId, userId, doc: hosted.doc });
    await enqueueMail(c.env, { kind: "admin_new_form", formId, source: "import" });
    console.log("import_form", { provider: converted.report.provider, questions: converted.report.questions });
    return c.json({ formId, report: converted.report });
  },
);

/**
 * Trials nobody claimed, a day on. Soft-deleted like any form (the chat
 * runtime and every listing already skip `deleted_at`), and the ticket goes.
 */
export async function expireImportTrials(env: Bindings, now = Date.now()): Promise<number> {
  const cutoff = now - 6 * 60 * 60 * 1000;
  const due = await env.DB.prepare(`SELECT token, form_id FROM import_trials WHERE expires_at < ? LIMIT 200`)
    .bind(cutoff)
    .all<{ token: string; form_id: string }>();
  const rows = due.results ?? [];
  if (rows.length === 0) return 0;
  await env.DB.batch([
    ...rows.map((r) => env.DB.prepare(`UPDATE forms SET deleted_at = ? WHERE id = ? AND organization_id = ? AND deleted_at IS NULL`).bind(now, r.form_id, IMPORT_TRIAL_ORG)),
    ...rows.map((r) => env.DB.prepare(`DELETE FROM import_trials WHERE token = ?`).bind(r.token)),
  ]);
  // Old day counters are useless once the day is over.
  await env.DB.prepare(`DELETE FROM import_quota WHERE day < ?`).bind(new Date(now - 2 * 86_400_000).toISOString().slice(0, 10)).run();
  return rows.length;
}
