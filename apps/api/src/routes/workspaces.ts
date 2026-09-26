import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { validator } from "../lib/validator.js";
import { z } from "zod";
import type { Bindings } from "../env.js";
import { requireSession, requireOrg, type GuardVars } from "../lib/guards.js";
import { requirePermission, requireGauge, type AuthzVars } from "../lib/authorize.js";
import { audit } from "../lib/gate-log.js";
import { newWorkspaceId, workspaceSlug } from "../lib/workspace.js";
import { accessFor, workspaceFilter } from "../lib/workspace-access.js";
import { workspacePermissionsFor } from "../lib/permissions.js";

/**
 * Workspaces — the folders forms live in, inside an organization.
 *
 * The table and `forms.workspace_id` have existed since the schema was written;
 * what was missing was any way to make a second one. Every organization has had
 * exactly one, auto-created and named 'Default', with no UI — which is why the
 * plan gauge read "1 of 1" forever while the header switcher listed
 * organizations and called them workspaces.
 *
 * The two levels are not the same axis and this router is the smaller one:
 *
 *   organization   who pays, who is a member, what role they hold
 *   workspace      which forms you are looking at
 *
 * Access is per workspace. Owners and admins open every workspace; everyone
 * else opens the ones on their `workspace_members` rows, as an editor or a
 * viewer (`lib/workspace-access.ts`). A workspace the caller was not added to
 * is absent from every list and 404s by id, exactly like another
 * organization's.
 */

export const workspacesRouter = new Hono<{
  Bindings: Bindings;
  Variables: Partial<AuthzVars & GuardVars>;
}>();

workspacesRouter.use("/workspaces", requireSession);
workspacesRouter.use("/workspaces/*", requireSession);
workspacesRouter.use("/workspaces", requireOrg);
workspacesRouter.use("/workspaces/*", requireOrg);

/**
 * Reading the list is not gated on a role: it is filtered instead, to the
 * workspaces the caller can open. Creating, renaming and deleting a workspace,
 * and deciding who is in it, are organization questions, so only owners and
 * admins pass those gates.
 */
workspacesRouter.post("/workspaces", requirePermission("workspace", "create"), requireGauge("workspaces_count", "workspaces"));
workspacesRouter.patch("/workspaces/:id", requirePermission("workspace", "update"));
workspacesRouter.delete("/workspaces/:id", requirePermission("workspace", "delete"));

const Workspace = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  formCount: z.number(),
  createdAt: z.number(),
});

const WorkspaceListItem = Workspace.extend({
  /** The caller's role here: `owner` / `admin` for organization admins, else `editor` / `viewer`. */
  myRole: z.string(),
  /** What that role allows in this workspace, in the `permissionsFor` shape. */
  permissions: z.record(z.string(), z.array(z.string())),
  /** Members with an explicit grant. Owners and admins are not counted; they are in every workspace. */
  memberCount: z.number(),
});

const NameBody = z.object({ name: z.string().min(1).max(60) });

