import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, fetchApi, seedTenant, type Tenant } from "./helpers.js";

/**
 * What an invitation link can say before anybody has signed in.
 *
 * The bug this endpoint exists for: Better Auth's `get-invitation` needs a
 * session whose email is already the invitee's, and answers every other case
 * with one opaque error. So `/accept-invitation` told a person holding a live
 * invitation that it was "no longer valid" — while the sender's dashboard,
 * reading the same row, showed it as pending with an expiry two days out.
 *
 * These tests pin the four answers that page now depends on being different
 * from each other, and the two things the endpoint must not do: require a
 * session, or return anything for an id it was not given.
 */
describe("invitation preview", () => {
  let owner: Tenant;

  beforeAll(async () => {
    await applySchema();
    owner = await seedTenant("invprev");
  });

  const seedInvitation = async (
    id: string,
    over: { email?: string; status?: string; expiresAt?: number; role?: string } = {},
  ) => {
    await env.DB.prepare(
      `INSERT INTO invitations (id, organization_id, email, role, status, expires_at, inviter_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        owner.orgId,
        over.email ?? "invitee@example.com",
        over.role ?? "editor",
        over.status ?? "pending",
        over.expiresAt ?? Date.now() + 2 * 86_400_000,
        owner.userId,
        Date.now(),
      )
      .run();
  };

  const preview = async (id: string) => {
    const res = await fetchApi(`/api/invitation-preview?id=${encodeURIComponent(id)}`);
    expect(res.status).toBe(200);
    return res.json() as Promise<Record<string, unknown>>;
  };

  it("describes a live invitation to a caller with no session at all", async () => {
    await seedInvitation("inv_live");
    const body = await preview("inv_live");

    expect(body.state).toBe("pending");
    expect(body.email).toBe("invitee@example.com");
    expect(body.role).toBe("editor");
    expect(body.organizationName).toBe("invprev");
    // The inviter, so the email can say who is asking rather than "somebody".
    expect(body.inviterEmail).toBe("invprev@example.com");
    // Nobody has signed up as the invitee yet — this is what sends them to the
    // sign-up form rather than a sign-in form they cannot use.
    expect(body.recipientHasAccount).toBe(false);
  });

  it("reports an expired row as expired even though its status still says pending", async () => {
    // Better Auth never rewrites the column; it compares the date at read time.
    // A row left saying `pending` past its date is the shape this has to handle.
    await seedInvitation("inv_stale", { expiresAt: Date.now() - 60_000 });
    expect((await preview("inv_stale")).state).toBe("expired");
  });

  it("separates revoked from used from expired", async () => {
    await seedInvitation("inv_revoked", { status: "canceled" });
    await seedInvitation("inv_used", { status: "accepted" });
    expect((await preview("inv_revoked")).state).toBe("canceled");
    expect((await preview("inv_used")).state).toBe("accepted");
  });

  it("knows when the invitee already has an account", async () => {
    await seedInvitation("inv_known", { email: "INVPREV@example.com" });
    const body = await preview("inv_known");
    // Matched case-insensitively, because that is how the accept endpoint
    // compares the address it is about to demand.
    expect(body.recipientHasAccount).toBe(true);
  });

  it("says not_found for an unknown id, and leaks nothing with it", async () => {
    const body = await preview("inv_does_not_exist");
    expect(body.state).toBe("not_found");
    expect(body.email).toBeNull();
    expect(body.organizationName).toBeNull();
  });

  it("says not_found rather than erroring when the id is missing entirely", async () => {
    const res = await fetchApi("/api/invitation-preview");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { state: string }).state).toBe("not_found");
  });
});
