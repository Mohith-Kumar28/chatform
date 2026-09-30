/**
 * tweakcn's themes, as the form themes chatform offers.
 *
 * `theme-presets.ts`, `defaults.ts` and `types.ts` are tweakcn's own code
 * (Apache 2.0, see ./LICENSE). This file adds what a form needs on top: the
 * themes in tweakcn's order with "Default" first, merged exactly the way
 * tweakcn merges them, its shadow maths, and one line per theme for the
 * builder AI to choose by.
 *
 * A theme is applied the way tweakcn applies it: every token becomes a CSS
 * variable (`--background`, `--primary`, `--radius`, `--font-sans`, …) on the
 * form's root, so the chat and any shadcn component inside it restyle
 * together. See `themeTokenVars` below and `chatThemeVars` in the web app.
 */
import { COMMON_STYLES, defaultDarkThemeStyles, defaultLightThemeStyles } from "./defaults";
import { defaultPresets } from "./theme-presets";
import type { ThemePreset, ThemeStyleProps, ThemeStyles } from "./types";

export type { ThemeStyleProps, ThemeStyles } from "./types";
export { COMMON_STYLES } from "./defaults";

/** tweakcn's `mergePresetWithDefaults` (utils/theme-preset-helper.ts), verbatim in behaviour. */
function mergePresetWithDefaults(presetStyles: ThemePreset["styles"]): ThemeStyles {
  return {
    light: { ...defaultLightThemeStyles, ...(presetStyles.light || {}) },
    dark: { ...defaultDarkThemeStyles, ...(presetStyles.light || {}), ...(presetStyles.dark || {}) },
  };
}

/**
 * What each theme feels like and where it fits, for the builder AI (it picks
 * a theme by id from these) and the swatch tooltip. The model judges from the
 * words; there is no topic-to-theme table.
 */
const DESCRIPTIONS: Record<string, string> = {
  default: "neutral black and white, the plain shadcn look; fits anything",
  "modern-minimal": "clean white with a calm blue, for product, SaaS and support",
  "violet-bloom": "bright violet with very round corners, friendly and modern",
  "t3-chat": "soft pink-mauve, gentle and conversational",
  twitter: "crisp white and sky blue with round corners, social and familiar",
  "mocha-mousse": "warm coffee and cream, cosy, for food, cafés and lifestyle",
  bubblegum: "playful pink with hard shadows, for fun, youth and events",
  "amethyst-haze": "muted lavender, calm and soft, for wellbeing and creative work",
  notebook: "hand-drawn pencil-on-paper look, for classrooms, journals and informal notes",
  "doom-64": "gritty grey and blood red, sharp corners, for games and bold brands",
  catppuccin: "pastel purple on soft grey, a developer favourite",
  graphite: "grey and charcoal, sober and professional",
  perpetuity: "teal on pale aqua in a typewriter font, technical and distinctive",
  "kodama-grove": "earthy olive and parchment with a serif, natural and calm",
  "cosmic-night": "indigo and violet, mysterious and night-sky",
  tangerine: "cool grey with a vivid orange, energetic and practical",
  "quantum-rose": "hot pink and rose, bold and romantic",
  nature: "forest green on warm off-white, for outdoors, sustainability and health",
  "bold-tech": "electric violet on white, sharp and technical",
  "elegant-luxury": "deep burgundy on ivory, refined, for fashion and premium services",
  "amber-minimal": "white with amber, minimal and warm",
  supabase: "mint green on near-white, developer tooling",
  "neo-brutalism": "black outlines, hard offset shadows, square corners and loud red; bold and punchy",
  "solar-dusk": "burnt orange on warm cream, sunset and desert",
  claymorphism: "soft clay tones with large round corners and soft shadows, tactile and friendly",
  cyberpunk: "neon magenta and cyan, futuristic, for gaming and tech events",
  "pastel-dreams": "pastel lilac with very round corners, dreamy and gentle",
  "clean-slate": "slate grey and indigo, tidy and corporate",
  caffeine: "espresso brown on white, understated and warm",
  "ocean-breeze": "pale blue and fresh green, airy and optimistic",
  "retro-arcade": "solarized cream with magenta and cyan, retro and playful",
  "midnight-bloom": "violet on light grey, modern and polished",
  candyland: "candy pink and sky blue, sweet and cheerful, for kids and parties",
  "northern-lights": "green and teal aurora tones, fresh and calm",
  "vintage-paper": "sepia paper with a serif, nostalgic, for heritage and books",
  "sunset-horizon": "coral and peach, warm and welcoming, for travel and hospitality",
  "starry-night": "deep blue with a serif, classic and artistic",
  claude: "terracotta on warm paper, thoughtful and literary",
  vercel: "pure black and white in Geist, stark and minimal",
  darkmatter: "copper orange in a monospace font, technical and moody",
  mono: "greyscale monospace with square corners, stark and utilitarian",
  "soft-pop": "indigo and lime with bold outlines, playful and bright",
  "sage-garden": "muted sage green, calm and natural",
};

