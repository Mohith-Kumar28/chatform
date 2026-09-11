/**
 * Bakes the landing page's share card into `public/og.jpg`.
 *
 * The home card has nothing dynamic on it, and as an `opengraph-image.tsx`
 * route it was still served through the worker: 1.4–2.4s per fetch against
 * 0.2–0.4s for a file in `public/`. A crawler that times out on the image
 * unfurls the link with no picture, so the one card people actually share is
 * now a static file.
 *
 * The drawing still lives in `renderShareCard()` — rerun this after changing
 * it, or the hero's words:
 *
 *   pnpm --filter @repo/web og:image
 *
 * JPEG rather than PNG because the dot grid over the gradient defeats PNG's
 * compression (335KB), and WhatsApp drops preview images much past 300KB.
 * The re-encode uses macOS `sips`, so this runs on a Mac.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderShareCard } from "../src/components/brand/share-card";

const out = join(dirname(fileURLToPath(import.meta.url)), "../public/og.jpg");
const scratch = mkdtempSync(join(tmpdir(), "og-image-"));
const png = join(scratch, "og.png");

try {
  writeFileSync(png, Buffer.from(await renderShareCard().arrayBuffer()));
  execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "90", png, "--out", out], {
    stdio: "ignore",
  });
  console.log(`wrote ${out} (${Math.round(statSync(out).size / 1024)}KB)`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
