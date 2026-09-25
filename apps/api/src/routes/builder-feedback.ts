import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import {
  BUILDER_FEEDBACK_AREA_KEYS,
  BUILDER_FEEDBACK_IMAGE_TYPES,
  BUILDER_FEEDBACK_KIND_KEYS,
  BUILDER_FEEDBACK_MAX_IMAGES,
  BUILDER_FEEDBACK_MAX_IMAGE_BYTES,
  BUILDER_FEEDBACK_TEXT_MAX,
  BUG_SEVERITIES,
  FEATURE_IMPORTANCE,
} from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { requireSession, requireOrg, type GuardVars } from "../lib/guards.js";
import { describeSchemaError } from "../lib/api-error.js";
import {
  BUILDER_FEEDBACK_DAILY_CAP,
  builderAttachmentKey,
  builderFeedbackSentToday,
  newBuilderFeedbackId,
  type BuilderAttachment,
} from "../lib/builder-feedback.js";
import { enqueueBuilderFeedbackTriage } from "../lib/feedback-triage.js";

/**
 * "?" → Report a bug / Request a feature / Share feedback, from anywhere in the
 * dashboard or the builder.
 *
 * One multipart request carrying the report and its images, so the founders'
 * mail is only queued once everything it points at is stored. The respondent
 * report does it in two requests because its snapshot is optional evidence; here
 * the screenshot is often the whole report ("this is what I see").
 *
 * Dashboard-only on purpose (see `DASHBOARD_ONLY` in the spec coverage check):
 * it is a person talking to us, not something an integration does.
 */
export const builderFeedbackRouter = new Hono<{ Bindings: Bindings; Variables: Partial<GuardVars> }>();

builderFeedbackRouter.use("/feedback", requireSession);
builderFeedbackRouter.use("/feedback", requireOrg);

