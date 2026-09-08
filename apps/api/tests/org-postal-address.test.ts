import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, type Tenant } from "./helpers.js";

/**
 * The sender's postal address, stored on the organization.
 *
 * CAN-SPAM requires a physical address in the footer of any commercial message,
 * and a reminder to somebody who abandoned a form is commercial. Rather than a
 * route of our own, the column is declared to Better Auth's organization plugin
 * as an additional field, so its existing update endpoint writes it — one
 * endpoint, one copy of the record.
 *
 * This test exists because that mapping is the uncertain part: the plugin knows
 * the field as `postalAddress` and the column is `postal_address`, and the two
 * are only connected by the Drizzle schema the adapter was handed.
 */

let t: Tenant;

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("postal");
});

describe("organization postal address", () => {
  it("round-trips through Better Auth's update endpoint into the column", async () => {
    const address = "Chatform Labs, 4th Floor, MG Road, Bengaluru 560001, India";
    const res = await fetchApi("/api/auth/organization/update", {
      method: "POST",
      // Better Auth enforces its own origin check on state-changing calls; a
      // request with no Origin is refused before any permission is consulted.
      headers: {
        "content-type": "application/json",
        cookie: t.cookie,
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({ organizationId: t.orgId, data: { postalAddress: address } }),
    });
    expect(res.status).toBe(200);

    // The column, not the response body: the mailer reads D1 directly, so that
    // is the only place worth asserting on.
    const row = await env.DB.prepare(`SELECT postal_address FROM organizations WHERE id = ?`)
      .bind(t.orgId)
      .first<{ postal_address: string | null }>();
    expect(row?.postal_address).toBe(address);
  });
});
