import type { FormDoc } from "./form-doc";
import { CLOSED_MESSAGE_DEFAULT, DEFAULT_CONFIRMATION_BODY, DEFAULT_CONFIRMATION_SUBJECT, THEME_COLOR_PATTERN } from "./settings";
import { GOOGLE_FONTS } from "./google-fonts.generated";
import { isDarkTheme, themeFromAccent, withAppearance } from "./palette";
import { applyFormTheme, backgroundDecorOn, FORM_THEMES, matchFormTheme, themeFont, withoutFormTheme } from "./form-themes";
import type { ThemeDoc } from "./settings";

const GOOGLE_FONT_FAMILIES = GOOGLE_FONTS.map(([family]) => family);

/** A setting with no field of its own: it writes a whole theme (`applyFormTheme`). */
export const BACKGROUND_PRESET_KEY = "theme.backgroundPreset";

/**
 * Every form setting the builder AI may change, in one list.
 *
 * One entry answers every question anybody asks about a setting: what the
 * builder calls it, where it lives, what values it takes, which plan unlocks
 * it, and how to read and write it on a document. Four readers share it:
 *
 *   - the edit prompt, which lists only the sections a request touches;
 *   - the route, which parses a proposed value and refuses a locked one;
 *   - the builder's proposal card, which prints the label and before/after;
 *   - the builder's Apply, which writes the value onto the live document.
 *
 * So the AI never writes JSON into the document. It names a key from this
 * list and a value as text, and code does the rest. A key not here cannot be
 * changed by the AI at all, which is how the password, the follow-up
 * attestation, the agent's model and the plan ceilings stay out of its reach.
 *
 * `feature` values are `@repo/entitlements` feature keys. This package does not
 * depend on that one, so the API checks them against `FeatureKey` in a test.
 */

export const SETTING_SECTIONS = {
  design: "How the form looks: its theme (a ready-made look for a mood, with its own light and dark sides), colours, fonts, corner roundness and background shapes",
  display: "The progress indicator, whether optional questions can be skipped, and the Powered by chatform badge",
  agent_persona: "Who the AI interviewer is: its interview style, tone of voice, persona, name, and whether it rewords questions",
  agent_goal: "The interviewer's written goal and its description of what a good response contains, which steer how deep it probes",
  guardrails: "Limits on what the interviewer talks about: off-topic questions, topics it must never discuss, what it says when it declines",
  access: "Who may respond: requiring sign-in, one response per person, captcha",
  closing: "When the form stops accepting responses: a closing date, a response limit, a countdown, spots left, the closed message",
  completion: "What happens after someone submits: emails to the owner or to the respondent, redirecting to a website, a review step",
  sharing: "How the link looks when shared and whether search engines list it",
  embed: "How the form sits on the author's website: popup, inline, side tab, the corner button, opening by itself",
  form: "The form's name and the language it runs in",
} as const;

export type SettingSection = keyof typeof SETTING_SECTIONS;

/** What the builder calls each section, for grouping a proposal's changes. */
export const SETTING_SECTION_LABELS: Record<SettingSection, string> = {
  design: "Design",
  display: "Display",
  agent_persona: "Interviewer",
  agent_goal: "Goal",
  guardrails: "Guardrails",
  access: "Who can respond",
  closing: "Closing",
  completion: "On completion",
  sharing: "Link & social",
  embed: "On your site",
  form: "Form",
};

/**
 * Something to add to the knowledge base the interviewer answers from.
 *
 * Not a setting: sources are rows of their own, added through the knowledge
 * routes, so a proposal carries them for the builder to add on Apply.
 */
export type KnowledgeAdd =
  | { kind: "link"; url: string; locked?: { limit: "knowledge_sources_count" } }
  | { kind: "text"; title: string; body: string; locked?: { limit: "knowledge_sources_count" } };
export const SETTING_SECTION_IDS = Object.keys(SETTING_SECTIONS) as SettingSection[];

export type SettingFormat =
  | "color"
  | "text"
  | "longtext"
  | "enum"
  | "bool"
  | "int"
  | "date"
  | "url"
  | "emails"
  | "list"
  | "font"
  | "language";

export type SettingValue = string | number | boolean | string[] | undefined;

export interface SettingDef {
  key: string;
  section: SettingSection;
  /** The builder's own words for it. */
  label: string;
  /** Where an author finds it by hand. */
  where: string;
  format: SettingFormat;
  options?: readonly { value: string; label: string }[];
  min?: number;
  max?: number;
  maxLength?: number;
  maxItems?: number;
  /** An empty value clears it back to unset. */
  clearable?: boolean;
  /** One line for the model when the format alone is not enough. */
  hint?: string;
  /**
   * The builder recomputes the neighbouring colours when this one changes, the
   * way the Design sheet does with its "match" switch on: from the primary
   * colour, light or dark as the background now is. The web client owns that
   * maths (`themeFromAccent`), so the server only records the value.
   */
  derives?: "palette";
  get(doc: FormDoc): SettingValue;
  set(doc: FormDoc, value: SettingValue): void;
  /**
   * The feature without which this setting has no value worth offering: every
   * non-default value it can take needs it. Such a setting is left out of the
   * keys a plan without it may name.
   */
  feature?: string;
  /**
   * The feature this value needs on the document it lands on, or null when it
   * is free. Defaults to `feature` for any value but a cleared or off one.
   */
  gate?(value: SettingValue, doc: FormDoc): string | null;
}

