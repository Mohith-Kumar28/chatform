import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadScript, resetLoadedScripts, type ScriptHost } from "../src/lib/payments/load-script";

/**
 * Checkout SDKs are fetched on the tap, once.
 *
 * A second copy of a gateway's script registers a second set of listeners and
 * opens a second modal, so a retry must reuse the first load. But a load that
 * failed (a blocker, a dropped connection) must not be remembered, or "Try
 * again" could never succeed.
 */

interface FakeScript {
  src: string;
  async: boolean;
  onload: (() => void) | null;
  onerror: (() => void) | null;
}

function fakeHost() {
  const scripts: FakeScript[] = [];
  const host = {
    createElement: vi.fn(() => {
      const el: FakeScript = { src: "", async: false, onload: null, onerror: null };
      scripts.push(el);
      return el as unknown as HTMLScriptElement;
    }),
    head: { appendChild: vi.fn() },
  } satisfies ScriptHost;
  return { host, scripts };
}

beforeEach(() => resetLoadedScripts());
afterEach(() => vi.useRealTimers());

describe("loadScript", () => {
  it("adds one script per URL, however many times it is asked", async () => {
    const { host, scripts } = fakeHost();
    const first = loadScript("https://sdk.example/a.js", { host });
    const second = loadScript("https://sdk.example/a.js", { host });

    expect(second).toBe(first);
    expect(host.createElement).toHaveBeenCalledTimes(1);
    expect(host.head.appendChild).toHaveBeenCalledTimes(1);
    expect(scripts[0]!.src).toBe("https://sdk.example/a.js");
    expect(scripts[0]!.async).toBe(true);

    scripts[0]!.onload!();
    await expect(first).resolves.toBeUndefined();
    // Still memoised once loaded.
    expect(loadScript("https://sdk.example/a.js", { host })).toBe(first);
    expect(host.createElement).toHaveBeenCalledTimes(1);
  });

  it("loads different URLs separately", () => {
    const { host } = fakeHost();
    const a = loadScript("https://sdk.example/a.js", { host });
    const b = loadScript("https://sdk.example/b.js", { host });
    expect(a).not.toBe(b);
    expect(host.createElement).toHaveBeenCalledTimes(2);
  });

  it("forgets a failed load, so trying again fetches it again", async () => {
    const { host, scripts } = fakeHost();
    const first = loadScript("https://sdk.example/a.js", { host });
    scripts[0]!.onerror!();
    await expect(first).rejects.toThrow("script_failed");

    const second = loadScript("https://sdk.example/a.js", { host });
    expect(second).not.toBe(first);
    expect(host.createElement).toHaveBeenCalledTimes(2);
    scripts[1]!.onload!();
    await expect(second).resolves.toBeUndefined();
  });

  it("gives up on a script that never answers, and forgets it", async () => {
    vi.useFakeTimers();
    const { host } = fakeHost();
    const first = loadScript("https://sdk.example/a.js", { host, timeoutMs: 1000 });
    const settled = expect(first).rejects.toThrow("script_timeout");
    vi.advanceTimersByTime(1001);
    await settled;

    expect(loadScript("https://sdk.example/a.js", { host })).not.toBe(first);
  });

  it("waits on the tag still in the page after a timeout, rather than adding a second copy", async () => {
    vi.useFakeTimers();
    const { host, scripts } = fakeHost();
    const first = loadScript("https://sdk.example/a.js", { host, timeoutMs: 1000 });
    const gaveUp = expect(first).rejects.toThrow("script_timeout");
    vi.advanceTimersByTime(1001);
    await gaveUp;

    // Try again while the slow tag is still on its way.
    const retry = loadScript("https://sdk.example/a.js", { host, timeoutMs: 1000 });
    expect(host.createElement).toHaveBeenCalledTimes(1);
    scripts[0]!.onload!();
    await expect(retry).resolves.toBeUndefined();
    expect(host.head.appendChild).toHaveBeenCalledTimes(1);
  });

  it("counts a tag that arrives after everyone gave up as loaded", async () => {
    vi.useFakeTimers();
    const { host, scripts } = fakeHost();
    const first = loadScript("https://sdk.example/a.js", { host, timeoutMs: 1000 });
    const gaveUp = expect(first).rejects.toThrow("script_timeout");
    vi.advanceTimersByTime(1001);
    await gaveUp;

    scripts[0]!.onload!();
    await expect(loadScript("https://sdk.example/a.js", { host })).resolves.toBeUndefined();
    expect(host.createElement).toHaveBeenCalledTimes(1);
  });

  it("refuses where there is no document", async () => {
    await expect(loadScript("https://sdk.example/a.js")).rejects.toThrow("script_unavailable");
  });
});
