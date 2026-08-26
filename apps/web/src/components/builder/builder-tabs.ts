import {
  BarChart3,
  Blocks,
  Bot,
  GitBranch,
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
  // Build and Workflow are two views of the same thing — the questions and how
  // respondents move between them — so they share one tab and switch inside it.
  // Design, Questions and Flow all shape the same form, so Build owns them and
  // they share the toolbar below the header rather than three nav slots.
  { segment: "build", label: "Build", icon: Blocks, hint: "Questions, flow and design", alsoMatches: ["workflow", "design"] },
  { segment: "agent", label: "Agent", icon: Bot, hint: "Persona, goal and knowledge", alsoMatches: [] },
  { segment: "results", label: "Results", icon: BarChart3, hint: "Responses and analytics", alsoMatches: [] },
  { segment: "share", label: "Share", icon: Share2, hint: "Link, embed and QR", alsoMatches: [] },
  { segment: "integrate", label: "Integrate", icon: Webhook, hint: "Webhooks and destinations", alsoMatches: [] },
  { segment: "settings", label: "Settings", icon: SettingsIcon, hint: "Access, email and metadata", alsoMatches: [] },
] as const;

/** The two views that live under the Build tab. */
export const BUILD_VIEWS = [
  { segment: "build", label: "Questions", icon: Blocks },
  { segment: "workflow", label: "Flow", icon: GitBranch },
] as const;

export type BuilderSegment = (typeof BUILDER_TABS)[number]["segment"];

export const BUILDER_SEGMENTS = [
  ...BUILDER_TABS.map((t) => t.segment),
  "workflow",
  "design",
] as readonly string[];

export function isBuilderSegment(value: string): boolean {
  return BUILDER_SEGMENTS.includes(value);
}

/** True when `pathname` belongs to this tab, including its sub-views. */
export function tabMatches(tab: (typeof BUILDER_TABS)[number], pathname: string): boolean {
  const segments: readonly string[] = [tab.segment, ...tab.alsoMatches];
  return segments.some((seg) => pathname.endsWith(`/${seg}`) || pathname.includes(`/${seg}/`));
}