const text = (max = BUILDER_FEEDBACK_TEXT_MAX) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max.toLocaleString()} characters.`)
    .optional()
    .transform((v) => (v ? v : null));

/**
 * What the panel sends as the `payload` part.
 *
 * Context is taken as the browser describes it and bounded rather than modelled:
 * it is printed to an admin, never queried, and a strict shape would turn a new
 * field in the panel into a rejected report.
 */
export const BuilderFeedbackPayload = z
  .object({
    kind: z.enum(BUILDER_FEEDBACK_KIND_KEYS),
    area: z.enum(BUILDER_FEEDBACK_AREA_KEYS).optional(),
    rating: z.number().int().min(1).max(5).optional(),
    severity: z.string().max(20).optional(),
    message: z.string().trim().min(1, "Tell us a little about it.").max(BUILDER_FEEDBACK_TEXT_MAX),
    steps: text(),
    expected: text(),
    why: text(),
    url: z.string().max(2000).optional(),
    formId: z.string().max(64).optional(),
    workspaceId: z.string().max(64).optional(),
    /** Which of the uploaded images, by position, the panel captured itself. */
    autoScreenshot: z.number().int().min(0).max(BUILDER_FEEDBACK_MAX_IMAGES).optional(),
    context: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "feedback" && v.rating === undefined) {
      ctx.addIssue({ code: "custom", path: ["rating"], message: "Pick a face." });
    }
    if (v.severity !== undefined) {
      const allowed = v.kind === "bug" ? BUG_SEVERITIES : v.kind === "feature" ? FEATURE_IMPORTANCE : {};
      if (!(v.severity in allowed)) ctx.addIssue({ code: "custom", path: ["severity"], message: "Unknown severity." });
    }
  });

/** Printed in the console, so bounded: a runaway error loop must not become a 1 MB row. */
const CONTEXT_MAX_CHARS = 16 * 1024;

const bad = (message: string, code = "invalid") => ({ error: { code, message } });

builderFeedbackRouter.post(
  "/feedback",
  describeRoute({
    tags: ["dashboard"],
    summary: "Send the chatform team a bug report, feature request or feedback",
    description:
      "multipart/form-data: a `payload` part (JSON) and up to five `images`. Emailed to the team and filed in the platform console.",
    responses: {
      200: {
        description: "Received",
        content: { "application/json": { schema: resolver(z.object({ ok: z.boolean(), id: z.string() })) } },
      },
      400: { description: "Invalid payload or image" },
      413: { description: "An image is too large" },
      429: { description: "Daily limit reached" },
    },
  }),
  async (c) => {
    const userId = c.get("userId")!;
    const orgId = c.get("orgId")!;

    // Five images at their limit plus the text. Checked before the body is read.
    if (Number(c.req.header("content-length") ?? 0) > (BUILDER_FEEDBACK_MAX_IMAGES + 1) * BUILDER_FEEDBACK_MAX_IMAGE_BYTES) {
      return c.json(bad("That report is too large.", "too_large"), 413);
    }

    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      return c.json(bad("Expected multipart/form-data."), 400);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(String(form.get("payload") ?? ""));
    } catch {
      return c.json(bad("The payload part is not JSON."), 400);
    }
    const parsed = BuilderFeedbackPayload.safeParse(raw);
    if (!parsed.success) {
      const described = describeSchemaError(parsed.error);
      return c.json({ error: { code: "invalid", ...described } }, 400);
    }
    const body = parsed.data;

    const images = form.getAll("images").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
    if (images.length > BUILDER_FEEDBACK_MAX_IMAGES) {
      return c.json(bad(`Attach up to ${BUILDER_FEEDBACK_MAX_IMAGES} images.`), 400);
    }
    for (const image of images) {
      if (!(BUILDER_FEEDBACK_IMAGE_TYPES as readonly string[]).includes(image.type)) {
        return c.json(bad("Images must be PNG, JPEG, WebP or GIF."), 400);
      }
      if (image.size === 0 || image.size > BUILDER_FEEDBACK_MAX_IMAGE_BYTES) {
        return c.json(bad("Each image must be under 5 MB.", "too_large"), 413);
      }
    }

    if ((await builderFeedbackSentToday(c.env, userId)) >= BUILDER_FEEDBACK_DAILY_CAP) {
      return c.json(
        bad(
          `You've sent ${BUILDER_FEEDBACK_DAILY_CAP} reports today. Thank you! Email us if it can't wait until tomorrow.`,
          "feedback_capped",
        ),
        429,
      );
    }

    /*
      Who, where and on what plan, read here rather than trusted from the page:
      the page only knows what it rendered, and "a Business owner asked for this"
      has to be true.
    */
    const who = await c.env.DB.prepare(
      `SELECT u.email, u.name,
              (SELECT m.role FROM members m WHERE m.organization_id = ?2 AND m.user_id = u.id) AS role,
              (SELECT s.plan_id FROM subscriptions s WHERE s.organization_id = ?2
                ORDER BY CASE s.status WHEN 'active' THEN 0 WHEN 'trialing' THEN 1 ELSE 2 END, s.created_at DESC
                LIMIT 1) AS plan_id,
              (SELECT f.id FROM forms f WHERE f.id = ?3 AND f.organization_id = ?2) AS form_id,
              (SELECT w.id FROM workspaces w WHERE w.id = ?4 AND w.organization_id = ?2) AS workspace_id
         FROM users u WHERE u.id = ?1`,
    )
      .bind(userId, orgId, body.formId ?? null, body.workspaceId ?? null)
      .first<{
        email: string | null;
        name: string | null;
        role: string | null;
        plan_id: string | null;
        form_id: string | null;
        workspace_id: string | null;
      }>();

    const id = newBuilderFeedbackId();
    const attachments: BuilderAttachment[] = [];
    for (const [n, image] of images.entries()) {
      const key = builderAttachmentKey(orgId, id, n, image.type);
      await c.env.R2.put(key, await image.arrayBuffer(), { httpMetadata: { contentType: image.type } });
      attachments.push({ key, bytes: image.size, type: image.type, auto: body.autoScreenshot === n });
    }

    let context = body.context ? JSON.stringify(body.context) : null;
    if (context && context.length > CONTEXT_MAX_CHARS) {
      // Keep it parseable: drop the error list first, which is what grows.
      const { errors: _dropped, ...rest } = body.context as Record<string, unknown>;
      context = JSON.stringify({ ...rest, truncated: true }).slice(0, CONTEXT_MAX_CHARS);
    }

    await c.env.DB.prepare(
      `INSERT INTO builder_feedback
         (id, user_id, user_email, user_name, organization_id, workspace_id, plan_id, role, impersonator_email,
          kind, area, rating, severity, message, steps, expected, why, url, form_id, context_json, user_agent,
          attachments_json, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23)`,
    )
      .bind(
        id,
        userId,
        who?.email ?? null,
        who?.name ?? null,
        orgId,
        who?.workspace_id ?? null,
        who?.plan_id ?? "free",
        who?.role ?? null,
        c.get("impersonatorEmail") ?? null,
        body.kind,
        body.area ?? null,
        body.kind === "feedback" ? (body.rating ?? null) : null,
        body.kind === "feedback" ? null : (body.severity ?? null),
        body.message,
        body.kind === "bug" ? body.steps : null,
        body.kind === "bug" ? body.expected : null,
        body.kind === "feature" ? body.why : null,
        body.url ?? null,
        who?.form_id ?? null,
        context,
        c.req.header("user-agent") ?? null,
        attachments.length ? JSON.stringify(attachments) : null,
        Date.now(),
      )
      .run();

    // Queued, never inline: the person is told it arrived the moment the row exists.
    await enqueueBuilderFeedbackTriage(c.env, id);
    return c.json({ ok: true, id });
  },
);
