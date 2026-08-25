import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import { FormDoc } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { createAuth } from "../lib/auth.js";

export const templatesRouter = new Hono<{ Bindings: Bindings; Variables: { userId: string } }>();

const SEEDS: { slug: string; title: string; category: string; description: string; doc: FormDoc }[] = [
  {
    slug: "lead-capture", title: "Lead Capture", category: "Business",
    description: "Qualify visitors and collect contact details conversationally.",
    doc: FormDoc.parse({
      title: "Lead Capture", blocks: [
        { id: "blk_t1", ref: "welcome", type: "welcome", title: "Hey! Interested in what we do?", required: false },
        { id: "blk_t2", ref: "q_name", type: "short_text", title: "What's your name?", required: true },
        { id: "blk_t3", ref: "q_email", type: "email", title: "Best email to reach you?", required: true },
        { id: "blk_t4", ref: "q_company", type: "short_text", title: "Where do you work?", required: false },
        { id: "blk_t5", ref: "q_team_size", type: "single_select", title: "Team size?", required: true, options: [
          { id: "opt_1to10", label: "1-10" }, { id: "opt_11to50", label: "11-50" }, { id: "opt_50plus", label: "50+" }] },
      ],
      endings: [{ id: "end_t1", ref: "end_thanks", title: "Talk soon! 🤝", bodyMd: "We'll reach out within a day." }],
    }),
  },
  {
    slug: "nps-survey", title: "NPS Survey", category: "Product",
    description: "Measure loyalty with a standard NPS question and follow-up.",
    doc: FormDoc.parse({
      title: "NPS Survey", blocks: [
        { id: "blk_n1", ref: "welcome", type: "welcome", title: "One quick question — it takes 20 seconds.", required: false },
        { id: "blk_n2", ref: "q_nps", type: "nps", title: "How likely are you to recommend us to a friend?", required: true },
        { id: "blk_n3", ref: "q_reason", type: "long_text", title: "What's the main reason for your score?", required: false },
      ],
      endings: [{ id: "end_n1", ref: "end_thanks", title: "Thank you 💛", bodyMd: "Your feedback shapes what we build next." }],
    }),
  },
  {
    slug: "event-rsvp", title: "Event RSVP", category: "Events",
    description: "Collect RSVPs with plus-ones and dietary notes.",
    doc: FormDoc.parse({
      title: "Event RSVP", blocks: [
        { id: "blk_e1", ref: "welcome", type: "welcome", title: "You're invited! 🎉 Shall we?", required: false },
        { id: "blk_e2", ref: "q_name", type: "short_text", title: "Your full name?", required: true },
        { id: "blk_e3", ref: "q_attending", type: "yes_no", title: "Will you be attending?", required: true },
        { id: "blk_e4", ref: "q_guests", type: "number", title: "How many guests are you bringing?", required: false },
        { id: "blk_e5", ref: "q_notes", type: "long_text", title: "Any dietary requirements or notes?", required: false },
      ],
      endings: [{ id: "end_e1", ref: "end_thanks", title: "See you there! 🥂", bodyMd: "" }],
    }),
  },
  {
    slug: "job-application", title: "Job Application", category: "HR",
    description: "Screen candidates with experience, links and a cover note.",
    doc: FormDoc.parse({
      title: "Job Application", blocks: [
        { id: "blk_j1", ref: "welcome", type: "welcome", title: "Excited that you want to join us! Let's start.", required: false },
        { id: "blk_j2", ref: "q_name", type: "short_text", title: "Full name?", required: true },
        { id: "blk_j3", ref: "q_email", type: "email", title: "Email address?", required: true },
        { id: "blk_j4", ref: "q_role", type: "single_select", title: "Which role are you applying for?", required: true, options: [
          { id: "opt_eng", label: "Engineer" }, { id: "opt_des", label: "Designer" }, { id: "opt_pm", label: "Product" }] },
        { id: "blk_j5", ref: "q_portfolio", type: "url", title: "Link your portfolio or LinkedIn", required: false },
        { id: "blk_j6", ref: "q_why", type: "long_text", title: "Why do you want to work with us?", required: true },
      ],
      endings: [{ id: "end_j1", ref: "end_thanks", title: "Application received 🚀", bodyMd: "We review every application within a week." }],
    }),
  },
];

templatesRouter.get(
  "/templates",
  describeRoute({ tags: ["dashboard"], summary: "List official templates", responses: { 200: { description: "Templates", content: { "application/json": { schema: resolver(z.array(z.object({ slug: z.string(), title: z.string(), category: z.string(), description: z.string() }))) } } } } }),
  async (c) => c.json(SEEDS.map(({ slug, title, category, description }) => ({ slug, title, category, description }))),
);

templatesRouter.post(
  "/templates/:slug/use",
  describeRoute({ tags: ["dashboard"], summary: "Create a form from a template", responses: { 200: { description: "Form id" } } }),
  async (c) => {
    const slug = c.req.param("slug");
    const tpl = SEEDS.find((t) => t.slug === slug);
    if (!tpl) return c.json({ error: { code: "not_found", message: "Template not found" } }, 404);
    const auth = createAuth(c.env);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: { code: "unauthorized", message: "Sign in required" } }, 401);
    const userId = session.user.id;
    const orgs = await auth.api.listOrganizations({ headers: c.req.raw.headers });
    const orgId = orgs?.[0]?.id;
    if (!orgId) return c.json({ error: { code: "no_organization", message: "Create an organization first" } }, 403);
    let ws = await c.env.DB.prepare(`SELECT id FROM workspaces WHERE organization_id = ? ORDER BY created_at LIMIT 1`).bind(orgId).first<{ id: string }>();
    if (!ws) {
      const wsId = `ws_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
      await c.env.DB.prepare(`INSERT INTO workspaces (id, organization_id, name, slug, created_by, created_at) VALUES (?, ?, 'Default', 'default', ?, ?)`)
        .bind(wsId, orgId, userId, Date.now()).run();
      ws = { id: wsId };
    }
    const id = `frm_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const slugOut = `${tpl.slug}-${crypto.randomUUID().slice(0, 6)}`;
    await c.env.DB.prepare(
      `INSERT INTO forms (id, organization_id, workspace_id, created_by, title, slug, status, working_schema, fingerprint_salt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
    )
      .bind(id, orgId, ws.id, userId, tpl.title, slugOut, JSON.stringify(tpl.doc), crypto.randomUUID().slice(0, 16), Date.now(), Date.now())
      .run();
    return c.json({ id, slug: slugOut, title: tpl.title });
  },
);
