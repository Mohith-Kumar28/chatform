import { describe, it, expect } from "vitest";
import { qrMatrix, qrSvg } from "../src/lib/qr";
describe("qr", () => {
  it("builds a well-formed matrix", () => {
    const m = qrMatrix("http://localhost:3000/f/launch-survey-ec68e1");
    const size = m.length;
    expect((size - 17) % 4).toBe(0);
    const finder = (r: number, c: number) =>
      m[r]![c] && m[r + 6]![c] && m[r]![c + 6] && !m[r + 1]![c + 1] && m[r + 2]![c + 2];
    expect(finder(0, 0)).toBe(true);
    expect(finder(0, size - 7)).toBe(true);
    expect(finder(size - 7, 0)).toBe(true);
    expect(m[size - 8]![8]).toBe(true);
  });
  it("emits svg", () => {
    expect(qrSvg("hello")).toContain("<svg");
  });
});

import jsQR from "jsqr";

describe("qr decodes", () => {
  // The real test: does a scanner read back what we encoded? A structurally
  // valid matrix can still be undecodable.
  it.each([
    "http://localhost:3000/f/launch-survey-ec68e1",
    "https://chatform.dev/f/a-much-longer-slug-than-usual-for-testing-1234567890",
    "hi",
  ])("round-trips %s", (text) => {
    const m = qrMatrix(text);
    const size = m.length;
    const quiet = 4;
    // Scale up: a scanner cannot lock onto a small version rendered at one
    // pixel per module, which is a property of the test image, not the code.
    const scale = 3;
    const dim = (size + quiet * 2) * scale;
    const data = new Uint8ClampedArray(dim * dim * 4).fill(255);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!m[r]![c]) continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const i = (((r + quiet) * scale + dy) * dim + ((c + quiet) * scale + dx)) * 4;
            data[i] = 0;
            data[i + 1] = 0;
            data[i + 2] = 0;
          }
        }
      }
    }
    expect(jsQR(data, dim, dim)?.data).toBe(text);
  });
});
