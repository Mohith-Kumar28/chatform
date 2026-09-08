import { Briefcase, Building2, FolderOpen, Gauge, KeyRound, ShieldCheck, User, Users } from "lucide-react";

/**
 * Every settings destination, in one place.
 *
 * The same reasoning as `APP_NAV`: the rail, the mobile strip and the command
 * palette all read this array, so a label or an href cannot drift between the
 * three places a person might meet it.
 *
 * ## Why the first group has no fixed name
 *
 * It is named after the *active organization* — the rail renders its real name
 * here — so the sections under it are plainly scoped to Acme Inc rather than to
 * some general idea of settings.
 *
 * ## Organization and workspace are now two different words
 *
 * This file used to say "workspace" for both, and admitted as much: the note
 * that stood here observed that `workspaces` was "a table in the database that
 * means something else entirely and has no UI". It has a UI now. The two levels
 * are:
 *
 *   organization   the account — subscription, seats, members, roles
 *   workspace      a folder of forms inside it
 *
 * So "Organizations" under Account is the list of accounts you belong to, and
 * "Workspaces" in the first group is the folders inside the one you are in.
 * They are one letter apart in a rail and worlds apart in meaning, which is why
 * they sit in different groups.
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
  id: "organization" | "account";
  /** `null` means "render the active workspace's own name here". */
  label: string | null;
  sections: SettingsSection[];
}

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    id: "organization",
    label: null,
    sections: [
      {
        id: "general",
        label: "General",
        href: "/settings/general",
        icon: Building2,
        keywords: "general organization name slug logo rename delete organization leave",
      },
      {
        id: "workspaces",
        label: "Workspaces",
        href: "/settings/workspaces",
        icon: FolderOpen,
        keywords: "workspaces folders create rename delete move forms organize",
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
        id: "organizations",
        label: "Organizations",
        href: "/settings/organizations",
        icon: Briefcase,
        keywords: "organizations accounts switch join invitations pending leave",
      },
    ],
  },
];

export const SETTINGS_SECTIONS: SettingsSection[] = SETTINGS_GROUPS.flatMap((g) => g.sections);
