"use client";

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { BlockType, FormDoc } from "@repo/form-schema";
import { blockMeta } from "@/components/builder/block-library";
import { FlowDrawing, layoutFlow } from "@/components/templates/template-flow";

/**
 * The flow diagram, as a stack of page-sized pictures.
 *
 * Drawn by the same `FlowDrawing` the template gallery uses, which is laid out
 * by the same `deriveGraph` the builder canvas uses, so the boxes, wires and
 * route colours on paper are the ones on screen. The dotted ground is the
 * canvas's own: an 18px grid of 1px dots.
 *
 * The canvas is exactly a whole number of pages tall and is cut into slices at
 * the page boundaries, so a node that straddles a cut is split across two pages
 * with no gap, header or footer between the halves. It reads as one sheet that
 * was guillotined, which is the point: a margin there would look like the end
 * of a branch.
 */

/** A4 portrait, height over width. */
export const PAGE_ASPECT = 841.89 / 595.28;

/** Narrow flows still get a page-wide canvas, so a node stays node-sized. */
const MIN_WIDTH = 760;
const SIDE = 48;
/** Room for the "Flow diagram" heading drawn onto the canvas itself. */
const HEAD = 132;
/** Room for the sign-off at the foot of the last slice. */
const FOOT = 110;
/** Pixels per CSS pixel. 2.5 keeps 10px node labels sharp when zoomed. */
const SCALE = 2.5;

export const CANVAS_BG = "#fbfaf5";
const DOT = "#c9c4bb";
/** The builder canvas's dot grid: `<Background gap={18} size={1} />`. */
const GRID = 18;
const DOT_RADIUS = 0.9;

export interface FlowSnapshot {
  /** One PNG data URL per page, top to bottom. */
  pages: string[];
}

/** An icon's SVG children, so the PDF can draw it as vectors. */
export type IconShape = { tag: string; attrs: Record<string, string> };

/**
 * Mounts a throwaway drawing off-screen, photographs it a page at a time and
 * unmounts it. Also reads back the SVG of each question type's icon while the
 * tree is up, since lucide keeps its paths inside the component.
 */
export async function snapshotFlow(
  doc: FormDoc,
  { title, footer }: { title: string; footer: string },
): Promise<FlowSnapshot & { icons: Map<BlockType, IconShape[]> }> {
  const { placed, wires, width, height } = layoutFlow(doc);
  const canvasWidth = Math.max(MIN_WIDTH, Math.ceil(width + SIDE * 2));
  const pageHeight = canvasWidth * PAGE_ASPECT;
  const pageCount = Math.max(1, Math.ceil((HEAD + height + FOOT) / pageHeight));
  const canvasHeight = pageCount * pageHeight;
  const types = [...new Set(doc.blocks.map((b) => b.type))];

  const host = document.createElement("div");
  // Off-screen, not hidden: a hidden element has nothing to photograph.
  host.style.cssText = "position:fixed;left:-100000px;top:0;pointer-events:none;";
  host.setAttribute("aria-hidden", "true");
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    let sheet: HTMLDivElement | null = null;
    let iconStrip: HTMLDivElement | null = null;
    flushSync(() => {
      root.render(
        <>
          <div
            ref={(el) => {
              sheet = el;
            }}
            className="text-foreground relative font-sans"
            style={{
              ...lightTheme(),
              colorScheme: "light",
              width: canvasWidth,
              height: canvasHeight,
            }}
          >
            <div className="absolute" style={{ left: SIDE, top: 44, right: SIDE }}>
              <div className="flex items-center gap-2">
                <LogoMark size={18} />
                <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] whitespace-nowrap uppercase">
                  Flow diagram
                </span>
              </div>
              <p className="font-display mt-2 truncate text-[26px] leading-tight font-semibold">{title}</p>
            </div>

            <div className="absolute" style={{ left: (canvasWidth - width) / 2, top: HEAD, width, height }}>
              <FlowDrawing placed={placed} wires={wires} width={width} height={height} />
            </div>

            <div className="absolute inset-x-0 flex justify-center" style={{ bottom: 40 }}>
              <div className="bg-card border-border flex items-center gap-2 rounded-full border px-4 py-2 text-xs shadow-xs">
                <LogoMark size={14} />
                <span className="font-medium">{footer}</span>
              </div>
            </div>
          </div>
          <div
            ref={(el) => {
              iconStrip = el;
            }}
          >
            {types.map((type) => {
              const Icon = blockMeta(type).icon;
              return (
                <span key={type} data-type={type}>
                  <Icon />
                </span>
              );
            })}
          </div>
        </>,
      );
    });

    // The app's fonts are already loaded; wait for any the drawing just asked for.
    await document.fonts.ready;
    // A timer, not a frame: a tab switched away from mid-export gets no frames at all.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const icons = readIcons(iconStrip!);
    const { domToCanvas } = await import("modern-screenshot");
    const pages: string[] = [];
    for (let i = 0; i < pageCount; i++) {
      const drawing = await domToCanvas(sheet!, {
        width: canvasWidth,
        height: pageHeight,
        scale: SCALE,
        // The same sheet each time, shifted up a page: consecutive slices meet exactly.
        style: { transform: `translateY(${-i * pageHeight}px)` },
        timeout: 8000,
      });
      pages.push(onDots(drawing, i * pageHeight).toDataURL("image/png"));
    }
    return { pages, icons };
  } finally {
    root.unmount();
    host.remove();
  }
}

