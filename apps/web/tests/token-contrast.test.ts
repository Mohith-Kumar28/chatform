import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contrast of the token pairs, checked rather than eyeballed.
 *
 * A pale wash and its ink are defined in two different places in `globals.css`,
 * once per theme, and nothing connected them — so `--warning-soft` with
 * `--warning-foreground` measured 1.36:1 in the dark theme and shipped an
 * unreadable "this form isn't published yet" banner. The same slip put white
 * text on a near-white fill in the light theme's `--destructive-soft`, at
 * 1.14:1, which nobody had reported at all.
 *
 * These are the pairings components are allowed to use. Adding a status colour
 * without its `-soft-foreground`, or drifting one of these lightnesses far
 * enough to break the pair, fails here instead of in front of someone.
 */

const CSS = readFileSync(path.resolve(import.meta.dirname, "../src/app/globals.css"), "utf8");

/** WCAG AA for body text. */
const AA = 4.5;

const STATUSES = ["primary", "destructive", "success", "warning", "info"] as const;

interface Oklch {
  l: number;
  c: number;
  h: number;
}

/**
 * The two theme blocks. `:root` holds light; the dark block overrides it, so a
 * token absent from dark legitimately inherits the light value.
 */
function themeBlocks(): { light: string; dark: string } {
  // The selector, not the first mention of the word: `@custom-variant dark
  // (&:is(.dark *))` sits at the top of the file and splitting on that left the
  // light block four lines long, so every token read as missing.
  const darkStart = CSS.search(/^\.dark\s*\{/m);
  expect(darkStart, "globals.css should contain a .dark { } block").toBeGreaterThan(-1);
  return { light: CSS.slice(0, darkStart), dark: CSS.slice(darkStart) };
}

function readToken(block: string, name: string): Oklch | null {
  const m = new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.-]+)\\)`).exec(block);
  if (!m) return null;
  return { l: Number(m[1]), c: Number(m[2]), h: Number(m[3]) };
}

/** oklch → relative luminance, via linear sRGB. */
function luminance({ l, c, h }: Oklch): number {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  const r = clamp(4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S);
  const g = clamp(-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S);
  const bl = clamp(-0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

function contrast(fg: Oklch, bg: Oklch): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("status token contrast", () => {
  const { light, dark } = themeBlocks();
  const themes = [
    { name: "light", block: light, fallback: light },
    // A dark override is optional; anything unset inherits the light value.
    { name: "dark", block: dark, fallback: light },
  ];

  for (const status of STATUSES) {
    for (const { name, block, fallback } of themes) {
      it(`${status}-soft is readable with ${status}-soft-foreground in ${name}`, () => {
        const bg = readToken(block, `${status}-soft`) ?? readToken(fallback, `${status}-soft`);
        const fg =
          readToken(block, `${status}-soft-foreground`) ??
          readToken(fallback, `${status}-soft-foreground`);
        expect(bg, `--${status}-soft must be defined`).not.toBeNull();
        expect(fg, `--${status}-soft-foreground must be defined`).not.toBeNull();
        expect(contrast(fg!, bg!)).toBeGreaterThanOrEqual(AA);
      });

      it(`${status} fill does not regress against ${status}-foreground in ${name}`, () => {
        const bg = readToken(block, status) ?? readToken(fallback, status);
        const fg = readToken(block, `${status}-foreground`) ?? readToken(fallback, `${status}-foreground`);
        expect(bg, `--${status} must be defined`).not.toBeNull();
        expect(fg, `--${status}-foreground must be defined`).not.toBeNull();
        /**
         * Large-text AA for the status fills.
         *
         * Apart from `primary` — asserted at full AA just below — none of these
         * pairs is actually rendered: the destructive badge and button write
         * `text-white` rather than `--destructive-foreground`, and the success
         * and info inks are used as type on the page background, not on their
         * own fill. So this is a floor on a contract nothing exercises yet,
         * which is worth keeping (the day someone builds a solid success chip,
         * it should not be unreadable) but is not worth failing the build over
         * at body-text strength.
         */
        expect(contrast(fg!, bg!)).toBeGreaterThanOrEqual(3);
      });
    }
  }

  /**
   * The one solid pair that is genuinely everywhere.
   *
   * `bg-primary text-primary-foreground` is the default badge and the default
   * button — small text, so body-strength AA is the real bar. It used to be
   * white on the chatform orange at 2.78:1, under even the 3:1 large-text
   * floor, and this test carried a 2.7 ratchet and a note deferring the fix as
   * a brand decision. That decision was taken: the light theme now writes the
   * same warm near-black on orange that the dark theme always did. The brand
   * colour itself is unchanged.
   */
  for (const [name, block] of Object.entries(themeBlocks())) {
    // `primary-hover` too: a button spends real time under the cursor, and a
    // hover state that drops below the bar is the same bug arriving half a
    // second later.
    for (const fill of ["primary", "primary-hover"] as const) {
      it(`${fill} clears body-text AA with primary-foreground in ${name}`, () => {
        const light = themeBlocks().light;
        const bg = readToken(block, fill) ?? readToken(light, fill);
        const fg = readToken(block, "primary-foreground") ?? readToken(light, "primary-foreground");
        expect(bg, `--${fill} must be defined`).not.toBeNull();
        expect(contrast(fg!, bg!)).toBeGreaterThanOrEqual(AA);
      });
    }
  }

  /**
   * The literal that bypasses the token.
   *
   * `text-white` on `bg-primary` is the 2.78:1 pair written by hand, which is
   * how it survived the token being fixed in two places already. It is always
   * wrong on the light theme's orange, so it is worth catching by shape rather
   * than by contrast maths.
   */
  it("no component writes literal white on the primary fill", () => {
    const src = path.resolve(import.meta.dirname, "../src");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(tsx?|css)$/.test(entry)) {
          for (const [i, line] of readFileSync(full, "utf8").split("\n").entries()) {
            if (line.includes("bg-primary") && /\btext-white\b/.test(line)) {
              offenders.push(`${path.relative(src, full)}:${i + 1}`);
            }
          }
        }
      }
    };
    walk(src);
    expect(offenders, "use text-primary-foreground, which is the readable ink").toEqual([]);
  });

  it("no component pairs a soft fill with the saturated fill's ink", () => {
    // The actual bug, caught at its source: `bg-[var(--x-soft)]` next to
    // `text-[var(--x-foreground)]` on one element.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(tsx?|css)$/.test(entry) && !entry.endsWith("globals.css")) {
          for (const line of readFileSync(full, "utf8").split("\n")) {
            for (const s of STATUSES) {
              if (line.includes(`bg-[var(--${s}-soft)]`) && line.includes(`text-[var(--${s}-foreground)]`)) {
                offenders.push(`${path.relative(process.cwd(), full)}: --${s}`);
              }
            }
          }
        }
      }
    };
    walk(path.resolve(import.meta.dirname, "../src"));
    expect(offenders).toEqual([]);
  });
});
