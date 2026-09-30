import type { BackgroundShape, ThemeDoc } from "./settings";

/**
 * Named backgrounds: a page colour, a tile and the colours that sit on them,
 * chosen together so they look like one decision.
 *
 * One list for everyone. The Design sheet shows them beside the pattern tiles,
 * the builder AI and `/v1` pick one by id through the settings registry
 * (`theme.backgroundPreset`), and all of them apply it with
 * `applyBackgroundPreset`, so a preset picked by hand and one picked by the AI
 * are the same theme.
 *
 * Every colour is spelled out, ink included, rather than derived: a preset is
 * a finished palette, and a test holds every text and bubble pair to 4.5:1 on
 * its own, before the web app's `readableTheme` safety net ever runs.
 *
 * `pattern` is a tile id from `apps/web/src/lib/background-patterns.ts`. This
 * package does not import the SVG, so a web test checks each id is a real tile.
 *
 * `description` is written for two readers: the author hovering a swatch and
 * the model choosing one. It says what the preset feels like and where it
 * fits, and the model judges from that; there is no topic-to-preset table.
 */
export interface BackgroundPreset {
  id: string;
  name: string;
  description: string;
  dark: boolean;
  pattern: string;
  /** The tile's ink, when the primary colour is not the right one for it. */
  patternColor?: string;
  /** The large soft shape behind the conversation, if any. */
  shape?: BackgroundShape;
  colors: Pick<
    ThemeDoc,
    "background" | "surface" | "text" | "accent" | "accentText" | "botBubble" | "userBubble" | "userBubbleText"
  >;
}

