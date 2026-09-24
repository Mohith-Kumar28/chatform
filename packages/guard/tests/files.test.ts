import { describe, it, expect } from "vitest";
import {
  ALLOWED_KNOWLEDGE_MIME,
  ALLOWED_UPLOAD_MIME,
  checkFileBytes,
  extensionOf,
  looksTextual,
  safeFilename,
  sniffMime,
} from "../src/files.js";

/**
 * Fixtures are byte arrays in the test file rather than files on disk: the
 * Workers pool the API tests run in has no filesystem, and a signature is a
 * handful of bytes anyway.
 */
const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new TextEncoder().encode(text);
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));

/**
 * A real 1x1 PNG, not a signature with padding after it: `file-type` v22
 * validates the IHDR chunk rather than trusting the first eight bytes, which
 * is the same reason we are using it instead of a hand-rolled magic table.
 */
const PNG = fromBase64(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
);
const GIF = fromBase64("R0lGODdhAQABAIAAAP///////ywAAAAAAQABAAACAkwBADs=");
const PDF = concat(ascii("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"), new Uint8Array(16));
const JPEG = fromBase64(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDIzNP/AABEIAAEAAQMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/aAAwDAQACEQMRAD8A/v4oooA//9k=",
);
const EXE = concat(ascii("MZ"), new Uint8Array(64));

describe("sniffMime", () => {
  it("names the format from its signature", async () => {
    expect(await sniffMime(PNG)).toBe("image/png");
    expect(await sniffMime(GIF)).toBe("image/gif");
    expect(await sniffMime(PDF)).toBe("application/pdf");
    expect(await sniffMime(JPEG)).toBe("image/jpeg");
  });

  it("returns null for text, which has no signature", async () => {
    expect(await sniffMime(ascii("name,email\nada,ada@example.com"))).toBe(null);
  });
});

describe("looksTextual", () => {
  it("accepts UTF-8 and refuses bytes with a NUL in them", () => {
    expect(looksTextual(ascii("plain text, héllo 🌍"))).toBe(true);
    expect(looksTextual(EXE)).toBe(false);
    expect(looksTextual(PNG)).toBe(false);
  });
});

describe("checkFileBytes", () => {
  const upload = (declared: string, content: Uint8Array) =>
    checkFileBytes({ declared, bytes: content, allowed: ALLOWED_UPLOAD_MIME });

  it("accepts a file whose bytes are what the client claimed", async () => {
    await expect(upload("image/png", PNG)).resolves.toEqual({
      ok: true,
      mime: "image/png",
      sniffed: "image/png",
    });
  });

  it("refuses an executable dressed as an image", async () => {
    const verdict = await upload("image/png", EXE);
    expect(verdict.ok).toBe(false);
    expect(verdict).toMatchObject({ reason: "mismatch" });
  });

  it("refuses an image dressed as text, which is how a sniffing browser gets tricked", async () => {
    const verdict = await upload("text/plain", PNG);
    expect(verdict).toMatchObject({ ok: false, reason: "mismatch", sniffed: "image/png" });
  });

  it("refuses a type that is not on the list at all, whatever the bytes say", async () => {
    const verdict = await upload("image/svg+xml", ascii("<svg onload=\"alert(1)\"/>"));
    expect(verdict).toMatchObject({ ok: false, reason: "not_allowed" });
  });

  it("accepts a textual type only when the bytes really are text", async () => {
    await expect(upload("text/csv", ascii("a,b\n1,2"))).resolves.toMatchObject({ ok: true, mime: "text/csv" });
    await expect(upload("text/plain", bytes(0x00, 0x01, 0x02, 0x03))).resolves.toMatchObject({
      ok: false,
      reason: "not_text",
    });
  });

  it("lets an SVG through as a knowledge source, where it is never served back", async () => {
    await expect(
      checkFileBytes({
        declared: "image/svg+xml",
        bytes: ascii('<svg xmlns="http://www.w3.org/2000/svg"><text>hi</text></svg>'),
        allowed: ALLOWED_KNOWLEDGE_MIME,
      }),
    ).resolves.toMatchObject({ ok: true, mime: "image/svg+xml" });
  });

  it("ignores charset parameters and case in the declared type", async () => {
    await expect(upload("IMAGE/PNG", PNG)).resolves.toMatchObject({ ok: true });
    await expect(upload("text/csv; charset=utf-8", ascii("a,b"))).resolves.toMatchObject({ ok: true });
  });
});

describe("safeFilename", () => {
  it("keeps a readable name and drops everything that is not one", () => {
    expect(safeFilename("Price list 2026.pdf")).toBe("Price_list_2026.pdf");
    expect(safeFilename("../../etc/passwd")).toBe("_.._etc_passwd");
    expect(safeFilename("report\u202E.pdf")).toBe("report.pdf");
    expect(safeFilename(".hidden")).toBe("hidden");
    expect(safeFilename("")).toBe("file");
    expect(safeFilename("x".repeat(500)).length).toBe(80);
  });
});

describe("extensionOf", () => {
  it("reads the extension, lower-cased", () => {
    expect(extensionOf("a.PDF")).toBe(".pdf");
    expect(extensionOf("archive.tar.gz")).toBe(".gz");
    expect(extensionOf("no-extension")).toBe("");
  });
});