// ─── paths ───────────────────────────────────────────────────────────────────

function getPath(doc: FormDoc, path: string): SettingValue {
  let at: unknown = doc;
  for (const part of path.split(".")) {
    if (at === null || typeof at !== "object") return undefined;
    at = (at as Record<string, unknown>)[part];
  }
  return at as SettingValue;
}

function setPath(doc: FormDoc, path: string, value: SettingValue): void {
  const parts = path.split(".");
  let at = doc as unknown as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) {
    if (at[part] === null || typeof at[part] !== "object") at[part] = {};
    at = at[part] as Record<string, unknown>;
  }
  at[parts.at(-1)!] = value;
}

type Spec = Omit<SettingDef, "get" | "set"> & Partial<Pick<SettingDef, "get" | "set">>;

/** Most keys are their own path into the document. */
function def(spec: Spec): SettingDef {
  const needs = spec.feature;
  return {
    ...spec,
    gate: spec.gate ?? (needs ? (v) => (v === undefined || v === false || (Array.isArray(v) && v.length === 0) ? null : needs) : undefined),
    get: spec.get ?? ((doc) => getPath(doc, spec.key)),
    set: spec.set ?? ((doc, value) => setPath(doc, spec.key, value)),
  };
}

/** Gated only once it differs from the value every plan gets. */
const unlessDefault = (name: string, fallback: SettingValue) => (value: SettingValue) =>
  value === undefined || value === fallback ? null : name;

/** Custom fonts, unless the font is the default or the one the form's theme sets (`themeFont`). */
const unlessThemeFont = (fallback: string) => (value: SettingValue, doc: FormDoc) =>
  value === undefined || value === fallback || value === themeFont(doc.theme) ? null : "custom_fonts";

const authFeature = (method: SettingValue) =>
  method === "phone" ? "respondent_auth_phone" : method === "email" ? "respondent_auth_email" : "respondent_auth_google";

const onOff = [
  { value: "true", label: "On" },
  { value: "false", label: "Off" },
] as const;

// ─── where things live ───────────────────────────────────────────────────────

const DESIGN = "Build → Design";
const SETTINGS = "Settings";
const AGENT = `${SETTINGS} → Agent`;
const EMBED = "Integrate → Put it on your site";

// ─── the list ────────────────────────────────────────────────────────────────

