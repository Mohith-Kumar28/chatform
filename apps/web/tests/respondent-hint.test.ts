import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  asEmail,
  clearRespondentHint,
  loadRespondentHint,
  saveRespondentHint,
} from "@/components/chat/respondent-hint";

/**
 * The remembered respondent, asserted where it matters: what comes back out.
 *
 * This value decides whose name a form offers to sign in as, on a device that
 * may not belong to the person holding it. Everything below is a rule about
 * *not* showing a name — expired, malformed, written by something else — since
 * the failure that costs anything here is a card confidently greeting the
 * wrong person, not one that opens on a plain sign-in.
 */

const KEY = "chatform:respondent";
const DAY = 24 * 60 * 60 * 1000;

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    raw: map,
  };
}

let store: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  store = fakeStorage();
  vi.stubGlobal("localStorage", store);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("respondent hint", () => {
  it("round-trips a verified identity", () => {
    saveRespondentHint({
      provider: "google",
      label: "asha@example.com",
      name: "Asha Rao",
      pictureUrl: "https://lh3.googleusercontent.com/a/x",
    });

    expect(loadRespondentHint()).toMatchObject({
      provider: "google",
      label: "asha@example.com",
      name: "Asha Rao",
      pictureUrl: "https://lh3.googleusercontent.com/a/x",
    });
  });

  it("forgets a hint older than its window", () => {
    store.raw.set(
      KEY,
      JSON.stringify({ provider: "google", label: "asha@example.com", at: Date.now() - 31 * DAY }),
    );
    expect(loadRespondentHint()).toBeNull();

    store.raw.set(
      KEY,
      JSON.stringify({ provider: "google", label: "asha@example.com", at: Date.now() - 29 * DAY }),
    );
    expect(loadRespondentHint()?.label).toBe("asha@example.com");
  });

  it("refuses anything it did not write", () => {
    for (const junk of [
      "not json",
      JSON.stringify({ provider: "github", label: "asha@example.com", at: Date.now() }),
      JSON.stringify({ provider: "google", at: Date.now() }),
      JSON.stringify({ provider: "google", label: "asha@example.com" }),
    ]) {
      store.raw.set(KEY, junk);
      expect(loadRespondentHint()).toBeNull();
    }
  });

  // The server's fallback label for an identity with neither an email nor a
  // number. Remembering it would produce a card offering "Continue as
  // Verified", which greets nobody.
  it("does not remember the placeholder label", () => {
    saveRespondentHint({ provider: "google", label: "Verified", name: null, pictureUrl: null });
    expect(loadRespondentHint()).toBeNull();
  });

  it("clears on request", () => {
    saveRespondentHint({ provider: "phone", label: "+919876543210", name: null, pictureUrl: null });
    clearRespondentHint();
    expect(loadRespondentHint()).toBeNull();
  });

  it("survives storage it is not allowed to touch", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => saveRespondentHint({ provider: "google", label: "a@b.com", name: null, pictureUrl: null })).not.toThrow();
    expect(loadRespondentHint()).toBeNull();
    expect(() => clearRespondentHint()).not.toThrow();
  });

  // Google's `login_hint` wants an email address; a phone number in that field
  // is ignored at best.
  it("only offers an email as a login hint", () => {
    expect(asEmail("asha@example.com")).toBe("asha@example.com");
    expect(asEmail("+919876543210")).toBeUndefined();
    expect(asEmail("Asha Rao")).toBeUndefined();
  });
});
