import { describe, it, expect } from "vitest";
import { roleAllows, ASSIGNABLE_ROLES, type RoleName } from "../src/lib/permissions.js";

/**
 * The role matrix the team page shows, pinned to the statements that enforce it.
 *
 * `/team` renders an expandable "what each role can do" table. It is written in
 * plain language rather than derived from `statement`, because the twelve
 * resources there are not the six sentences that change someone's answer when
 * they are choosing between Admin and Editor. That translation is only useful if
 * it stays true, and nothing about editing `permissions.ts` would otherwise make
 * anyone open a page in `apps/web`.
 *
 * So: each row below is one claim from that table, expressed as the permission
 * it stands for. Widen or narrow a role and this fails, naming the row of the
 * table that has gone stale.
 *
 * Keep in step with `CAPABILITIES` in
 * `apps/web/src/components/settings/people-section.tsx`.
 */
const CAPABILITIES: {
  label: string;
  probe: [resource: string, action: string];
  owner: boolean;
  admin: boolean;
  editor: boolean;
  viewer: boolean;
}[] = [
  {
    label: "Read responses and analytics",
    probe: ["submission", "read"],
    owner: true,
    admin: true,
    editor: true,
    viewer: true,
  },
  {
    label: "Build, edit and publish forms",
    probe: ["form", "publish"],
    owner: true,
    admin: true,
    editor: true,
    viewer: false,
  },
  {
    label: "Export responses, see partial ones",
    probe: ["submission", "export"],
    owner: true,
    admin: true,
    editor: true,
    viewer: false,
  },
  {
    label: "API keys, custom domain, audit log",
    probe: ["apikey", "create"],
    owner: true,
    admin: true,
    editor: false,
    viewer: false,
  },
  {
    label: "Invite and remove teammates",
    probe: ["member", "delete"],
    owner: true,
    admin: true,
    editor: false,
    viewer: false,
  },
  {
    label: "Change the plan",
    probe: ["billing", "manage"],
    owner: true,
    admin: false,
    editor: false,
    viewer: false,
  },
];

describe("the role matrix shown on /team", () => {
  for (const cap of CAPABILITIES) {
    it(`"${cap.label}" matches the statements`, () => {
      const [resource, action] = cap.probe;
      const actual = {
        owner: roleAllows("owner", resource as never, action as never),
        admin: roleAllows("admin", resource as never, action as never),
        editor: roleAllows("editor", resource as never, action as never),
        viewer: roleAllows("viewer", resource as never, action as never),
      };
      expect(actual).toEqual({
        owner: cap.owner,
        admin: cap.admin,
        editor: cap.editor,
        viewer: cap.viewer,
      });
    });
  }

  /**
   * The invite form and the per-row role menu both offer these three, and both
   * of them send the value straight to Better Auth. A role that is offered but
   * not registered is accepted by the endpoint and then resolves to no
   * permissions at all — the teammate lands in the organization able to do
   * nothing, with no error anywhere to explain it.
   */
  it("offers only roles that carry permissions", () => {
    for (const role of ASSIGNABLE_ROLES) {
      expect(
        roleAllows(role as RoleName, "form" as never, "read" as never),
        `${role} resolves to no permissions`,
      ).toBe(true);
    }
  });

  /** `owner` is deliberately not assignable from the invite UI. */
  it("does not offer owner", () => {
    expect(ASSIGNABLE_ROLES).not.toContain("owner" as never);
  });
});
