import { FileStack, LayoutGrid } from "lucide-react";

/**
 * The app's real destinations, minus everything that became a setting.
 *
 * No longer rendered as pills in the header — see the note in `dashboard-shell`.
 * This is now purely a list of *places*, read by the mobile drawer, the command
 * palette and the digit shortcuts, so those three cannot drift apart.
 *
 * Usage left when it became `/settings/usage`; API keys and Team left when they
 * became settings sections. Templates keeps its route and its ⌘K entry but has
 * no pill: the New form flow is where people actually meet templates, and a
 * gallery reachable two ways was a gallery competing with itself.
 */
export const APP_NAV = [
  { href: "/dashboard", label: "Forms", icon: LayoutGrid },
  { href: "/templates", label: "Templates", icon: FileStack },
] as const;