export const SETTINGS_REGISTRY: readonly SettingDef[] = [
  // design
  def({
    key: BACKGROUND_PRESET_KEY,
    section: "design",
    label: "Theme",
    where: `${DESIGN} → Theme`,
    format: "enum",
    options: FORM_THEMES.map((t) => ({ value: t.id, label: t.name })),
    hint:
      "a ready-made theme that sets the page, text, bubbles, buttons, borders, fonts, corners and shadows together, with its own light and dark sides. " +
      "When the author asks for a look or feel rather than exact colours, pick the theme whose description fits the request and the form best; " +
      "a colour set in the same edit replaces the theme with hand-picked colours. " +
      `The themes: ${FORM_THEMES.map((t) => `${t.id} (${t.description})`).join("; ")}`,
    // No field of its own: read off the theme the form is on, and written as all of it.
    get: (doc) => matchFormTheme(doc.theme),
    set: (doc, value) => {
      if (typeof value === "string") doc.theme = applyFormTheme(doc.theme, value);
    },
  }),
  def({
    key: "theme.backgroundDecor",
    section: "design",
    label: "Background shapes",
    where: `${DESIGN} → Theme`,
    format: "bool",
    hint: "a soft pattern and one large shape behind the conversation, in the primary colour",
    // Two fields as one switch: the tile and the shape, both picked from the form's link.
    get: (doc) => backgroundDecorOn(doc.theme),
    set: (doc, value) => {
      doc.theme.backgroundPattern = value ? "auto" : "none";
      doc.theme.backgroundShape = value ? "auto" : undefined;
    },
  }),
  def({
    key: "theme.accent",
    section: "design",
    label: "Primary colour",
    where: `${DESIGN} → Colours`,
    format: "color",
    derives: "palette",
    hint: "the button colour; page, text and bubbles are recomputed to match unless set in the same edit",
  }),
  def({
    key: "theme.background",
    section: "design",
    label: "Background",
    where: `${DESIGN} → Colours`,
    format: "color",
    derives: "palette",
    hint: "a dark colour makes a dark theme; text and bubbles are recomputed to suit unless set in the same edit",
  }),
  def({
    key: "theme.colorScheme",
    section: "design",
    label: "Appearance",
    where: `${DESIGN} → Appearance`,
    format: "enum",
    options: [
      { value: "light", label: "Light" },
      { value: "dark", label: "Dark" },
      { value: "auto", label: "Auto" },
    ],
    hint: "light or dark form; auto follows each respondent's device. Colours are recomputed from the primary colour",
  }),
  def({ key: "theme.text", section: "design", label: "Text", where: `${DESIGN} → Colours`, format: "color" }),
  def({ key: "theme.botBubble", section: "design", label: "Agent bubble", where: `${DESIGN} → Colours`, format: "color" }),
  def({ key: "theme.userBubble", section: "design", label: "Their bubble", where: `${DESIGN} → Colours`, format: "color" }),
  def({ key: "theme.accentText", section: "design", label: "Button text", where: `${DESIGN} → Colours`, format: "color" }),
  def({
    key: "theme.radius",
    section: "design",
    label: "Corners",
    where: `${DESIGN} → Shape`,
    format: "enum",
    options: [
      { value: "none", label: "Square" },
      { value: "sm", label: "Small" },
      { value: "md", label: "Medium" },
      { value: "lg", label: "Large" },
      { value: "full", label: "Pill" },
    ],
  }),
  def({
    key: "theme.fontHeading",
    section: "design",
    label: "Heading font",
    where: `${DESIGN} → Fonts`,
    format: "font",
    hint: "a Google Fonts family name",
    feature: "custom_fonts",
    gate: unlessThemeFont("Bricolage Grotesque"),
  }),
  def({
    key: "theme.fontBody",
    section: "design",
    label: "Body font",
    where: `${DESIGN} → Fonts`,
    format: "font",
    hint: "a Google Fonts family name",
    feature: "custom_fonts",
    gate: unlessThemeFont("Inter"),
  }),

  // display
  def({
    key: "settings.progressBar",
    section: "display",
    label: "Progress bar",
    where: `${SETTINGS} → Display`,
    format: "enum",
    options: [
      { value: "percent", label: "Percent" },
      { value: "steps", label: "Steps" },
      { value: "none", label: "None" },
    ],
  }),
  def({
    key: "settings.navigation.allowSkip",
    section: "display",
    label: "Allow skipping optional questions",
    where: `${SETTINGS} → Display`,
    format: "bool",
  }),
  def({
    key: "settings.branding.hidePoweredBy",
    section: "display",
    label: 'Hide "Powered by chatform"',
    where: `${SETTINGS} → Display`,
    format: "bool",
    feature: "remove_branding",
  }),

  // agent persona
  def({
    key: "settings.agent.mode",
    section: "agent_persona",
    label: "Interview style",
    where: `${AGENT} → Persona`,
    format: "enum",
    options: [
      { value: "template", label: "Scripted" },
      { value: "hybrid", label: "Hybrid" },
      { value: "ai", label: "Agentic" },
    ],
    hint: "Scripted asks the author's words only; Hybrid hands unexpected replies to the agent; Agentic words every question",
  }),
  def({
    key: "settings.agent.tone",
    section: "agent_persona",
    label: "Tone",
    where: `${AGENT} → Persona`,
    format: "enum",
    options: [
      { value: "friendly", label: "Friendly" },
      { value: "professional", label: "Professional" },
      { value: "playful", label: "Playful" },
    ],
  }),
  def({
    key: "settings.agent.personaPrompt",
    section: "agent_persona",
    label: "Persona",
    where: `${AGENT} → Persona`,
    format: "longtext",
    maxLength: 2000,
    clearable: true,
    feature: "agent_persona",
  }),
  def({
    key: "settings.agent.displayName",
    section: "agent_persona",
    label: "Interviewer name",
    where: "Only through the AI for now",
    format: "text",
    maxLength: 60,
    clearable: true,
  }),
  def({
    key: "settings.agent.rephraseQuestions",
    section: "agent_persona",
    label: "Reword questions",
    where: `${AGENT} → Persona (Agentic style only)`,
    format: "bool",
  }),

  // agent goal
  def({
    key: "settings.agent.goal",
    section: "agent_goal",
    label: "Goal",
    where: `${AGENT} → Goal`,
    format: "longtext",
    maxLength: 1000,
    clearable: true,
    feature: "agent_persona",
  }),
  def({
    key: "settings.agent.successCriteria",
    section: "agent_goal",
    label: "What good looks like",
    where: `${AGENT} → Goal`,
    format: "longtext",
    maxLength: 1000,
    clearable: true,
    feature: "agent_persona",
  }),

  // guardrails
  def({
    key: "settings.agent.guardrails.answerOffTopic",
    section: "guardrails",
    label: "Answer off-topic questions",
    where: `${AGENT} → Guardrails`,
    format: "bool",
  }),
  def({
    key: "settings.agent.guardrails.refusalMessage",
    section: "guardrails",
    label: "If it must decline",
    where: `${AGENT} → Guardrails`,
    format: "text",
    maxLength: 500,
  }),
  def({
    key: "settings.agent.guardrails.forbiddenTopics",
    section: "guardrails",
    label: "Never discuss",
    where: `${AGENT} → Guardrails`,
    format: "list",
    maxItems: 20,
    maxLength: 120,
    hint: "the whole list, one topic per line",
    feature: "agent_guardrails",
  }),
  def({
    key: "settings.agent.escalateAfterInvalid",
    section: "guardrails",
    label: "Bad answers before showing a widget",
    where: `${AGENT} → Guardrails`,
    format: "int",
    min: 1,
    max: 10,
  }),

  // access
  def({
    key: "settings.requireAuth.enabled",
    section: "access",
    label: "Require sign-in",
    where: `${SETTINGS} → Access & closing`,
    format: "bool",
    gate: (v, doc) => (v === true ? authFeature(doc.settings.requireAuth.method) : null),
  }),
  def({
    key: "settings.requireAuth.method",
    section: "access",
    label: "Verify with",
    where: `${SETTINGS} → Access & closing`,
    format: "enum",
    options: [
      { value: "google", label: "Google" },
      { value: "phone", label: "Phone" },
      { value: "email", label: "Email" },
    ],
    gate: (v, doc) => (doc.settings.requireAuth.enabled ? authFeature(v) : null),
  }),
  def({
    key: "settings.requireAuth.afterBlocks",
    section: "access",
    label: "Ask after",
    where: `${SETTINGS} → Access & closing`,
    format: "int",
    min: 0,
    max: 20,
    hint: "how many answers to take before asking them to sign in; 0 is before the first question",
  }),
  def({
    key: "settings.requireAuth.message",
    section: "access",
    label: "What the agent says",
    where: `${SETTINGS} → Access & closing`,
    format: "text",
    maxLength: 300,
  }),
  def({
    key: "settings.allowResubmissions",
    section: "access",
    label: "Allow multiple responses",
    where: `${SETTINGS} → Access & closing`,
    format: "bool",
    gate: (v) => (v === false ? "duplicate_prevention" : null),
  }),
  def({
    key: "settings.captcha.enabled",
    section: "access",
    label: "Captcha",
    where: `${SETTINGS} → Access & closing`,
    format: "bool",
  }),

  // closing
  def({
    key: "settings.closeRules.closeAt",
    section: "closing",
    label: "Close on a date",
    where: `${SETTINGS} → Access & closing`,
    format: "date",
    clearable: true,
    hint: "local date and time as YYYY-MM-DDTHH:mm in the author's time zone",
  }),
  def({
    key: "settings.closeRules.maxSubmissions",
    section: "closing",
    label: "Response limit",
    where: `${SETTINGS} → Access & closing`,
    format: "int",
    min: 1,
    max: 10_000_000,
    clearable: true,
  }),
  def({
    key: "settings.closeRules.showCountdown",
    section: "closing",
    label: "Show a countdown",
    where: `${SETTINGS} → Access & closing`,
    format: "bool",
  }),
  def({
    key: "settings.closeRules.showRemaining",
    section: "closing",
    label: "Show spots left",
    where: `${SETTINGS} → Access & closing`,
    format: "bool",
  }),
  def({
    key: "settings.closeRules.closedMessageMd",
    section: "closing",
    label: "Closed message",
    where: `${SETTINGS} → Access & closing`,
    format: "longtext",
    maxLength: 5000,
    set: (doc, v) => setPath(doc, "settings.closeRules.closedMessageMd", v ?? CLOSED_MESSAGE_DEFAULT),
  }),

  // completion
  def({
    key: "settings.onComplete.notificationEmails",
    section: "completion",
    label: "Notification emails",
    where: `${SETTINGS} → On completion`,
    format: "emails",
    maxItems: 3,
    hint: "the whole list of addresses that hear about each response",
  }),
  def({
    key: "settings.onComplete.redirectUrl",
    section: "completion",
    label: "Redirect after finishing",
    where: `${SETTINGS} → On completion`,
    format: "url",
    clearable: true,
    feature: "completion_redirect",
  }),
  def({
    key: "settings.onComplete.requireSubmit",
    section: "completion",
    label: "Review before submitting",
    where: "Only through the AI for now",
    format: "bool",
    hint: "ask for an explicit submit once every question is answered",
  }),
  def({
    key: "settings.onComplete.autoReplyEmail.enabled",
    section: "completion",
    label: "Confirmation email",
    where: `${SETTINGS} → On completion → To the respondent`,
    format: "bool",
  }),
  def({
    key: "settings.onComplete.autoReplyEmail.includeAnswers",
    section: "completion",
    label: "Include their answers",
    where: `${SETTINGS} → On completion → To the respondent`,
    format: "bool",
  }),
  def({
    key: "settings.onComplete.autoReplyEmail.subject",
    section: "completion",
    label: "Confirmation subject",
    where: `${SETTINGS} → On completion → To the respondent`,
    format: "text",
    maxLength: 300,
    feature: "auto_reply_email",
    gate: unlessDefault("auto_reply_email", DEFAULT_CONFIRMATION_SUBJECT),
  }),
  def({
    key: "settings.onComplete.autoReplyEmail.bodyMd",
    section: "completion",
    label: "Confirmation message",
    where: `${SETTINGS} → On completion → To the respondent`,
    format: "longtext",
    maxLength: 10000,
    hint: "may use {{form.title}}",
    feature: "auto_reply_email",
    gate: unlessDefault("auto_reply_email", DEFAULT_CONFIRMATION_BODY),
  }),

  // sharing
  def({
    key: "settings.meta.ogTitle",
    section: "sharing",
    label: "Link preview title",
    where: `${SETTINGS} → Link & social`,
    format: "text",
    maxLength: 120,
    clearable: true,
    feature: "form_metadata",
  }),
  def({
    key: "settings.meta.ogDescription",
    section: "sharing",
    label: "Link preview description",
    where: `${SETTINGS} → Link & social`,
    format: "text",
    maxLength: 300,
    clearable: true,
    feature: "form_metadata",
  }),
  def({
    key: "settings.meta.noIndex",
    section: "sharing",
    label: "Hide from search engines",
    where: `${SETTINGS} → Link & social`,
    format: "bool",
    feature: "form_metadata",
  }),

  // embed
  def({
    key: "embed.mode",
    section: "embed",
    label: "Embed style",
    where: EMBED,
    format: "enum",
    options: [
      { value: "popup", label: "Popup" },
      { value: "inline", label: "Inline" },
      { value: "side-tab", label: "Side tab" },
      { value: "fullpage", label: "Full page" },
    ],
  }),
  def({
    key: "embed.position",
    section: "embed",
    label: "Screen corner",
    where: EMBED,
    format: "enum",
    options: [
      { value: "bottom-right", label: "Bottom right" },
      { value: "bottom-left", label: "Bottom left" },
      { value: "top-right", label: "Top right" },
      { value: "top-left", label: "Top left" },
    ],
  }),
  def({
    key: "embed.openOn",
    section: "embed",
    label: "Open by itself",
    where: EMBED,
    format: "enum",
    options: [
      { value: "click", label: "Off" },
      { value: "load", label: "On page load" },
      { value: "exit-intent", label: "When they're about to leave" },
      { value: "scroll:50", label: "After scrolling half the page" },
    ],
  }),
  def({ key: "embed.label", section: "embed", label: "Button text", where: EMBED, format: "text", maxLength: 60, clearable: true }),
  def({
    key: "embed.buttonShape",
    section: "embed",
    label: "Button shape",
    where: EMBED,
    format: "enum",
    options: [
      { value: "round", label: "Round" },
      { value: "rounded", label: "Rounded" },
      { value: "square", label: "Square" },
    ],
  }),
  def({
    key: "embed.buttonSize",
    section: "embed",
    label: "Button size",
    where: EMBED,
    format: "enum",
    options: [
      { value: "small", label: "Small" },
      { value: "medium", label: "Medium" },
      { value: "large", label: "Large" },
    ],
  }),

  // form
  def({ key: "title", section: "form", label: "Form name", where: `${SETTINGS} → Form`, format: "text", maxLength: 200 }),
  def({
    key: "form.language",
    section: "form",
    label: "Language",
    where: "Only through the AI for now",
    format: "language",
    hint: "two-letter code; the agent speaks it and the form's own buttons use it",
    // The form and its agent move together, which is the combination every
    // plan has. Only a mismatch between them is `multi_language`.
    get: (doc) => doc.settings.language,
    set: (doc, v) => {
      doc.settings.language = v as string;
      doc.settings.agent.language = v as string;
    },
  }),
];

