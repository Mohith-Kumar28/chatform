import { describe, it, expect } from "vitest";
import { Block, coordsFromMapsUrl, displayAnswer, normalizeLocation, validateAnswer } from "../src/index";

/**
 * The current location an address card can also collect.
 *
 * Stored as a maps URL whether it came from the browser's coordinates or a
 * pasted link, so every export and webhook gets something clickable.
 */
const address = (extra: Record<string, unknown> = {}) =>
  Block.parse({ id: "blk_loc0001", ref: "q_addr", type: "address", title: "Where?", fields: ["city"], ...extra });

describe("address location", () => {
  it("is off by default, and an unknown value parses as off", () => {
    expect(address().type === "address" && address().location).toBe("off");
    const odd = address({ location: "sometimes" });
    expect(odd.type === "address" && odd.location).toBe("off");
  });

  it("ignores a location key on a block that doesn't ask", () => {
    const res = validateAnswer(address(), { city: "Pune", location: "12.9,77.5" });
    expect(res.ok).toBe(true);
    expect(res.value).toEqual({ city: "Pune" });
  });

  it("stores coordinates as a maps URL", () => {
    const res = validateAnswer(address({ location: "optional" }), { city: "Pune", location: "12.9716, 77.5946" });
    expect(res.ok).toBe(true);
    expect(res.value).toEqual({ city: "Pune", location: "https://www.google.com/maps?q=12.971600,77.594600" });
  });

  it("keeps a pasted maps link", () => {
    const res = validateAnswer(address({ location: "optional" }), { city: "Pune", location: "https://maps.app.goo.gl/abc123" });
    expect(res.ok).toBe(true);
    expect((res.value as Record<string, string>).location).toBe("https://maps.app.goo.gl/abc123");
  });

  it("refuses text that is neither, keeping the good lines", () => {
    const res = validateAnswer(address({ location: "optional" }), { city: "Pune", location: "near the big tree" });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("invalid_url");
    expect(res.field).toBe("location");
    expect(res.partial).toEqual({ city: "Pune" });
  });

  it("asks for it when required", () => {
    const res = validateAnswer(address({ location: "required" }), { city: "Pune" });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("incomplete");
    expect(res.hint).toContain("current location");
  });

  it("accepts a location alone on an optional card", () => {
    const res = validateAnswer(address({ location: "required" }), { location: "18.52,73.85" });
    expect(res.ok).toBe(true);
  });

  it("reads back with the lines first", () => {
    const block = address({ location: "optional" });
    expect(displayAnswer(block, { location: "https://www.google.com/maps?q=1.000000,2.000000", city: "Pune" })).toBe(
      "Pune, https://www.google.com/maps?q=1.000000,2.000000",
    );
  });

  it("round-trips coordinates through the URL", () => {
    const url = normalizeLocation("-33.8688,151.2093");
    expect(url && coordsFromMapsUrl(url)).toEqual({ lat: -33.8688, lng: 151.2093 });
    expect(normalizeLocation("95,10")).toBeNull();
    expect(normalizeLocation("javascript:alert(1)")).toBeNull();
  });
});
