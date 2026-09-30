import type { FormDoc } from "@repo/form-schema";
import type { TemplateSummary } from "@/lib/templates";
import { USE_CASES, type UseCase } from "@/content/use-cases";
import index from "./index.generated.json";
import { DOC_LOADERS } from "./docs/loaders.generated";

/**
 * The official template catalogue, for the public pages at `/form-templates`.
 *
 * Read from files `pnpm gen:templates` writes from `tooling/templates/` in the
 * same run as the seed SQL, so the page a visitor reads is the template the app
 * creates, question for question.
 *
 * Cards and the taxonomy come from one index; a template's document and guide
 * are loaded only by its own page (`loadTemplate`), because all of them
 * together are several megabytes.
 */

export type TemplateType = "form" | "survey" | "quiz";

export interface TemplateFacts {
  blockTypes: string[];
  branches: number;
  endings: number;
  scored: boolean;
}

export interface TemplateCardData {
  slug: string;
  /** The short in-app name. */
  title: string;
  /** The phrase somebody types into a search box, e.g. "Client intake form". */
  searchName: string;
  type: TemplateType;
  category: string;
  goals: string[];
  roles: string[];
  description: string;
  metaDescription: string;
  blurb: string;
  tags: string[];
  icon: string;
  accent: string;
  blockCount: number;
  estMinutes: number;
  facts: TemplateFacts;
  /** `/form-templates/<slug>`. */
  path: string;
}

export interface TemplateGuide {
  questionsToConsider: string[];
  howToUseResponses: string;
  customizeSteps: string[];
  faqs: { q: string; a: string }[];
}

export interface PublicTemplate extends TemplateCardData {
  doc: FormDoc;
  guide: TemplateGuide;
}

interface Labelled {
  slug: string;
  label: string;
}

export interface TypeInfo {
  type: TemplateType;
  label: string;
  plural: string;
  /** The URL segment, e.g. "surveys". */
  path: string;
  categories: Labelled[];
}

const raw = index as unknown as {
  taxonomy: { types: TypeInfo[]; goals: Labelled[]; roles: Labelled[] };
  templates: Omit<TemplateCardData, "path">[];
};

export const TYPES: readonly TypeInfo[] = raw.taxonomy.types;
export const GOALS: readonly Labelled[] = raw.taxonomy.goals;
export const ROLES: readonly Labelled[] = raw.taxonomy.roles;

export const TEMPLATES: readonly TemplateCardData[] = raw.templates.map((row) => ({
  ...row,
  path: `/form-templates/${row.slug}`,
}));

export const TEMPLATE_COUNT = TEMPLATES.length;

export function getTemplate(slug: string): TemplateCardData | undefined {
  return TEMPLATES.find((t) => t.slug === slug);
}

/** A template with its document and guide. Server-side, at build time. */
export async function loadTemplate(slug: string): Promise<PublicTemplate | undefined> {
  const card = getTemplate(slug);
  const load = DOC_LOADERS[slug];
  if (!card || !load) return undefined;
  const { guide, doc } = (await load()).default as { guide: TemplateGuide; doc: FormDoc };
  return { ...card, guide, doc };
}

export function typeInfo(type: TemplateType): TypeInfo {
  return TYPES.find((t) => t.type === type)!;
}

export function typeByPath(path: string): TypeInfo | undefined {
  return TYPES.find((t) => t.path === path);
}

export function categoryLabel(type: TemplateType, category: string): string {
  return typeInfo(type).categories.find((c) => c.slug === category)?.label ?? category;
}

/** "Survey · Feedback", the line above a card's name. */
export function kindLine(t: Pick<TemplateCardData, "type" | "category">): string {
  return `${typeInfo(t.type).label} · ${categoryLabel(t.type, t.category)}`;
}

export function goalLabel(slug: string): string | undefined {
  return GOALS.find((g) => g.slug === slug)?.label;
}

export function roleLabel(slug: string): string | undefined {
  return ROLES.find((r) => r.slug === slug)?.label;
}

export const byType = (type: TemplateType) => TEMPLATES.filter((t) => t.type === type);
export const byCategory = (type: TemplateType, category: string) =>
  TEMPLATES.filter((t) => t.type === type && t.category === category);
export const byGoal = (goal: string) => TEMPLATES.filter((t) => t.goals.includes(goal));
export const byRole = (role: string) => TEMPLATES.filter((t) => t.roles.includes(role));

export const categoryPath = (type: TemplateType, category: string) =>
  `/form-templates/c/${typeInfo(type).path}/${category}`;
export const typePath = (type: TemplateType) => `/form-templates/c/${typeInfo(type).path}`;
export const goalPath = (goal: string) => `/form-templates/goals/${goal}`;
export const rolePath = (role: string) => `/form-templates/roles/${role}`;

/**
 * Templates to show beside this one: same category first, then the same goal,
 * then the same type, never itself.
 */
export function relatedTo(t: TemplateCardData, count = 3): TemplateCardData[] {
  const picked: TemplateCardData[] = [];
  const add = (list: readonly TemplateCardData[]) => {
    for (const other of list) {
      if (picked.length >= count) return;
      if (other.slug !== t.slug && !picked.includes(other)) picked.push(other);
    }
  };
  add(byCategory(t.type, t.category));
  for (const goal of t.goals) add(byGoal(goal));
  add(byType(t.type));
  return picked;
}

/** The card's data in the shape `TemplateCard` takes. */
export function summaryOf(template: TemplateCardData): TemplateSummary {
  return {
    slug: template.slug,
    title: template.searchName,
    category: kindLine(template),
    description: template.description,
    blurb: template.blurb,
    tags: template.tags,
    icon: template.icon,
    accent: template.accent,
    blockCount: template.blockCount,
    estMinutes: template.estMinutes,
  };
}

/** The use-case guides that start from this template: the long-form version of the page. */
export function guidesFor(slug: string): UseCase[] {
  return USE_CASES.filter((entry) => entry.template?.slug === slug);
}