const BY_KEY = new Map(SETTINGS_REGISTRY.map((d) => [d.key, d]));

/** Where a setting's control is, as the builder routes to it. */
export interface SettingPlace {
  tab: "build" | "settings" | "integrate";
  /** The Design sheet on Build, or the Settings tab's section. */
  panel?: "design" | "agent" | "general" | "access" | "link" | "completion";
  /** The Agent section's own sub-tab. */
  section?: "persona" | "goal" | "guardrails";
}

/**
 * The builder's own location for a setting, for a link that takes the author
 * there. Read off `where`, which is built from the same four constants, so the
 * words and the route cannot name different places. Null for a setting with
 * no control of its own yet.
 */
export function settingPlace(key: string): SettingPlace | null {
  const where = settingDef(key)?.where ?? "";
  if (where.startsWith(DESIGN)) return { tab: "build", panel: "design" };
  if (where.startsWith(`${AGENT} → Persona`)) return { tab: "settings", panel: "agent", section: "persona" };
  if (where.startsWith(`${AGENT} → Goal`)) return { tab: "settings", panel: "agent", section: "goal" };
  if (where.startsWith(`${AGENT} → Guardrails`)) return { tab: "settings", panel: "agent", section: "guardrails" };
  if (where.startsWith(`${SETTINGS} → Access`)) return { tab: "settings", panel: "access" };
  if (where.startsWith(`${SETTINGS} → Link`)) return { tab: "settings", panel: "link" };
  if (where.startsWith(`${SETTINGS} → On completion`)) return { tab: "settings", panel: "completion" };
  if (where.startsWith(SETTINGS)) return { tab: "settings", panel: "general" };
  if (where.startsWith(EMBED)) return { tab: "integrate" };
  return null;
}

