import type { Bindings } from "../env.js";

/**
 * The workspace a new form belongs in.
 *
 * Lived in `routes/forms.ts` until AI generation also needed to create a form —
 * the streaming generator writes the document itself rather than handing it
 * back for the client to POST — and two routes creating forms in two different
 * ways is how one of them ends up without a workspace.
 *
 * Creates the default workspace on first use, because an organization with no
 * workspace is a state a new account is legitimately in.
 */
export async function requireWorkspace(
  c: { env: Bindings; get: (k: string) => unknown },
  workspaceId?: string,
): Promise<{ orgId: string; wsId: string } | null> {
  const userId = c.get("userId") as string;
  const orgId = c.get("orgId") as string | undefined;
  if (!orgId) return null;
  let wsId = workspaceId;
  if (!wsId) {
    const ws = await c.env.DB.prepare(
      `SELECT id FROM workspaces WHERE organization_id = ? ORDER BY created_at LIMIT 1`,
    )
      .bind(orgId)
      .first<{ id: string }>();
    if (!ws) {
      wsId = `ws_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
      await c.env.DB.prepare(
        `INSERT INTO workspaces (id, organization_id, name, slug, created_by, created_at) VALUES (?, ?, 'Default', 'default', ?, ?)`,
      )
        .bind(wsId, orgId, userId, Date.now())
        .run();
    } else {
      wsId = ws.id;
    }
  }
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
