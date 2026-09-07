import { Briefcase, Building2, Gauge, KeyRound, ShieldCheck, User, Users } from "lucide-react";

/**
 * Every settings destination, in one place.
 *
 * The same reasoning as `APP_NAV`: the rail, the mobile strip and the command
 * palette all read this array, so a label or an href cannot drift between the
 * three places a person might meet it.
 *
 * ## Why two groups, and why the first one has no fixed name
 *
 * "This workspace" and "the workspaces you belong to" are different things, and
 * the old arrangement had them one click apart wearing the same noun. Naming the
 * first group after the *active workspace itself* — the rail renders the
 * organization's real name here — settles it: the first three sections are
 * plainly scoped to Acme Inc, and the plural "Workspaces" under Account is
 * plainly the list of places you belong to.
 *
 * That also keeps the product's vocabulary honest. There is a `workspaces` table
 * in the database that means something else entirely and has no UI; nothing in
 * this rail refers to it.
 */
export interface SettingsSection {
  id: string;
  label: string;
  href: string;
  icon: typeof User;
  /** Words somebody might actually type into ⌘K looking for this. */
  keywords: string;
}

export interface SettingsGroup {
  id: "workspace" | "account";
  /** `null` means "render the active workspace's own name here". */
  label: string | null;
  sections: SettingsSection[];
}

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    id: "workspace",
    label: null,
    sections: [
      {
        id: "general",
        label: "General",
        href: "/settings/general",
        icon: Building2,
        keywords: "general workspace organization name slug logo rename delete workspace leave",
      },
      {
        id: "people",
        label: "People",
        href: "/settings/people",
        icon: Users,
        keywords: "people team members invite invitation seats roles permissions remove",
      },
      {
        id: "usage",
        label: "Plan & usage",
        href: "/settings/usage",
        icon: Gauge,
        keywords: "plan usage billing upgrade limits quota seats invoice subscription price",
      },
      {
        id: "api-keys",
        label: "API keys",
        href: "/settings/api-keys",
        icon: KeyRound,
        keywords: "api keys tokens developer scopes secret revoke",
      },
    ],
  },
  {
    id: "account",
    label: "Account",
    sections: [
      {
        id: "profile",
        label: "Profile",
        href: "/settings/profile",
        icon: User,
        keywords: "profile account name avatar picture email change email",
      },
      {
        id: "security",
        label: "Security",
        href: "/settings/security",
        icon: ShieldCheck,
        keywords: "security password sessions devices google linked accounts delete account",
      },
      {
        id: "workspaces",
        label: "Workspaces",
        href: "/settings/workspaces",
        icon: Briefcase,
        keywords: "workspaces organizations switch join invitations pending leave",
      },
    ],
  },
];

export const SETTINGS_SECTIONS: SettingsSection[] = SETTINGS_GROUPS.flatMap((g) => g.sections);
