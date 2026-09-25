/**
 * A picture of what the person is looking at, taken when they open the panel.
 *
 * `modern-screenshot` rather than html2canvas: it hands the page to the browser
 * to draw through an SVG foreignObject, so it renders what the browser renders,
 * `oklch()` colours and React Flow's transformed SVG included, which html2canvas
 * re-implements and gets wrong. Loaded on demand, so the dashboard does not pay
 * for it until somebody reports something.
 *
 * Only the visible viewport, not the whole scrolled page: the report is about
 * what was on screen. The launcher and the panel mark themselves
 * `data-feedback-ignore` and are left out.
 */

/** Wide enough to read a table, small enough to stay a few hundred KB. */
const MAX_WIDTH = 1600;

export async function captureScreen(): Promise<File | null> {
  try {
    const { domToBlob } = await import("modern-screenshot");
    const width = window.innerWidth;
    const height = window.innerHeight;
    const blob = await domToBlob(document.body, {
      width,
      height,
      scale: Math.min(1, MAX_WIDTH / width) * Math.min(window.devicePixelRatio || 1, 2),
      type: "image/webp",
      quality: 0.85,
      backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
      // Shift the copy so the part scrolled into view is what lands in frame.
      style: { transform: `translate(${-window.scrollX}px, ${-window.scrollY}px)` },
      filter: (node) => !(node instanceof HTMLElement && node.dataset.feedbackIgnore !== undefined),
      timeout: 4000,
    });
    if (!blob || blob.size === 0) return null;
    // Safari cannot encode WebP and quietly returns PNG; name the file for what it is.
    const type = blob.type || "image/png";
    const ext = type === "image/webp" ? "webp" : type === "image/jpeg" ? "jpg" : "png";
    return new File([blob], `screenshot.${ext}`, { type });
  } catch (err) {
    // A page the renderer cannot draw costs the screenshot, never the report.
    console.warn("feedback_screenshot_failed", err);
    return null;
  }
}