export interface FormTheme {
  id: string;
  name: string;
  description: string;
  styles: ThemeStyles;
}

/** The themes, tweakcn's "Default" first and the rest in tweakcn's own order. */
export const FORM_THEMES: readonly FormTheme[] = [
  {
    id: "default",
    name: "Default",
    description: DESCRIPTIONS.default!,
    styles: { light: defaultLightThemeStyles, dark: defaultDarkThemeStyles },
  },
  ...Object.entries(defaultPresets).map(([id, preset]) => ({
    id,
    name: preset.label ?? id,
    description: DESCRIPTIONS[id] ?? preset.label ?? id,
    styles: mergePresetWithDefaults(preset.styles),
  })),
];

export function formTheme(id: string | null | undefined): FormTheme | undefined {
  return id ? FORM_THEMES.find((t) => t.id === id) : undefined;
}

const COMMON = new Set<string>(COMMON_STYLES);

/**
 * tweakcn's `getShadowMap` (utils/shadows.ts): the shadow scale built from a
 * theme's six shadow tokens. Its colour is written with `color-mix` instead of
 * tweakcn's `hsl(<converted> / a)`, which needs a colour library; the result
 * is the same colour at the same alpha.
 */
export function shadowMap(styles: ThemeStyleProps, common: ThemeStyleProps = styles): Record<string, string> {
  const offsetX = common["shadow-offset-x"];
  const offsetY = common["shadow-offset-y"];
  const blur = common["shadow-blur"];
  const spread = common["shadow-spread"];
  const opacity = parseFloat(common["shadow-opacity"]);
  const shadowColor = styles["shadow-color"];
  const color = (m: number) => `color-mix(in srgb, ${shadowColor} ${Math.min(100, Math.max(0, opacity * m * 100)).toFixed(0)}%, transparent)`;
  const second = (y: string, b: string) => `${offsetX} ${y} ${b} ${parseFloat(spread?.replace("px", "") ?? "0") - 1}px ${color(1.0)}`;
  const first = (m: number) => `${offsetX} ${offsetY} ${blur} ${spread} ${color(m)}`;
  return {
    "shadow-2xs": first(0.5),
    "shadow-xs": first(0.5),
    "shadow-2xl": first(2.5),
    "shadow-sm": `${first(1)}, ${second("1px", "2px")}`,
    shadow: `${first(1)}, ${second("1px", "2px")}`,
    "shadow-md": `${first(1)}, ${second("2px", "4px")}`,
    "shadow-lg": `${first(1)}, ${second("4px", "6px")}`,
    "shadow-xl": `${first(1)}, ${second("8px", "10px")}`,
  };
}

/**
 * Every CSS variable tweakcn's `applyThemeToElement` sets, for one mode: the
 * common keys from the light styles, the colours from the mode's own, and the
 * shadow scale. Returned as a map so a React `style` can carry it; tweakcn
 * writes the same pairs with `setAttribute`.
 */
export function themeTokenVars(styles: ThemeStyles, mode: "light" | "dark"): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(styles.light)) {
    if (COMMON.has(key) && typeof value === "string") out[`--${key}`] = value;
  }
  for (const [key, value] of Object.entries(styles[mode])) {
    if (!COMMON.has(key) && typeof value === "string") out[`--${key}`] = value;
  }
  for (const [key, value] of Object.entries(shadowMap(styles[mode], styles.light))) out[`--${key}`] = value;
  return out;
}
