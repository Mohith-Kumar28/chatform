import qrcode from "qrcode-generator";

/**
 * QR generation, locally.
 *
 * The Share tab used to fetch its QR from api.qrserver.com — a third-party
 * request carrying every form's URL, returning an unthemed PNG we could not
 * style or offer as a vector download.
 *
 * This is generated in-process instead. A hand-rolled encoder was tried first
 * and produced structurally valid but undecodable matrices (see
 * tests/qr.test.ts, which round-trips through a real scanner); the spec's mask
 * and alignment rules are not worth owning for one screen.
 */

/** QR matrix as booleans (true = dark). Error-correction level M. */
export function qrMatrix(text: string): boolean[][] {
  // typeNumber 0 = pick the smallest version that fits.
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => qr.isDark(r, c)),
  );
}

/** Standalone SVG string with a 4-module quiet zone, safe as a data: URI. */
export function qrSvg(text: string, moduleSize = 4): string {
  const matrix = qrMatrix(text);
  const quiet = 4;
  const dim = (matrix.length + quiet * 2) * moduleSize;

  let path = "";
  matrix.forEach((row, r) => {
    row.forEach((dark, c) => {
      if (!dark) return;
      const x = (c + quiet) * moduleSize;
      const y = (r + quiet) * moduleSize;
      path += `M${x} ${y}h${moduleSize}v${moduleSize}h-${moduleSize}z`;
    });
  });

  // White ground is deliberate: scanners need the contrast, and the code must
  // stay readable when a page renders it on a dark background.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges"><rect width="${dim}" height="${dim}" fill="#ffffff"/><path d="${path}" fill="#000000"/></svg>`;
}
