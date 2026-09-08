import type { Bindings } from "../env.js";

/** `ws_` + 12 hex. The id shape every workspace row has had since the table existed. */
export function newWorkspaceId(): string {
  return `ws_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/**
 * A slug that reads, and is unique within its organization.
 *
 * `uq_workspaces_org_slug` is the constraint, so this only has to be unique per
 * org — hence no random suffix, unlike `organizations.slug` which is globally
 * unique. Callers handle the collision; see `POST /workspaces`.
 *
 * Same character rules as the organization slug in `auth.ts`, and for the same
 * reason: the name is arbitrary user input and the slug ends up in a URL.
 */
export function workspaceSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace"
  );
}

/**
 * The workspace a form belongs in.
 *
 * Lived in `routes/forms.ts` until AI generation also needed to create a form —
 * the streaming generator writes the document itself rather than handing it
 * back for the client to POST — and two routes creating forms in two different
 * ways is how one of them ends up without a workspace.
 *
 * `ref` is whatever the caller named: a slug from `?ws=`, or an id from a
 * request body. It is resolved **within the caller's organization** and nowhere
 * else. That clause is the whole security of this function: until workspaces
 * were selectable the argument was passed straight into the INSERT, so a
 * client-supplied id could plant a form in another organization's workspace —
 * invisible while nothing sent the field, a cross-tenant write the moment
 * anything did.
 *
 * `null` means "no organization"; `undefined` means "that workspace is not
 * yours", and callers turn the second into a 404 rather than a 403 — the same
 * rule `guards.ts` applies to forms, since confirming an id exists is itself
 * an answer.
 *
 * Creates the default workspace on first use, because an organization with no
 * workspace is a state a new account is legitimately in.
 */
export async function requireWorkspace(
  c: { env: Bindings; get: (k: string) => unknown },
  ref?: string | null,
): Promise<{ orgId: string; wsId: string } | null | undefined> {
  const userId = c.get("userId") as string;
  const orgId = c.get("orgId") as string | undefined;
  if (!orgId) return null;

  if (ref) {
    const row = await c.env.DB.prepare(
      `SELECT id FROM workspaces WHERE organization_id = ? AND (slug = ? OR id = ?) LIMIT 1`,
    )
      .bind(orgId, ref, ref)
      .first<{ id: string }>();
    return row ? { orgId, wsId: row.id } : undefined;
  }

  const ws = await c.env.DB.prepare(
    `SELECT id FROM workspaces WHERE organization_id = ? ORDER BY created_at LIMIT 1`,
  )
    .bind(orgId)
    .first<{ id: string }>();
  if (ws) return { orgId, wsId: ws.id };

  const wsId = newWorkspaceId();
  await c.env.DB.prepare(
    `INSERT INTO workspaces (id, organization_id, name, slug, created_by, created_at) VALUES (?, ?, 'My Workspace', 'my-workspace', ?, ?)`,
  )
    .bind(wsId, orgId, userId, Date.now())
    .run();
  return { orgId, wsId };
}

/** `my-form-a1b2c3` — readable, and unique without a round trip to check. */
export function formSlug(title: string): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "form";
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}