export const BACKGROUND_PRESETS: readonly BackgroundPreset[] = [
  {
    id: "peach-linen",
    name: "Peach linen",
    description: "warm and friendly, for hospitality, events, community sign-ups",
    dark: false,
    pattern: "dots",
    shape: "blob",
    colors: {
      background: "#ffe4d3",
      surface: "#ffffff",
      text: "#3a2418",
      accent: "#c2410c",
      accentText: "#fffaf5",
      botBubble: "#ffffff",
      userBubble: "#c2410c",
      userBubbleText: "#ffffff",
    },
  },
  {
    id: "lilac-haze",
    name: "Lilac haze",
    description: "soft and creative, for design studios, workshops, wellbeing check-ins",
    dark: false,
    pattern: "rings",
    shape: "rings",
    colors: {
      background: "#ece3ff",
      surface: "#ffffff",
      text: "#2a1f3d",
      accent: "#6d3fc7",
      accentText: "#fbf8ff",
      botBubble: "#ffffff",
      userBubble: "#6d3fc7",
      userBubbleText: "#ffffff",
    },
  },
  {
    id: "mint-fresh",
    name: "Mint fresh",
    description: "clean and upbeat, for health, fitness, food and sustainability",
    dark: false,
    pattern: "plus",
    shape: "wave",
    colors: {
      background: "#d9f2e6",
      surface: "#ffffff",
      text: "#12342a",
      accent: "#0f766e",
      accentText: "#f5fffb",
      botBubble: "#ffffff",
      userBubble: "#0f766e",
      userBubbleText: "#ffffff",
    },
  },
  {
    id: "sky-breeze",
    name: "Sky breeze",
    description: "calm and trustworthy, for support, education, product feedback",
    dark: false,
    pattern: "wave",
    shape: "wave",
    colors: {
      background: "#dbeafe",
      surface: "#ffffff",
      text: "#13263f",
      accent: "#1d4ed8",
      accentText: "#f7faff",
      botBubble: "#ffffff",
      userBubble: "#1d4ed8",
      userBubbleText: "#ffffff",
    },
  },
  {
    id: "butter-cream",
    name: "Butter cream",
    description: "sunny and cheerful, for bakeries, kids' activities, casual surveys",
    dark: false,
    pattern: "dots-offset",
    shape: "blob",
    colors: {
      background: "#fff1bf",
      surface: "#ffffff",
      text: "#3a2e0b",
      accent: "#1c1917",
      accentText: "#fff1bf",
      botBubble: "#ffffff",
      userBubble: "#1c1917",
      userBubbleText: "#fff1bf",
    },
  },
  {
    id: "rose-petal",
    name: "Rose petal",
    description: "gentle and personal, for weddings, beauty, gifts and RSVPs",
    dark: false,
    pattern: "scallops",
    shape: "rings",
    colors: {
      background: "#ffdce8",
      surface: "#ffffff",
      text: "#3d1424",
      accent: "#be185d",
      accentText: "#fff7fa",
      botBubble: "#ffffff",
      userBubble: "#be185d",
      userBubbleText: "#ffffff",
    },
  },
  {
    id: "sand-dune",
    name: "Sand dune",
    description: "earthy and relaxed, for travel, real estate, interiors, craft",
    dark: false,
    pattern: "grid-fine",
    shape: "wave",
    colors: {
      background: "#f1e8dc",
      surface: "#ffffff",
      text: "#33271a",
      accent: "#9a3412",
      accentText: "#fffaf3",
      botBubble: "#ffffff",
      userBubble: "#9a3412",
      userBubbleText: "#ffffff",
    },
  },
  {
    id: "sage-garden",
    name: "Sage garden",
    description: "natural and grounded, for outdoors, farming, nonprofits, mindfulness",
    dark: false,
    pattern: "diagonal",
    shape: "blob",
    colors: {
      background: "#e8f0d8",
      surface: "#ffffff",
      text: "#1f2a17",
      accent: "#4d7c0f",
      accentText: "#f8fcf3",
      botBubble: "#ffffff",
      userBubble: "#4d7c0f",
      userBubbleText: "#ffffff",
    },
  },
  {
    id: "clean-paper",
    name: "Clean paper",
    description: "neutral and minimal, for business, legal, finance, anything formal",
    dark: false,
    pattern: "grid",
    colors: {
      background: "#fafafa",
      surface: "#ffffff",
      text: "#18181b",
      accent: "#27272a",
      accentText: "#fafafa",
      botBubble: "#ffffff",
      userBubble: "#e4e4e7",
      userBubbleText: "#18181b",
    },
  },
  {
    id: "slate-studio",
    name: "Slate studio",
    description: "cool and professional, for SaaS, recruiting, B2B research",
    dark: false,
    pattern: "pinstripe",
    shape: "rings",
    colors: {
      background: "#f1f5f9",
      surface: "#ffffff",
      text: "#0f172a",
      accent: "#334155",
      accentText: "#f8fafc",
      botBubble: "#ffffff",
      userBubble: "#cbd5e1",
      userBubbleText: "#0f172a",
    },
  },
  {
    id: "party-confetti",
    name: "Party confetti",
    description: "playful and festive, for parties, launches, giveaways, celebrations",
    dark: false,
    pattern: "confetti",
    shape: "blob",
    colors: {
      background: "#f3e6ff",
      surface: "#ffffff",
      text: "#2b1638",
      accent: "#9333ea",
      accentText: "#fdf9ff",
      botBubble: "#ffffff",
      userBubble: "#9333ea",
      userBubbleText: "#ffffff",
    },
  },
  {
    id: "teal-lagoon",
    name: "Teal lagoon",
    description: "cool and calm, for health, travel and service feedback",
    dark: false,
    pattern: "dots-offset",
    shape: "wave",
    colors: {
      background: "#dff5f7",
      surface: "#ffffff",
      text: "#0b2e33",
      accent: "#0e6b75",
      accentText: "#ffffff",
      botBubble: "#ffffff",
      userBubble: "#0e6b75",
      userBubbleText: "#ffffff",
    },
  },
  {
    id: "tangerine",
    name: "Tangerine",
    description: "loud and energetic, for launches, giveaways, quizzes and campaigns",
    dark: true,
    pattern: "wave",
    shape: "blob",
    patternColor: "#1c1917",
    colors: {
      background: "#f26b1d",
      surface: "#fff7f0",
      text: "#1c1917",
      accent: "#1c1917",
      accentText: "#ffffff",
      botBubble: "#fff7f0",
      userBubble: "#1c1917",
      userBubbleText: "#ffffff",
    },
  },
  {
    id: "violet-pop",
    name: "Violet pop",
    description: "bold and playful, for quizzes, product finders and creative brands",
    dark: true,
    pattern: "rings",
    shape: "rings",
    patternColor: "#ffffff",
    colors: {
      background: "#5b2ee6",
      surface: "#4a22c9",
      text: "#ffffff",
      accent: "#ffd166",
      accentText: "#1c1917",
      botBubble: "#4a22c9",
      userBubble: "#ffd166",
      userBubbleText: "#1c1917",
    },
  },
  {
    id: "deep-navy",
    name: "Deep navy",
    description: "dark, confident and polished, for tech, finance, premium services",
    dark: true,
    pattern: "grid",
    shape: "rings",
    colors: {
      background: "#221d44",
      surface: "#2d2757",
      text: "#f5f3ff",
      accent: "#ff8a4c",
      accentText: "#1c1917",
      botBubble: "#332c5e",
      userBubble: "#ff8a4c",
      userBubbleText: "#1c1917",
    },
  },
  {
    id: "ink",
    name: "Ink",
    description: "dark and dramatic, for creative portfolios, nightlife, gaming, film",
    dark: true,
    pattern: "dots-dense",
    colors: {
      background: "#121214",
      surface: "#1a1a1e",
      text: "#f4f4f5",
      accent: "#fbbf24",
      accentText: "#1c1400",
      botBubble: "#1f1f24",
      userBubble: "#3a3a42",
      userBubbleText: "#f4f4f5",
    },
  },
  {
    id: "forest-night",
    name: "Forest night",
    description: "dark and calm, for outdoors, eco projects, late-night reflection",
    dark: true,
    pattern: "diamonds",
    shape: "wave",
    colors: {
      background: "#0f1d17",
      surface: "#152720",
      text: "#e6f2eb",
      accent: "#5ee0a0",
      accentText: "#06231a",
      botBubble: "#1a2f26",
      userBubble: "#25513f",
      userBubbleText: "#eafaf1",
    },
  },
  {
    id: "plum-velvet",
    name: "Plum velvet",
    description: "dark and luxurious, for fashion, music, evening events",
    dark: true,
    pattern: "crosshatch",
    shape: "blob",
    colors: {
      background: "#1c1224",
      surface: "#251830",
      text: "#f3eaf8",
      accent: "#d8a6f5",
      accentText: "#25103a",
      botBubble: "#2a1c36",
      userBubble: "#4b2d63",
      userBubbleText: "#f7eefc",
    },
  },
];

