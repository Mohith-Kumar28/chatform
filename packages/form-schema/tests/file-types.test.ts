import { describe, expect, it } from "vitest";
import { ALLOWED_UPLOAD_MIME } from "@repo/guard/files";
import {
  ANY_FILE,
  UPLOAD_MIMES,
  acceptForKinds,
  acceptedKinds,
  acceptsMime,
  describeAccept,
  parseAcceptList,
  pickerAccept,
  uploadMimeOf,
} from "../src/file-types";

describe("file types", () => {
  it("offers only types the upload allowlist takes", () => {
    for (const m of UPLOAD_MIMES) expect(ALLOWED_UPLOAD_MIME.has(m), m).toBe(true);
  });

  it("matches wildcards: a PNG answers image/*", () => {
    expect(acceptsMime(["image/*", "application/pdf"], "image/png")).toBe(true);
    expect(acceptsMime(["image/*", "application/pdf"], "text/csv")).toBe(false);
    expect(acceptsMime([ANY_FILE], "video/quicktime")).toBe(true);
    expect(acceptsMime([ANY_FILE], "application/zip")).toBe(false);
  });

  it("names what a question takes in words, never a bare *", () => {
    expect(describeAccept(["image/*", "application/pdf"])).toBe("Images or PDF");
    expect(describeAccept(["image/png", "image/jpeg"])).toBe("PNG or JPG");
    expect(describeAccept([ANY_FILE])).toBe("Any file");
  });

  it("round-trips kinds, storing all of them as any file", () => {
    expect(acceptedKinds(acceptForKinds(["images", "pdf"])).map((k) => k.id)).toEqual(["images", "pdf"]);
    expect(acceptForKinds(["images", "pdf", "documents", "spreadsheets", "presentations", "audio", "video"])).toEqual([ANY_FILE]);
    expect(pickerAccept([ANY_FILE])).toBeUndefined();
  });

  it("reads a model's accept= in kinds, formats or MIME types", () => {
    expect(parseAcceptList("images|pdf")).toEqual(acceptForKinds(["images", "pdf"]));
    expect(parseAcceptList("png, .docx")).toEqual([
      "image/png",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]);
    expect(parseAcceptList("image/*|application/pdf")).toEqual(["image/*", "application/pdf"]);
    expect(parseAcceptList("any")).toEqual([ANY_FILE]);
    expect(parseAcceptList("nonsense")).toEqual([]);
  });

  it("names a file by its extension before the browser's guess", () => {
    expect(uploadMimeOf("scores.csv", "application/vnd.ms-excel")).toBe("text/csv");
    expect(uploadMimeOf("clip.MOV", "")).toBe("video/quicktime");
    expect(uploadMimeOf("blob", "image/png")).toBe("image/png");
  });
});
