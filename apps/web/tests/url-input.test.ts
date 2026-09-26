import { describe, expect, it } from "vitest";
import { splitUrl } from "@/components/chat/composers/url";

describe("splitUrl", () => {
  it("lifts a pasted scheme out of the box", () => {
    expect(splitUrl("http://acme.com/a")).toEqual({ scheme: "http", rest: "acme.com/a" });
    expect(splitUrl("HTTPS://acme.com")).toEqual({ scheme: "https", rest: "acme.com" });
  });

  it("leaves a bare domain alone", () => {
    expect(splitUrl("acme.com")).toEqual({ scheme: null, rest: "acme.com" });
  });

  it("takes the last scheme when a paste lands on a typed one", () => {
    expect(splitUrl("https://http://acme.com")).toEqual({ scheme: "http", rest: "acme.com" });
  });

  it("swallows a scheme typed a key at a time", () => {
    expect(splitUrl("http:")).toEqual({ scheme: "http", rest: "" });
    expect(splitUrl("//")).toEqual({ scheme: null, rest: "" });
  });
});