export function backgroundPreset(id: string | null | undefined): BackgroundPreset | undefined {
  return id ? BACKGROUND_PRESETS.find((p) => p.id === id) : undefined;
}

/**
 * The theme with a preset on it: its colours, its tile and its tile ink (or
 * none, so a hand-picked ink from before does not clash). A dark preset makes
 * the form dark; a light one keeps Auto if the form is on it. Its shape comes
 * too, but matching (below) ignores it, so swapping the shape afterwards is a
 * tweak on the preset rather than leaving it. Fonts, corners,
 * the logo and the tile's opacity are left alone. An unknown id changes
 * nothing.
 */
export function applyBackgroundPreset(theme: ThemeDoc, id: string): ThemeDoc {
  const p = backgroundPreset(id);
  if (!p) return theme;
  return {
    ...theme,
    ...p.colors,
    backgroundPattern: p.pattern,
    backgroundPatternColor: p.patternColor,
    backgroundShape: p.shape,
    colorScheme: p.dark ? "dark" : theme.colorScheme === "auto" ? "auto" : "light",
  };
}

const same = (a: string | undefined, b: string | undefined) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();

/** The preset this theme is still on, or undefined once any of its values was changed by hand. */
export function matchBackgroundPreset(theme: ThemeDoc): BackgroundPreset | undefined {
  return BACKGROUND_PRESETS.find(
    (p) =>
      theme.backgroundPattern === p.pattern &&
      same(theme.backgroundPatternColor, p.patternColor) &&
      (Object.keys(p.colors) as (keyof BackgroundPreset["colors"])[]).every((k) => same(theme[k], p.colors[k])),
  );
}