workspacesRouter.get(
  "/workspaces",
  describeRoute({
    tags: ["dashboard"],
    summary: "List workspaces in the active organization",
    responses: { 200: { description: "Workspaces", content: { "application/json": { schema: resolver(z.array(WorkspaceListItem)) } } } },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const access = await accessFor(c as never);
    const filter = workspaceFilter(access, "w.id");
    const rows = await c.env.DB.prepare(
      `SELECT w.id, w.name, w.slug, w.created_at,
              (SELECT COUNT(*) FROM forms f WHERE f.workspace_id = w.id AND f.deleted_at IS NULL) AS form_count,
              (SELECT COUNT(*) FROM workspace_members wm WHERE wm.workspace_id = w.id) AS member_count
         FROM workspaces w WHERE w.organization_id = ?${filter.sql} ORDER BY w.created_at ASC`,
    )
      .bind(orgId, ...filter.binds)
      .all<{ id: string; name: string; slug: string; created_at: number; form_count: number; member_count: number }>();
    return c.json(
      (rows.results ?? []).map((r) => {
        const myRole = access.admin ? access.orgRole || "admin" : (access.grants.get(r.id) ?? "viewer");
        return {
          id: r.id,
          name: r.name,
          slug: r.slug,
          formCount: r.form_count,
          createdAt: r.created_at,
          myRole,
          permissions: workspacePermissionsFor(myRole),
          memberCount: r.member_count,
        };
      }),
    );
  },
);

/**
 * `uq_workspaces_org_slug` is per organization, so the slug carries no random
 * suffix — "marketing" should read as `marketing`. That makes a collision
 * ordinary rather than exceptional, and it is resolved by counting up:
 * `marketing`, `marketing-2`, `marketing-3`. Bounded, because an unbounded loop
 * against a unique index is a request that never returns.
 */
async function freeSlug(env: Bindings, orgId: string, name: string, excludeId?: string): Promise<string | null> {
  const base = workspaceSlug(name);
  /**
   * Every slug that could collide, in one query rather than one per candidate:
   * counting up used to mean up to fifty sequential round trips to D1 to answer
   * a question the organization's own slug list already contains.
   */
  const taken = await env.DB.prepare(
    `SELECT slug FROM workspaces
      WHERE organization_id = ?1 AND id IS NOT ?2 AND (slug = ?3 OR slug LIKE ?3 || '-%')`,
  )
    .bind(orgId, excludeId ?? null, base)
    .all<{ slug: string }>();
  const used = new Set((taken.results ?? []).map((r) => r.slug));
  for (let n = 1; n <= 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return null;
}

workspacesRouter.post(
  "/workspaces",
  validator("json", NameBody),
  describeRoute({
    tags: ["dashboard"],
    summary: "Create a workspace",
    responses: {
      200: { description: "Created", content: { "application/json": { schema: resolver(Workspace) } } },
      402: { description: "Limit reached" },
    },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const userId = c.get("userId")!;
    const { name } = c.req.valid("json");
    const slug = await freeSlug(c.env, orgId, name);
    if (!slug) {
      return c.json({ error: { code: "slug_unavailable", message: "Pick a different name" } }, 409);
    }
    const id = newWorkspaceId();
    const now = Date.now();
    await c.env.DB.prepare(
      `INSERT INTO workspaces (id, organization_id, name, slug, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, orgId, name.trim(), slug, userId, now)
      .run();
    await audit(c.env, {
      orgId,
      actorType: "user",
      actorId: userId,
      action: "workspace.create",
      resourceType: "workspace",
      resourceId: id,
      meta: { name: name.trim(), slug },
    }).catch(() => {});
    return c.json({ id, name: name.trim(), slug, formCount: 0, createdAt: now });
  },
);

workspacesRouter.patch(
  "/workspaces/:id",
  validator("json", NameBody),
  describeRoute({
    tags: ["dashboard"],
    summary: "Rename a workspace",
    responses: { 200: { description: "Updated", content: { "application/json": { schema: resolver(Workspace) } } } },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const userId = c.get("userId")!;
    const id = c.req.param("id");
    const { name } = c.req.valid("json");
    // The form count comes back with the row rather than in a second trip after
    // the rename: it cannot change under a statement that only touches names.
    const row = await c.env.DB.prepare(
      `SELECT w.id, w.created_at,
              (SELECT COUNT(*) FROM forms f WHERE f.workspace_id = w.id AND f.deleted_at IS NULL) AS form_count
         FROM workspaces w WHERE w.id = ? AND w.organization_id = ?`,
    )
      .bind(id, orgId)
      .first<{ id: string; created_at: number; form_count: number }>();
    if (!row) return c.json({ error: { code: "not_found", message: "No such workspace" } }, 404);
    const slug = await freeSlug(c.env, orgId, name, id);
    if (!slug) return c.json({ error: { code: "slug_unavailable", message: "Pick a different name" } }, 409);
    await c.env.DB.prepare(`UPDATE workspaces SET name = ?, slug = ? WHERE id = ? AND organization_id = ?`)
      .bind(name.trim(), slug, id, orgId)
      .run();
    await audit(c.env, {
      orgId,
      actorType: "user",
      actorId: userId,
      action: "workspace.update",
      resourceType: "workspace",
      resourceId: id,
      meta: { name: name.trim(), slug },
    }).catch(() => {});
    return c.json({ id, name: name.trim(), slug, formCount: row.form_count, createdAt: row.created_at });
  },
);

workspacesRouter.delete(
  "/workspaces/:id",
  describeRoute({
    tags: ["dashboard"],
    summary: "Delete a workspace",
    responses: { 200: { description: "Deleted" }, 409: { description: "Not empty, or the last one" } },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const userId = c.get("userId")!;
    const id = c.req.param("id");
    /**
     * The row, the organization's workspace count and this workspace's form
     * count in one round trip: none of the three depends on another, and the
     * two refusals below need all of them.
     */
    const [rowRes, remainingRes, formsRes] = (await c.env.DB.batch([
      c.env.DB.prepare(`SELECT id, name FROM workspaces WHERE id = ? AND organization_id = ?`).bind(id, orgId),
      c.env.DB.prepare(`SELECT COUNT(*) AS n FROM workspaces WHERE organization_id = ?`).bind(orgId),
      c.env.DB.prepare(`SELECT COUNT(*) AS n FROM forms WHERE workspace_id = ? AND deleted_at IS NULL`).bind(id),
    ])) as [D1Result<{ id: string; name: string }>, D1Result<{ n: number }>, D1Result<{ n: number }>];
    const row = (rowRes.results ?? [])[0];
    if (!row) return c.json({ error: { code: "not_found", message: "No such workspace" } }, 404);

    /**
     * Two refusals, both because `forms.workspace_id` is `ON DELETE CASCADE`.
     *
     * Dropping a workspace with forms in it takes the forms, their versions,
     * every submission and every answer — silently, in one statement, with no
     * soft-delete anywhere in the chain. `DELETE /forms/:id` is a `deleted_at`
     * stamp precisely so form deletion is recoverable; a workspace delete must
     * not be the back door that makes it permanent.
     *
     * And an organization with no workspace has nowhere to put a new form, so
     * the last one stays. Better Auth's teams feature guards its own last team
     * the same way, for the same reason.
     */
    const remaining = (remainingRes.results ?? [])[0];
    if ((remaining?.n ?? 0) <= 1) {
      return c.json(
        { error: { code: "last_workspace", message: "An organization needs at least one workspace." } },
        409,
      );
    }
    const forms = (formsRes.results ?? [])[0];
    if ((forms?.n ?? 0) > 0) {
      return c.json(
        {
          error: {
            code: "workspace_not_empty",
            message: `Move or delete the ${forms!.n} form${forms!.n === 1 ? "" : "s"} in this workspace first.`,
          },
        },
        409,
      );
    }

    await c.env.DB.prepare(`DELETE FROM workspaces WHERE id = ? AND organization_id = ?`).bind(id, orgId).run();
    await audit(c.env, {
      orgId,
      actorType: "user",
      actorId: userId,
      action: "workspace.delete",
      resourceType: "workspace",
      resourceId: id,
      meta: { name: row.name },
    }).catch(() => {});
    return c.json({ ok: true });
  },
);