export function settingDef(key: string): SettingDef | undefined {
  return BY_KEY.get(key);
}

// ─── values ──────────────────────────────────────────────────────────────────

export type ParsedSetting = { ok: true; value: SettingValue } | { ok: false; reason: string };

export interface ParseContext {
  /** `Date#getTimezoneOffset()` of the author's browser, for dates written in local time. */
  utcOffsetMinutes?: number;
  /** When given, a date before it is refused: nobody closes a form in the past on purpose. */
  now?: number;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/;

function splitList(raw: string): string[] {
  return raw
    .split(/\n|;|,(?=\s*\S+@)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Text from the model into a value for this setting, or the reason it is not one.
 *
 * Strict where the document schema is forgiving: `FormDoc` catches a bad colour
 * back to the default so a stored form keeps loading, but a proposal carrying one
 * should be refused and retried, not silently turned into orange.
 */
export function parseSettingValue(d: SettingDef, input: string, ctx: ParseContext = {}): ParsedSetting {
  const raw = input.trim();
  if (raw === "" && d.clearable) return { ok: true, value: undefined };
  const fail = (reason: string): ParsedSetting => ({ ok: false, reason: `${d.key}: ${reason}` });

  switch (d.format) {
    case "color":
      return THEME_COLOR_PATTERN.test(raw) && raw.length <= 40 ? { ok: true, value: raw } : fail("not a CSS colour, use a hex like #1E40AF");
    case "bool": {
      const v = raw.toLowerCase();
      if (["true", "on", "yes"].includes(v)) return { ok: true, value: true };
      if (["false", "off", "no"].includes(v)) return { ok: true, value: false };
      return fail("use true or false");
    }
    case "enum": {
      const hit = d.options?.find((o) => o.value === raw || o.label.toLowerCase() === raw.toLowerCase());
      return hit ? { ok: true, value: hit.value } : fail(`one of ${d.options?.map((o) => o.value).join(", ")}`);
    }
    case "int": {
      if (!/^-?\d+$/.test(raw)) return fail("a whole number");
      const n = Number(raw);
      if (d.min !== undefined && n < d.min) return fail(`at least ${d.min}`);
      if (d.max !== undefined && n > d.max) return fail(`at most ${d.max}`);
      return { ok: true, value: n };
    }
    case "text":
    case "longtext":
      if (raw === "") return fail("cannot be empty");
      return d.maxLength && raw.length > d.maxLength ? fail(`at most ${d.maxLength} characters`) : { ok: true, value: raw };
    case "url": {
      try {
        const u = new URL(raw);
        if (u.protocol !== "https:" && u.protocol !== "http:") return fail("an http(s) link");
        return raw.length > 1000 ? fail("too long") : { ok: true, value: u.toString() };
      } catch {
        return fail("a full link starting with https://");
      }
    }
    case "emails":
    case "list": {
      const items = splitList(raw);
      if (d.maxItems !== undefined && items.length > d.maxItems) return fail(`at most ${d.maxItems} entries`);
      if (d.format === "emails") {
        const bad = items.find((e) => !EMAIL.test(e));
        if (bad) return fail(`${bad} is not an email address`);
      }
      const long = d.maxLength ? items.find((s) => s.length > d.maxLength!) : undefined;
      return long ? fail(`"${long.slice(0, 30)}…" is longer than ${d.maxLength} characters`) : { ok: true, value: items };
    }
    case "font": {
      const hit = GOOGLE_FONT_FAMILIES.find((f) => f.toLowerCase() === raw.toLowerCase());
      return hit ? { ok: true, value: hit } : fail(`"${raw}" is not a Google Fonts family`);
    }
    case "language":
      return /^[a-z]{2}$/i.test(raw) ? { ok: true, value: raw.toLowerCase() } : fail("a two-letter language code like en or hi");
    case "date": {
      let at: number;
      if (/Z$|[+-]\d{2}:\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw))) {
        at = Date.parse(raw);
      } else {
        const m = LOCAL_DATE.exec(raw);
        if (!m) return fail("a date as YYYY-MM-DD or YYYY-MM-DDTHH:mm");
        const [, y, mo, da, h = "23", mi = "59"] = m;
        const utc = Date.UTC(Number(y), Number(mo) - 1, Number(da), Number(h), Number(mi));
        if (Number.isNaN(utc)) return fail("not a real date");
        at = utc + (ctx.utcOffsetMinutes ?? 0) * 60_000;
      }
      if (ctx.now !== undefined && at <= ctx.now) {
        return fail(`${raw} has already passed; today is ${new Date(ctx.now).toISOString().slice(0, 10)}`);
      }
      return { ok: true, value: new Date(at).toISOString() };
    }
  }
}

// ─── applying ────────────────────────────────────────────────────────────────

export interface SettingOp {
  key: string;
  value: string;
}

export interface SettingChange {
  key: string;
  section: SettingSection;
  label: string;
  where: string;
  format: SettingFormat;
  before: SettingValue;
  after: SettingValue;
  /** Set when the plan does not include it: shown, never applied. */
  locked?: { feature: string };
}

export interface AppliedSettings {
  doc: FormDoc;
  changes: SettingChange[];
  /** Ops that named no setting or carried a value that does not parse, with why. */
  rejected: string[];
}

const same = (a: SettingValue, b: SettingValue) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Setting ops onto a copy of a document.
 *
 * Gates are judged against the document every op has landed on, because two
 * ops can decide one gate between them: "require phone sign-in" is an enable
 * and a method, and which feature it needs depends on both.
 *
 * A locked change is reported and then undone, so the returned document holds
 * only what the plan allows. `allowed` is omitted by a caller that trusts the
 * changes it is replaying (the builder applying a checked proposal).
 */
export function applySettingOps(
  base: FormDoc,
  ops: readonly SettingOp[],
  opts: {
    allowed?: (feature: string) => boolean;
    parse?: ParseContext;
    /** Recompute the colours that follow a changed one, as the Design panel does. On unless a caller will do it itself. */
    derive?: boolean;
  } = {},
): AppliedSettings {
  const doc = structuredClone(base);
  const rejected: string[] = [];
  const pending: { d: SettingDef; before: SettingValue; after: SettingValue }[] = [];

  // A preset first, whatever order it was named in: it writes every colour, and
  // a colour named beside it is a change on top of the preset, not under it.
  const ordered = [...ops].sort((a, b) => Number(b.key === BACKGROUND_PRESET_KEY) - Number(a.key === BACKGROUND_PRESET_KEY));
  for (const op of ordered) {
    const d = settingDef(op.key);
    if (!d) {
      rejected.push(`${op.key}: not a setting`);
      continue;
    }
    const parsed = parseSettingValue(d, op.value, opts.parse);
    if (!parsed.ok) {
      rejected.push(parsed.reason);
      continue;
    }
    const before = d.get(doc);
    if (same(before, parsed.value)) continue;
    d.set(doc, parsed.value);
    const prior = pending.findIndex((p) => p.d.key === d.key);
    if (prior >= 0) pending[prior]!.after = parsed.value;
    else pending.push({ d, before, after: parsed.value });
  }

  const changes: SettingChange[] = [];
  for (const { d, before, after } of pending) {
    const needs = d.gate?.(after, doc) ?? null;
    const locked = needs && opts.allowed && !opts.allowed(needs) ? { feature: needs } : undefined;
    changes.push({ key: d.key, section: d.section, label: d.label, where: d.where, format: d.format, before, after, locked });
  }
  for (const c of changes) if (c.locked) settingDef(c.key)!.set(doc, c.before);
  if (opts.derive !== false) deriveTheme(doc, new Set(changes.filter((c) => !c.locked).map((c) => c.key)));

  return { doc, changes, rejected };
}

/** Every colour a theme stores, the ones `themeFromAccent` works out together. */
export const PALETTE_KEYS = [
  "background",
  "surface",
  "text",
  "accent",
  "accentText",
  "botBubble",
  "userBubble",
  "userBubbleText",
] as const satisfies readonly (keyof ThemeDoc)[];

/**
 * The colours that follow from the ones just changed, worked out the way the
 * Design panel does it, in place.
 *
 * Light or dark flips the palette with it (`withAppearance`), and a new
 * primary colour or background recomputes the rest from the primary, light or
 * dark as the background now is. A colour set in the same change is kept as
 * set: the author named it. Shared by the builder's Apply, a new form's
 * settings and `/v1`, so none of them can leave white bubbles on a navy page.
 */
export function deriveTheme(doc: FormDoc, changed: ReadonlySet<string>): void {
  // A preset is a finished palette: nothing around it is recomputed.
  if (changed.has(BACKGROUND_PRESET_KEY)) return;
  // A colour named by hand replaces the theme: its tokens would paint over it.
  if (PALETTE_KEYS.some((k) => changed.has(`theme.${k}`))) doc.theme = withoutFormTheme(doc.theme);
  if (changed.has("theme.colorScheme")) doc.theme = withAppearance(doc.theme, doc.theme.colorScheme);
  if (![...changed].some((k) => settingDef(k)?.derives === "palette")) return;
  const palette = themeFromAccent(doc.theme.accent, { dark: isDarkTheme(doc.theme) });
  if (!palette) return;
  for (const key of PALETTE_KEYS) {
    if (!changed.has(`theme.${key}`)) doc.theme[key] = palette[key];
  }
}

/**
 * Which values of a setting this plan cannot have, tried one by one.
 *
 * Only for the settings with a short list of values, where trying every one is
 * cheap and exact. Whether "Require sign-in" is paid depends on the sign-in
 * method the form has, and whether a method is paid depends on whether sign-in
 * is on, so the answer is read off the gate itself on this document rather
 * than written down a second time here.
 */
function lockedValues(d: SettingDef, doc: FormDoc, allowed: (feature: string) => boolean): { all: boolean; byValue: Map<string, string> } {
  const byValue = new Map<string, string>();
  const candidates = d.format === "bool" ? ["true", "false"] : d.format === "enum" ? d.options!.map((o) => o.value) : [];
  let changing = 0;
  for (const value of candidates) {
    const change = applySettingOps(doc, [{ key: d.key, value }], { allowed }).changes[0];
    if (!change) continue;
    changing++;
    if (change.locked) byValue.set(value, change.locked.feature);
  }
  return { all: changing > 0 && byValue.size === changing, byValue };
}

/**
 * The keys a request may name: its sections, less the settings the plan
 * locks outright, whether by feature or because every change it could make
 * on this document is paid.
 */
export function settingKeysFor(sections: readonly SettingSection[], allowed: (feature: string) => boolean, doc?: FormDoc): string[] {
  const wanted = new Set(sections);
  return SETTINGS_REGISTRY.filter(
    (d) => wanted.has(d.section) && (!d.feature || allowed(d.feature)) && !(doc && lockedValues(d, doc, allowed).all),
  ).map((d) => d.key);
}

function display(d: SettingDef, v: SettingValue): string {
  if (v === undefined || v === null || v === "") return "(not set)";
  if (Array.isArray(v)) return v.length ? v.join("; ") : "(none)";
  if (typeof v === "boolean") return v ? "on" : "off";
  const opt = d.options?.find((o) => o.value === v);
  return opt ? `${opt.value} (${opt.label})` : String(v);
}

/**
 * The prompt's view of some sections: every key with its current value.
 *
 * One line per setting, so a section costs what it holds. Locked ones are named
 * as locked rather than hidden: an author asking for them should hear which
 * plan they need, not an AI that pretends the setting does not exist. So are
 * the paid values of a setting that is otherwise free.
 */
export function renderSettingsForPrompt(
  doc: FormDoc,
  sections: readonly SettingSection[],
  allowed: (feature: string) => boolean,
  /** The plan that unlocks a feature, by name. */
  planFor: (feature: string) => string,
): string {
  const offered = new Set(settingKeysFor(sections, allowed, doc));
  const lines: string[] = [];
  for (const section of sections) {
    lines.push(`## ${section}: ${SETTING_SECTIONS[section]}`);
    for (const d of SETTINGS_REGISTRY.filter((x) => x.section === section)) {
      const locks = lockedValues(d, doc, allowed);
      const paid = (value: string) => {
        const f = locks.byValue.get(value);
        return f ? ` [needs ${planFor(f)}]` : "";
      };
      const kind =
        d.format === "enum"
          ? `one of ${d.options!.map((o) => `${o.value}${offered.has(d.key) ? paid(o.value) : ""}`).join(" | ")}`
          : d.format === "int"
            ? `whole number ${d.min}-${d.max}`
            : d.format;
      const needs = d.feature && !allowed(d.feature) ? d.feature : [...locks.byValue.values()][0];
      const lock = offered.has(d.key) ? "" : ` [LOCKED: needs ${needs ? planFor(needs) : "a higher"} plan]`;
      const extra = [d.maxLength ? `max ${d.maxLength} chars` : "", d.clearable ? "empty clears it" : "", d.hint ?? ""]
        .filter(Boolean)
        .join("; ");
      lines.push(`- ${d.key} "${d.label}" (${kind}${extra ? `; ${extra}` : ""}) now: ${display(d, d.get(doc))}${lock}`);
    }
  }
  return lines.join("\n");
}
