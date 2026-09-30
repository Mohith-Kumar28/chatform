import type { ThemeDoc } from "./settings";

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
    colors: {
      background: "#fdf1e8",
      surface: "#ffffff",
      text: "#3a2418",
      accent: "#c2410c",
      accentText: "#fffaf5",
      botBubble: "#ffffff",
      userBubble: "#fbd3bb",
      userBubbleText: "#3b1a0a",
    },
  },
  {
    id: "lilac-haze",
    name: "Lilac haze",
    description: "soft and creative, for design studios, workshops, wellbeing check-ins",
    dark: false,
    pattern: "rings",
    colors: {
      background: "#f5f0fc",
      surface: "#ffffff",
      text: "#2a1f3d",
      accent: "#6d3fc7",
      accentText: "#fbf8ff",
      botBubble: "#ffffff",
      userBubble: "#dccbf5",
      userBubbleText: "#241638",
    },
  },
  {
    id: "mint-fresh",
    name: "Mint fresh",
    description: "clean and upbeat, for health, fitness, food and sustainability",
    dark: false,
    pattern: "plus",
    colors: {
      background: "#eefaf4",
      surface: "#ffffff",
      text: "#12342a",
      accent: "#0f766e",
      accentText: "#f5fffb",
      botBubble: "#ffffff",
      userBubble: "#bfe9d6",
      userBubbleText: "#0d2e22",
    },
  },
  {
    id: "sky-breeze",
    name: "Sky breeze",
    description: "calm and trustworthy, for support, education, product feedback",
    dark: false,
    pattern: "wave",
    colors: {
      background: "#eff6fd",
      surface: "#ffffff",
      text: "#13263f",
      accent: "#1d4ed8",
      accentText: "#f7faff",
      botBubble: "#ffffff",
      userBubble: "#c7ddf7",
      userBubbleText: "#0f2240",
    },
  },
  {
    id: "butter-cream",
    name: "Butter cream",
    description: "sunny and cheerful, for bakeries, kids' activities, casual surveys",
    dark: false,
    pattern: "dots-offset",
    colors: {
      background: "#fdf8e4",
      surface: "#ffffff",
      text: "#3a2e0b",
      accent: "#8a5a00",
      accentText: "#fffdf5",
      botBubble: "#ffffff",
      userBubble: "#f1d886",
      userBubbleText: "#33280a",
    },
  },
  {
    id: "rose-petal",
    name: "Rose petal",
    description: "gentle and personal, for weddings, beauty, gifts and RSVPs",
    dark: false,
    pattern: "scallops",
    colors: {
      background: "#fdf0f3",
      surface: "#ffffff",
      text: "#3d1424",
      accent: "#be185d",
      accentText: "#fff7fa",
      botBubble: "#ffffff",
      userBubble: "#f8cddb",
      userBubbleText: "#3a1022",
    },
  },
  {
    id: "sand-dune",
    name: "Sand dune",
    description: "earthy and relaxed, for travel, real estate, interiors, craft",
    dark: false,
    pattern: "grid-fine",
    colors: {
      background: "#f7f1e8",
      surface: "#ffffff",
      text: "#33271a",
      accent: "#92400e",
      accentText: "#fffaf3",
      botBubble: "#ffffff",
      userBubble: "#e9d9bf",
      userBubbleText: "#2e2214",
    },
  },
  {
    id: "sage-garden",
    name: "Sage garden",
    description: "natural and grounded, for outdoors, farming, nonprofits, mindfulness",
    dark: false,
    pattern: "diagonal",
    colors: {
      background: "#f1f5ee",
      surface: "#ffffff",
      text: "#1f2a17",
      accent: "#3f6212",
      accentText: "#f8fcf3",
      botBubble: "#ffffff",
      userBubble: "#d3e2c6",
      userBubbleText: "#1c2714",
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
    colors: {
      background: "#fdf6ff",
      surface: "#ffffff",
      text: "#2b1638",
      accent: "#9333ea",
      accentText: "#fdf9ff",
      botBubble: "#ffffff",
      userBubble: "#ecd3fb",
      userBubbleText: "#28123a",
    },
  },
  {
    id: "deep-navy",
    name: "Deep navy",
    description: "dark, confident and polished, for tech, finance, premium services",
    dark: true,
    pattern: "grid",
    colors: {
      background: "#0f1a2e",
      surface: "#16233b",
      text: "#e8eef8",
      accent: "#7cb4ff",
      accentText: "#0a1628",
      botBubble: "#1b2a45",
      userBubble: "#2c4a7a",
      userBubbleText: "#eef4ff",
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
 * the form dark; a light one keeps Auto if the form is on it. Fonts, corners,
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