/**
 * The canvas ground, painted under one slice.
 *
 * Painted here rather than as a CSS background on the sheet, because Chrome
 * stops drawing a repeating gradient partway down a sheet several pages tall
 * inside the screenshot's SVG, and every page after the first came out bare.
 * The grid is anchored to the sheet, not the slice, so it runs on unbroken
 * across a page cut.
 */
function onDots(drawing: HTMLCanvasElement, sheetTop: number): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = drawing.width;
  out.height = drawing.height;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = CANVAS_BG;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.fillStyle = DOT;
  // Dots sit at 9, 27, 45… down the sheet; find the first one inside this slice.
  const first = (((GRID / 2 - sheetTop) % GRID) + GRID) % GRID;
  for (let y = first; y * SCALE < out.height; y += GRID) {
    for (let x = GRID / 2; x * SCALE < out.width; x += GRID) {
      ctx.beginPath();
      ctx.arc(x * SCALE, y * SCALE, DOT_RADIUS * SCALE, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.drawImage(drawing, 0, 0);
  return out;
}

function readIcons(strip: HTMLElement): Map<BlockType, IconShape[]> {
  const icons = new Map<BlockType, IconShape[]>();
  for (const span of strip.querySelectorAll<HTMLElement>("[data-type]")) {
    const svg = span.querySelector("svg");
    if (!svg) continue;
    icons.set(
      span.dataset.type as BlockType,
      [...svg.children].map((child) => ({
        tag: child.tagName.toLowerCase(),
        attrs: Object.fromEntries([...child.attributes].map((a) => [a.name, a.value])),
      })),
    );
  }
  return icons;
}

/**
 * The light theme's variables, pinned on the sheet.
 *
 * Paper is light whatever the app is wearing. The variables live on `:root`,
 * and `.dark` overrides them on that same element, so there is no class to
 * put on a child that restores them. Reading the `:root` declarations back out
 * of the stylesheets and setting them inline does: a child's own custom
 * property beats the one it would inherit.
 */
function lightTheme(): Record<string, string> {
  if (!document.documentElement.classList.contains("dark")) return {};
  const vars: Record<string, string> = {};
  const visit = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        if (!/(^|,)\s*:root\b/.test(rule.selectorText)) continue;
        for (const name of rule.style) {
          if (name.startsWith("--")) vars[name] = rule.style.getPropertyValue(name);
        }
      } else if (rule instanceof CSSLayerBlockRule || rule instanceof CSSSupportsRule) {
        // Tailwind puts its theme in a layer. Media queries are skipped on
        // purpose: that is where a dark preference would live.
        visit(rule.cssRules);
      }
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      visit(sheet.cssRules);
    } catch {
      // Cross-origin stylesheets cannot be read, and hold none of ours.
    }
  }
  return vars;
}

/** The ChatForm mark: two speech plates, orange and violet. */
function LogoMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <path d="M19.7 25 L18.8 25 L10.4 28.1 L11.6 25 L11 25 A6 6 0 0 1 5 19 L5 13 A6 6 0 0 1 11 7 L11.3 7 Z" fill="#FD6F29" />
      <path d="M12.3 7 L13.2 7 L21.6 3.9 L20.4 7 L21 7 A6 6 0 0 1 27 13 L27 19 A6 6 0 0 1 21 25 L20.7 25 Z" fill="#9769DC" />
    </svg>
  );
}
