import { describe, it, expect } from "vitest";
import { errorFromResponse } from "../src/internal/errors";

describe("errorFromResponse", () => {
  it("leaves retryAfter unset when the header is missing, so retries back off", async () => {
    // Number(null) is 0: reading a missing header as zero made every 5xx retry
    // fire immediately instead of falling back to exponential backoff.
    const err = await errorFromResponse(new Response("{}", { status: 503 }));
    expect(err.retryAfter).toBeUndefined();
  });

  it("reads retryAfter from the header when one is sent", async () => {
    const err = await errorFromResponse(new Response("{}", { status: 429, headers: { "retry-after": "7" } }));
    expect(err.retryAfter).toBe(7);
  });
});
