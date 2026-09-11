import { describe, it, expect } from "vitest";
import { embedFromUrl, interpolate, stripRichText, youtubeId, type Block } from "@repo/form-schema";
import { questionText } from "../src/lib/phrasing.js";
import { extractUrls, mediaUrls } from "../src/lib/research.js";

/**
 * The description dialect: Markdown, plus a link alone on a line as an embed and
 * `{{ref}}` as a recalled answer. See `packages/form-schema/src/rich-text.ts`.
 */
describe("rich description", () => {
  it("reads every YouTube shape people paste", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ?t=42",
      "https://youtube.com/shorts/dQw4w9WgXcQ",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    ]) {
      expect(youtubeId(url)).toBe("dQw4w9WgXcQ");
    }
    expect(youtubeId("https://www.youtube.com/@somechannel")).toBeNull();
    expect(youtubeId("https://notyoutube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });

  it("tells an embed from an ordinary link", () => {
    expect(embedFromUrl("https://cdn.example.com/a/b.PNG")?.kind).toBe("image");
    expect(embedFromUrl("https://cdn.example.com/clip.mp4")?.kind).toBe("video");
    // Uploaded assets have no extension; the fragment marks a clip.
    expect(embedFromUrl("https://api.chatform.in/p/assets/abc123#video")?.kind).toBe("video");
    expect(embedFromUrl("https://example.com/pricing")).toBeNull();
    // Mixed content would be blocked on the respondent's https page anyway.
    expect(embedFromUrl("http://example.com/a.png")).toBeNull();
  });

  it("recalls answers, and never leaks braces for an unknown ref", () => {
    const vars = new Map([["q_name", "Ada *Lovelace*"]]);
    expect(interpolate("Hi {{ q_name }}, {{q_missing}}!", vars)).toBe("Hi Ada *Lovelace*, !");
    // Spliced into Markdown, an answer cannot restyle — or link from — the text around it.
    expect(interpolate("Hi {{q_name}}", vars, { escapeMarkdown: true })).toBe("Hi Ada \\*Lovelace\\*");
  });

  it("strips to plain text for print and screen readers", () => {
    expect(
      stripRichText("**Read** the [brief](https://x.com)\nhttps://youtu.be/dQw4w9WgXcQ\nThanks {{q_name}}"),
    ).toBe("Read the brief\nThanks …");
  });
});

describe("questionText", () => {
  it("sends a question's title only — its description is drawn under it", () => {
    const block = { type: "short_text", ref: "q_team", title: "Team name?", description: "Watch https://youtu.be/dQw4w9WgXcQ" } as Block;
    expect(questionText(block)).toBe("Team name?");
  });

  it("keeps a statement's description in the message, with answers recalled", () => {
    const block = { type: "statement", ref: "s_hi", title: "Nice to meet you", description: "Thanks {{q_name}}!" } as Block;
    expect(questionText(block, new Map([["q_name", "Ada"]]))).toBe("Nice to meet you\n\nThanks Ada!");
  });
});

describe("AI builder links", () => {
  const prompt = "Hackathon signup — show https://youtu.be/dQw4w9WgXcQ on the welcome, our site is https://acme.dev";

  it("does not scrape a video as if it were the author's website", () => {
    expect(extractUrls(prompt)).toEqual(["https://acme.dev/"]);
  });

  it("hands the video to the generator to place", () => {
    expect(mediaUrls(prompt)).toEqual(["https://youtu.be/dQw4w9WgXcQ"]);
  });
});
