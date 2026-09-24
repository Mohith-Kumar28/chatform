import { describe, it, expect, vi, afterEach } from "vitest";
import {
  GuardError,
  assertSafeUrl,
  classifyHost,
  guardedFetch,
  isBlockedHost,
  readCappedText,
  readTruncatedText,
  safeHref,
  safeMediaSrc,
  safeUrl,
  safeWebhookUrl,
} from "../src/url.js";

describe("classifyHost", () => {
  it("sees through every legal spelling of the same address", () => {
    // The whole reason this delegates to ipaddr.js: these are all 127.0.0.1.
    for (const spelling of ["127.0.0.1", "127.1", "2130706433", "0x7f.0.0.1", "0177.0.0.1"]) {
      expect(classifyHost(spelling), spelling).toBe("loopback");
    }
  });

  it("judges an IPv4-mapped IPv6 address as the IPv4 address it is", () => {
    expect(classifyHost("::ffff:169.254.169.254")).toBe("blocked");
    expect(classifyHost("::ffff:127.0.0.1")).toBe("loopback");
  });

  it("separates a name from an address", () => {
    expect(classifyHost("example.com")).toBe("name");
    expect(classifyHost("8.8.8.8")).toBe("public");
    expect(classifyHost("2606:4700::1111")).toBe("public");
  });

  it("fails closed on anything that is not plain global unicast", () => {
    for (const host of ["224.0.0.1", "240.0.0.1", "64:ff9b::7f00:1", "2001::1", "2002::1"]) {
      expect(classifyHost(host), host).toBe("blocked");
    }
  });
});

describe("isBlockedHost", () => {
  const blocked = [
    "localhost",
    "LOCALHOST",
    "api.localhost",
    "db.internal",
    "printer.local",
    "metadata.google.internal",
    "127.0.0.1",
    "127.1",
    "2130706433",
    "0x7f.0.0.1",
    "169.254.169.254",
    "10.0.0.5",
    "172.16.4.4",
    "192.168.1.1",
    "100.64.0.1",
    "0.0.0.0",
    "255.255.255.255",
    "::1",
    "[::1]",
    "fe80::1",
    "fd00::1",
    "::ffff:169.254.169.254",
    "64:ff9b::7f00:1",
    "printer.local.", // a trailing dot must not dodge the suffix checks
    "127.0.0.1.", // nor the address ones
  ];

  it.each(blocked)("blocks %s", (host) => {
    expect(isBlockedHost(host)).toBe(true);
  });

  it("allows an ordinary public host", () => {
    expect(isBlockedHost("example.com")).toBe(false);
    expect(isBlockedHost("hooks.slack.com")).toBe(false);
    expect(isBlockedHost("8.8.8.8")).toBe(false);
    expect(isBlockedHost("2606:4700::1111")).toBe(false);
  });
});

