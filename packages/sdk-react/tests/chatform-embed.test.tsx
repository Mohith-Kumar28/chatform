import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatformEmbed } from "../src/chatform-embed";

/**
 * The embed rendered to markup, which is where its security properties live.
 *
 * Rendered on the server rather than in jsdom on purpose: the attributes below
 * are the whole point of the component, and none of them needs a DOM to assert.
 * The effect that listens for `postMessage` is tested by reading its origin
 * check, not by simulating one.
 */

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("ChatformEmbed", () => {
  it("points at the form's public page on the configured origin", () => {
    const out = html(<ChatformEmbed slug="client-intake" />);
    expect(out).toContain("https://chatform.in/f/client-intake");
  });

  it("honours a custom origin, so a self-hosted deployment is reachable", () => {
    const out = html(<ChatformEmbed slug="s" origin="https://forms.example.com" />);
    expect(out).toContain("https://forms.example.com/f/s");
    expect(out).not.toContain("chatform.in");
  });

  /**
   * Without this the frame sends the embedding page's full URL to the form,
   * which on a customer's admin page is a path with ids in it.
   */
  it("sends an origin as the referrer, never a full URL", () => {
    expect(html(<ChatformEmbed slug="s" />)).toContain("strict-origin-when-cross-origin");
  });

  /**
   * Not sandboxed, and that is the decision rather than an omission: the
   * source records that a sandbox was driven against a real embed and left off
   * because the file uploader and the Google sign-in popup could not be
   * exercised through it. If a `sandbox` attribute appears here, that decision
   * was revisited and this test should be the place it is written down.
   */
  it("is not sandboxed, deliberately", () => {
    expect(html(<ChatformEmbed slug="s" />)).not.toContain("sandbox=");
  });

  it("passes hidden fields through the URL rather than the page", () => {
    const out = html(<ChatformEmbed slug="s" hidden={{ plan: "pro" }} />);
    expect(out).toContain("plan=pro");
  });
});
