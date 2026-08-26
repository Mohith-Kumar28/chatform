import {
  BarChart3,
  Blocks,
  Bot,
  GitBranch,
  Palette,
  Settings as SettingsIcon,
  Share2,
  Webhook,
} from "lucide-react";

/**
 * The tab definitions, in one place.
 *
 * The header and the running app previously disagreed about this list — the UI
 * showed "Settings" twice and labelled the theme tab "Theme" while the state
 * value was "design". One exported const, consumed by the header and the route
 * segments, makes that class of drift impossible.
 */
export const BUILDER_TABS = [
  { segment: "build", label: "Build", icon: Blocks, hint: "Questions the agent collects" },
  { segment: "agent", label: "Agent", icon: Bot, hint: "Persona, goal and knowledge" },
  { segment: "workflow", label: "Workflow", icon: GitBranch, hint: "Branching and logic" },
  { segment: "design", label: "Design", icon: Palette, hint: "Colors, fonts and shape" },
  { segment: "results", label: "Results", icon: BarChart3, hint: "Responses and analytics" },
  { segment: "share", label: "Share", icon: Share2, hint: "Link, embed and QR" },
  { segment: "integrate", label: "Integrate", icon: Webhook, hint: "Webhooks and destinations" },
  { segment: "settings", label: "Settings", icon: SettingsIcon, hint: "Access, email and metadata" },
] as const;

export type BuilderSegment = (typeof BUILDER_TABS)[number]["segment"];

export const BUILDER_SEGMENTS = BUILDER_TABS.map((t) => t.segment) as readonly BuilderSegment[];

export function isBuilderSegment(value: string): value is BuilderSegment {
  return (BUILDER_SEGMENTS as readonly string[]).includes(value);
}