describe("safeUrl", () => {
  const schema = safeUrl();

  it("rejects the schemes that execute", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "blob:https://example.com/x",
    ]) {
      expect(schema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("rejects credentials in the URL", () => {
    expect(schema.safeParse("https://user:pw@example.com/x").success).toBe(false);
  });

  it("rejects hosts that are not public names", () => {
    expect(schema.safeParse("http://localhost:3000/x").success).toBe(false);
    expect(schema.safeParse("https://192.0.2.1/x").success).toBe(false);
    expect(schema.safeParse("https://[2001:db8::1]/x").success).toBe(false);
  });

  it("accepts the URLs a customer legitimately stores", () => {
    for (const good of [
      "https://example.com/checkout/workshop",
      "https://cal.com/example/demo",
      "http://example.com/plain-http-is-allowed-for-a-link",
      "https://hooks.example.com:8443/path?a=1#frag",
      "https://exämple.de/a",
      "https://xn--exmple-cua.de/",
      "https://a.b.c.d.example.co.uk/p",
    ]) {
      expect(schema.safeParse(good).success, good).toBe(true);
    }
  });
});

describe("safeWebhookUrl", () => {
  it("requires https outside development", () => {
    const schema = safeWebhookUrl();
    expect(schema.safeParse("https://hooks.example.com/x").success).toBe(true);
    expect(schema.safeParse("http://hooks.example.com/x").success).toBe(false);
    expect(schema.safeParse("http://localhost:8787/x").success).toBe(false);
  });

  it("allows http in development, but still never a private address", () => {
    const schema = safeWebhookUrl({ allowInsecure: true });
    expect(schema.safeParse("http://hooks.example.com/x").success).toBe(true);
    expect(schema.safeParse("http://169.254.169.254/latest/meta-data/").success).toBe(false);
    expect(schema.safeParse("http://10.0.0.1/x").success).toBe(false);
  });

  it("forgives loopback only when asked, and only loopback", () => {
    // `POST /api/webhooks` accepts http://localhost today; a developer testing
    // against their own machine is the reason, and it must stay possible.
    const dev = safeWebhookUrl({ allowInsecure: true, allowLoopback: true });
    expect(dev.safeParse("http://localhost:8787/hook").success).toBe(true);
    expect(dev.safeParse("http://127.0.0.1:8787/hook").success).toBe(true);
    expect(dev.safeParse("http://169.254.169.254/latest/").success).toBe(false);
    expect(dev.safeParse("http://10.0.0.1/x").success).toBe(false);
  });

  it("tolerates an underscore label, which a domain regex refuses", () => {
    expect(safeWebhookUrl().safeParse("https://my_hook.example.com/x").success).toBe(true);
    expect(safeUrl().safeParse("https://my_hook.example.com/x").success).toBe(false);
  });
});

describe("safeHref / safeMediaSrc", () => {
  it("passes a link through and refuses one that executes", () => {
    expect(safeHref("https://example.com")).toBe("https://example.com");
    expect(safeHref("mailto:a@b.com")).toBe("mailto:a@b.com");
    expect(safeHref("/relative/path")).toBe("/relative/path");
    expect(safeHref("#anchor")).toBe("#anchor");
    expect(safeHref("javascript:alert(1)")).toBe(null);
    expect(safeHref("  javascript:alert(1)")).toBe(null);
    expect(safeHref("data:text/html,x")).toBe(null);
    expect(safeHref(null)).toBe(null);
    expect(safeHref("")).toBe(null);
  });

  it("is stricter for media, where mailto and data have no business", () => {
    expect(safeMediaSrc("https://cdn.example.com/a.png")).toBe("https://cdn.example.com/a.png");
    expect(safeMediaSrc("/p/assets/abc")).toBe("/p/assets/abc");
    expect(safeMediaSrc("mailto:a@b.com")).toBe(null);
    expect(safeMediaSrc("data:image/svg+xml,<svg onload=alert(1)>")).toBe(null);
  });
});

describe("assertSafeUrl", () => {
  it("reports why it refused", () => {
    expect(() => assertSafeUrl("javascript:alert(1)")).toThrowError(
      expect.objectContaining({ code: "bad_scheme" }),
    );
    expect(() => assertSafeUrl("http://example.com/x")).toThrowError(
      expect.objectContaining({ code: "bad_scheme" }),
    );
    expect(() => assertSafeUrl("https://127.0.0.1/x")).toThrowError(
      expect.objectContaining({ code: "blocked_host" }),
    );
    expect(() => assertSafeUrl("not a url")).toThrowError(expect.objectContaining({ code: "bad_url" }));
    expect(assertSafeUrl("https://example.com/x").hostname).toBe("example.com");
  });
});

describe("guardedFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  const respond = (body: string, init: ResponseInit = {}) =>
    new Response(body, { headers: { "content-type": "text/html" }, ...init });

  it("fetches a public URL with redirects disabled", async () => {
    const fetchMock = vi.fn(async () => respond("<p>hi</p>"));
    vi.stubGlobal("fetch", fetchMock);

    const { response, url } = await guardedFetch("https://example.com/a");
    expect(await response.text()).toBe("<p>hi</p>");
    expect(url.href).toBe("https://example.com/a");
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ redirect: "manual" });
  });

  it("refuses a redirect that lands on the metadata address", async () => {
    // The attack this exists for: the URL a customer typed is fine, and the
    // server it points at answers with a Location nobody vetted.
    const fetchMock = vi.fn(async (target: URL) =>
      target.hostname === "example.com"
        ? new Response(null, { status: 302, headers: { location: "https://169.254.169.254/latest/" } })
        : respond("credentials"),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await expect(guardedFetch("https://example.com/r")).rejects.toThrowError(
      expect.objectContaining({ code: "blocked_host" }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a redirect that downgrades the scheme", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://example.org/x" } })),
    );
    await expect(guardedFetch("https://example.com/r")).rejects.toThrowError(
      expect.objectContaining({ code: "bad_scheme" }),
    );
  });

  it("follows a redirect to another public host, as a GET", async () => {
    const seen: string[] = [];
    const fetchMock = vi.fn(async (target: URL, init: RequestInit) => {
      seen.push(`${init.method} ${target.href}`);
      return target.hostname === "example.com"
        ? new Response(null, { status: 303, headers: { location: "https://elsewhere.example.org/final" } })
        : respond("done");
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const { response } = await guardedFetch("https://example.com/r", { init: { method: "POST", body: "x" } });
    expect(await response.text()).toBe("done");
    expect(seen).toEqual(["POST https://example.com/r", "GET https://elsewhere.example.org/final"]);
  });

  it("gives up rather than looping", async () => {
    let n = 0;
    const fetchMock = vi.fn(async () => {
      n += 1;
      return new Response(null, { status: 302, headers: { location: `https://example.com/${n}` } });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await expect(guardedFetch("https://example.com/0", { maxRedirects: 2 })).rejects.toThrowError(
      expect.objectContaining({ code: "too_many_redirects" }),
    );
  });

  it("enforces the content-type allowlist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond("MZ...", { headers: { "content-type": "application/octet-stream" } })),
    );
    await expect(guardedFetch("https://example.com/a", { contentTypes: /^text\// })).rejects.toThrowError(
      expect.objectContaining({ code: "bad_content_type" }),
    );
  });

  it("never reaches the network for a blocked target", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(guardedFetch("http://169.254.169.254/", { allowInsecure: true })).rejects.toBeInstanceOf(
      GuardError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("readCappedText", () => {
  it("stops at the ceiling instead of allocating whatever arrives", async () => {
    const big = new Response("x".repeat(5000));
    await expect(readCappedText(big, 1000)).rejects.toThrowError(
      expect.objectContaining({ code: "too_large" }),
    );
  });

  it("reads a small body whole", async () => {
    expect(await readCappedText(new Response("hello"), 1000)).toBe("hello");
  });
});

describe("readTruncatedText", () => {
  it("keeps what arrived instead of refusing — a long page is not an attack", async () => {
    // Chunked, because the ceiling is checked between chunks: a body that
    // arrives as one piece is kept whole, and that is the intended semantic.
    const chunked = new Response(
      new ReadableStream({
        start(controller) {
          const chunk = new TextEncoder().encode("x".repeat(500));
          for (let i = 0; i < 20; i += 1) controller.enqueue(chunk);
          controller.close();
        },
      }),
    );
    const text = await readTruncatedText(chunked, 1000);
    expect(text.length).toBeGreaterThan(0);
    expect(text.length).toBeLessThan(10_000);
  });

  it("does not split a multi-byte character across the cut", async () => {
    const body = "é".repeat(2000);
    const text = await readTruncatedText(new Response(body), 100);
    expect(text).not.toContain("\ufffd");
  });
});
