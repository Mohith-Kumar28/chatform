import { Hono, type Context } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { validator } from "../lib/validator.js";
import { z } from "zod";
import type { Bindings } from "../env.js";
import { requireSession, requireOrg, type GuardVars } from "../lib/guards.js";
import { getAuth } from "../lib/auth-instance.js";
import { requirePermission, type AuthzVars } from "../lib/authorize.js";
import { audit } from "../lib/gate-log.js";
import { isOrgAdmin, WORKSPACE_ROLES } from "../lib/permissions.js";
import { ErrorEnvelope } from "../lib/openapi.js";

/**
 * Who may open which workspace.
 *
 * Owners and admins open every workspace and are never written here. A member
 * opens the workspaces on their `workspace_members` rows, at the role on each.
 * The same grants are reachable from two sides, because an admin arrives with
 * one of two questions: "what can this person see" (Settings › People) and
 * "who is in this workspace" (the workspace's own access dialog).
 *
 * All of it is an admin's job, gated on Better Auth's own `member:update` and
 * `invitation:create` statements, which only owners and admins hold.
 */

type Vars = Partial<AuthzVars & GuardVars>;
type Ctx = Context<{ Bindings: Bindings; Variables: Vars }>;

export const workspaceAccessRouter = new Hono<{ Bindings: Bindings; Variables: Vars }>();

for (const path of ["/workspaces/:id/members", "/workspaces/:id/members/*", "/members/*", "/workspace-access", "/invitations"]) {
  workspaceAccessRouter.use(path, requireSession, requireOrg);
}
workspaceAccessRouter.use("/workspaces/:id/members", requirePermission("member", "update"));
workspaceAccessRouter.use("/workspaces/:id/members/*", requirePermission("member", "update"));
workspaceAccessRouter.use("/members/*", requirePermission("member", "update"));
workspaceAccessRouter.use("/workspace-access", requirePermission("member", "update"));
workspaceAccessRouter.use("/invitations", requirePermission("invitation", "create"));

const WsRole = z.enum(WORKSPACE_ROLES);
/** Beneath D1's hundred bound parameters, and far above any plan's workspace count. */
const MAX_GRANTS = 90;
const Grant = z.object({ workspaceId: z.string(), role: WsRole });
const GrantOut = Grant.extend({ name: z.string() });

const WorkspaceMember = z.object({
  memberId: z.string(),
  userId: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  image: z.string().nullable(),
  /** `owner` / `admin` when `viaOrgRole`, else the grant: `editor` / `viewer`. */
  role: z.string(),
  /** In this workspace because of their organization role, so not removable here. */
  viaOrgRole: z.boolean(),
});

function notFound(c: Ctx, message: string) {
  return c.json({ error: { code: "not_found", message } }, 404);
}

async function loadWorkspace(c: Ctx, id: string) {
  return c.env.DB.prepare(`SELECT id, name FROM workspaces WHERE id = ? AND organization_id = ?`)
    .bind(id, c.get("orgId")!)
    .first<{ id: string; name: string }>();
}

async function loadMember(c: Ctx, memberId: string) {
  return c.env.DB.prepare(`SELECT id, user_id, role FROM members WHERE id = ? AND organization_id = ?`)
    .bind(memberId, c.get("orgId")!)
    .first<{ id: string; user_id: string; role: string }>();
}

/** Every workspace id in `grants` must be this organization's. Returns the names, or null on a stranger. */
async function ownWorkspaces(c: Ctx, ids: string[]): Promise<Map<string, string> | null> {
  if (ids.length === 0) return new Map();
  const rows = await c.env.DB.prepare(
    `SELECT id, name FROM workspaces WHERE organization_id = ? AND id IN (${ids.map(() => "?").join(", ")})`,
  )
    .bind(c.get("orgId")!, ...ids)
    .all<{ id: string; name: string }>();
  const found = new Map((rows.results ?? []).map((r) => [r.id, r.name]));
  return ids.every((id) => found.has(id)) ? found : null;
}

