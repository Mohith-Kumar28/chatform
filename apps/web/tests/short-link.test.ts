import { describe, it, expect } from "vitest";
import { linkDestination } from "../edge/short-link";

const at = (search = "") => new URL(`https://chatform.in/r/abc2345${search}`);

describe("a campaign's short link", () => {
  it("sends the visitor to the stored page with its tags", () => {
    expect(linkDestination("/pricing?utm_source=x&utm_campaign=launch&utm_id=cl_1", at())).toBe(
      "https://chatform.in/pricing?utm_source=x&utm_campaign=launch&utm_id=cl_1",
    );
  });

  it("carries what the click itself brought, without overriding the link's tags", () => {
    const to = new URL(linkDestination("/?utm_source=google&utm_id=cl_1", at("?gclid=abc&utm_source=spoofed")));
    expect(to.searchParams.get("gclid")).toBe("abc");
    expect(to.searchParams.getAll("utm_source")).toEqual(["google"]);
  });

  it("goes home for a code that leads nowhere", () => {
    expect(linkDestination(null, at())).toBe("https://chatform.in/");
    expect(linkDestination("", at("?ref=friend"))).toBe("https://chatform.in/?ref=friend");
  });

  it("never leaves the site, whatever was stored", () => {
    for (const target of ["https://evil.test/", "//evil.test/", "/\\evil.test", "javascript:alert(1)", "evil.test"]) {
      expect(new URL(linkDestination(target, at())).origin, target).toBe("https://chatform.in");
    }
  });
});