function grantId() {
  return `wm_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function logAccess(c: Ctx, action: string, resourceId: string, meta: Record<string, unknown>) {
  return audit(c.env, {
    orgId: c.get("orgId")!,
    actorType: "user",
    actorId: c.get("userId")!,
    action,
    resourceType: "member",
    resourceId,
    meta,
  }).catch(() => {});
}

// ─────────────────────────── one workspace ───────────────────────────

workspaceAccessRouter.get(
  "/workspaces/:id/members",
  describeRoute({
    tags: ["dashboard"],
    summary: "List who can open a workspace",
    responses: {
      200: { description: "Members", content: { "application/json": { schema: resolver(z.array(WorkspaceMember)) } } },
      404: { description: "No such workspace", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  async (c) => {
    const ws = await loadWorkspace(c, c.req.param("id"));
    if (!ws) return notFound(c, "No such workspace");
    const rows = await c.env.DB.prepare(
      `SELECT m.id AS member_id, m.user_id, m.role AS org_role, u.name, u.email, u.image, wm.role AS ws_role
         FROM members m
         JOIN users u ON u.id = m.user_id
         LEFT JOIN workspace_members wm ON wm.member_id = m.id AND wm.workspace_id = ?
        WHERE m.organization_id = ?
        ORDER BY m.created_at ASC`,
    )
      .bind(ws.id, c.get("orgId")!)
      .all<{ member_id: string; user_id: string; org_role: string; name: string | null; email: string; image: string | null; ws_role: string | null }>();
    const out = [];
    for (const r of rows.results ?? []) {
      const admin = isOrgAdmin(r.org_role);
      if (!admin && !r.ws_role) continue;
      out.push({
        memberId: r.member_id,
        userId: r.user_id,
        name: r.name,
        email: r.email,
        image: r.image,
        role: admin ? (r.org_role.includes("owner") ? "owner" : "admin") : r.ws_role!,
        viaOrgRole: admin,
      });
    }
    return c.json(out);
  },
);

workspaceAccessRouter.put(
  "/workspaces/:id/members/:memberId",
  validator("json", z.object({ role: WsRole })),
  describeRoute({
    tags: ["dashboard"],
    summary: "Add a member to a workspace, or change their role there",
    responses: {
      200: { description: "Saved", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean() })) } } },
      404: { description: "No such workspace or member", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
      409: { description: "Admins already open every workspace", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  async (c) => {
    const [ws, member] = await Promise.all([loadWorkspace(c, c.req.param("id")), loadMember(c, c.req.param("memberId"))]);
    if (!ws) return notFound(c, "No such workspace");
    if (!member) return notFound(c, "No such member");
    if (isOrgAdmin(member.role)) {
      return c.json({ error: { code: "admin_has_access", message: "Admins can already open every workspace." } }, 409);
    }
    const { role } = c.req.valid("json");
    await c.env.DB.prepare(
      `INSERT INTO workspace_members (id, workspace_id, member_id, role, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (workspace_id, member_id) DO UPDATE SET role = excluded.role`,
    )
      .bind(grantId(), ws.id, member.id, role, c.get("userId")!, Date.now())
      .run();
    await logAccess(c, "workspace.member.set", member.id, { workspaceId: ws.id, workspace: ws.name, role });
    return c.json({ ok: true });
  },
);

workspaceAccessRouter.delete(
  "/workspaces/:id/members/:memberId",
  describeRoute({
    tags: ["dashboard"],
    summary: "Remove a member from a workspace",
    responses: {
      200: { description: "Removed", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean() })) } } },
      404: { description: "Not in this workspace", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  async (c) => {
    const ws = await loadWorkspace(c, c.req.param("id"));
    if (!ws) return notFound(c, "No such workspace");
    const memberId = c.req.param("memberId");
    const res = await c.env.DB.prepare(
      `DELETE FROM workspace_members WHERE workspace_id = ? AND member_id IN (SELECT id FROM members WHERE id = ? AND organization_id = ?)`,
    )
      .bind(ws.id, memberId, c.get("orgId")!)
      .run();
    if (!res.meta.changes) return notFound(c, "Not in this workspace");
    await logAccess(c, "workspace.member.remove", memberId, { workspaceId: ws.id, workspace: ws.name });
    return c.json({ ok: true });
  },
);

// ─────────────────────────── one person ───────────────────────────

/**
 * Every grant in the organization, keyed by member and by pending invitation,
 * so the People page can show an Access column without a request per row.
 */
workspaceAccessRouter.get(
  "/workspace-access",
  describeRoute({
    tags: ["dashboard"],
    summary: "Workspace access for every member and pending invitation",
    responses: {
      200: {
        description: "Access",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                workspaceCount: z.number(),
                members: z.record(z.string(), z.array(GrantOut)),
                invitations: z.record(z.string(), z.array(GrantOut)),
              }),
            ),
          },
        },
      },
    },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const [countRes, memberRes, inviteRes] = (await c.env.DB.batch([
      c.env.DB.prepare(`SELECT COUNT(*) AS n FROM workspaces WHERE organization_id = ?`).bind(orgId),
      c.env.DB.prepare(
        `SELECT wm.member_id AS owner_id, wm.workspace_id, wm.role, w.name
           FROM workspace_members wm JOIN workspaces w ON w.id = wm.workspace_id
          WHERE w.organization_id = ? ORDER BY w.created_at ASC`,
      ).bind(orgId),
      c.env.DB.prepare(
        `SELECT iw.invitation_id AS owner_id, iw.workspace_id, iw.role, w.name
           FROM invitation_workspaces iw JOIN workspaces w ON w.id = iw.workspace_id
          WHERE w.organization_id = ? ORDER BY w.created_at ASC`,
      ).bind(orgId),
    ])) as [D1Result<{ n: number }>, D1Result<GrantRow>, D1Result<GrantRow>];
    return c.json({
      workspaceCount: countRes.results?.[0]?.n ?? 0,
      members: groupGrants(memberRes.results ?? []),
      invitations: groupGrants(inviteRes.results ?? []),
    });
  },
);

type GrantRow = { owner_id: string; workspace_id: string; role: "editor" | "viewer"; name: string };

function groupGrants(rows: GrantRow[]) {
  const out: Record<string, { workspaceId: string; role: "editor" | "viewer"; name: string }[]> = {};
  for (const r of rows) (out[r.owner_id] ??= []).push({ workspaceId: r.workspace_id, role: r.role, name: r.name });
  return out;
}

const AccessBody = z.object({
  role: z.enum(["admin", "member"]),
  workspaces: z.array(Grant).max(MAX_GRANTS),
});

/**
 * A person's whole access in one save: their organization role, and, for a
 * member, exactly which workspaces and at what role. What the People dialog
 * shows is what gets written, so there is no partial state to reconcile.
 */
workspaceAccessRouter.put(
  "/members/:memberId/access",
  validator("json", AccessBody),
  describeRoute({
    tags: ["dashboard"],
    summary: "Set a member's organization role and workspace access",
    responses: {
      200: { description: "Saved", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean() })) } } },
      404: { description: "No such member or workspace", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
      409: { description: "The owner, or a member with no workspace", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  async (c) => {
    const member = await loadMember(c, c.req.param("memberId"));
    if (!member) return notFound(c, "No such member");
    if (member.role.split(",").includes("owner")) {
      return c.json({ error: { code: "owner_role", message: "The owner's role can't be changed here." } }, 409);
    }
    const body = c.req.valid("json");
    const grants = body.role === "member" ? dedupe(body.workspaces) : [];
    if (body.role === "member" && grants.length === 0) {
      return c.json({ error: { code: "no_workspace", message: "Give a member at least one workspace." } }, 409);
    }
    const names = await ownWorkspaces(c, grants.map((g) => g.workspaceId));
    if (!names) return notFound(c, "No such workspace");

    const now = Date.now();
    const userId = c.get("userId")!;
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE members SET role = ? WHERE id = ? AND organization_id = ?`).bind(body.role, member.id, c.get("orgId")!),
      // An admin keeps no grants: they open everything, and stale rows would
      // silently come back if they were ever made a member again.
      c.env.DB.prepare(`DELETE FROM workspace_members WHERE member_id = ?`).bind(member.id),
      ...grants.map((g) =>
        c.env.DB.prepare(
          `INSERT INTO workspace_members (id, workspace_id, member_id, role, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        ).bind(grantId(), g.workspaceId, member.id, g.role, userId, now),
      ),
    ]);
    await logAccess(c, "member.access.set", member.id, {
      role: body.role,
      workspaces: grants.map((g) => ({ workspace: names.get(g.workspaceId), role: g.role })),
    });
    return c.json({ ok: true });
  },
);

function dedupe(grants: z.infer<typeof Grant>[]) {
  return [...new Map(grants.map((g) => [g.workspaceId, g])).values()];
}

// ─────────────────────────── inviting ───────────────────────────

const InviteBody = z.object({
  email: z.string().email().max(320),
  role: z.enum(["admin", "member"]),
  workspaces: z.array(Grant).max(MAX_GRANTS).default([]),
  resend: z.boolean().optional(),
  /**
   * The organization the caller means. Optional, and only ever a check: a
   * mismatch with the active organization is refused rather than followed, so
   * an invitation can never land in the organization someone happened to be
   * looking at a moment ago.
   */
  organizationId: z.string().optional(),
});

/**
 * An invitation that already knows its workspaces.
 *
 * Better Auth still creates it, so the seat check in `beforeCreateInvitation`
 * and the invitation email are exactly what they were. The grants wait in
 * `invitation_workspaces` until `afterAcceptInvitation` turns them into
 * `workspace_members` rows.
 */
workspaceAccessRouter.post(
  "/invitations",
  validator("json", InviteBody),
  describeRoute({
    tags: ["dashboard"],
    summary: "Invite someone to the organization and to chosen workspaces",
    responses: {
      200: { description: "Invited", content: { "application/json": { schema: resolver(z.object({ id: z.string() })) } } },
      402: { description: "Seat limit", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
      409: { description: "A member with no workspace", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  async (c) => {
    if (c.get("impersonatorId")) {
      return c.json({ error: { code: "impersonation_forbidden", message: "Invitations can't be sent while signed in as a customer." } }, 403);
    }
    const body = c.req.valid("json");
    if (body.organizationId && body.organizationId !== c.get("orgId")) {
      return c.json({ error: { code: "organization_mismatch", message: "Switch to that organization first, then invite." } }, 409);
    }
    const grants = body.role === "member" ? dedupe(body.workspaces) : [];
    if (body.role === "member" && grants.length === 0) {
      return c.json({ error: { code: "no_workspace", message: "Pick at least one workspace for a member." } }, 409);
    }
    const names = await ownWorkspaces(c, grants.map((g) => g.workspaceId));
    if (!names) return notFound(c, "No such workspace");

    let invitation: { id: string };
    try {
      invitation = (await getAuth(c.env).api.createInvitation({
        headers: c.req.raw.headers,
        body: { email: body.email, role: body.role, organizationId: c.get("orgId")!, resend: body.resend },
      })) as { id: string };
    } catch (err) {
      const e = err as { statusCode?: number; status?: number | string; body?: Record<string, unknown>; message?: string };
      const status = typeof e.statusCode === "number" ? e.statusCode : 400;
      const payload = e.body && "error" in e.body ? e.body : { error: { code: String(e.body?.code ?? "invite_failed").toLowerCase(), message: String(e.body?.message ?? e.message ?? "Couldn't send the invitation") } };
      return c.json(payload, status as 400);
    }

    await c.env.DB.batch([
      c.env.DB.prepare(`DELETE FROM invitation_workspaces WHERE invitation_id = ?`).bind(invitation.id),
      ...grants.map((g) =>
        c.env.DB.prepare(`INSERT INTO invitation_workspaces (invitation_id, workspace_id, role) VALUES (?, ?, ?)`).bind(
          invitation.id,
          g.workspaceId,
          g.role,
        ),
      ),
    ]);
    return c.json({ id: invitation.id });
  },
);
