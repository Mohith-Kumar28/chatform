/**
 * Where a respondent's place in a form is remembered, by key.
 *
 * `use-chat` owns reading and writing these. They live in a module of their own
 * so the one other page that needs to find a conversation — the gateway return
 * page, which a checkout sends the respondent back to — reads the same keys
 * without importing the whole chat hook, and so the two cannot drift onto
 * different spellings of them.
 *
 * Scoped per form, so two forms on one device do not collide.
 */
export const storageKey = (slug: string) => `chatform:session:${slug}`;
/** Kept after completion so a return visit knows it has already been filled. */
export const submittedKey = (slug: string) => `chatform:submitted:${slug}`;

/**
 * How the form page was opened, for the length of this tab.
 *
 * A gateway can take the whole window over on its way to a bank or a UPI app — in an embed that
 * window is the iframe — and `/pay/return` then sends the respondent back to `/f/<slug>`. Rebuilt
 * from the slug alone that address has lost `embed=1` and `parentOrigin`, so the form came back
 * inside somebody's panel wearing standalone page chrome, with no `EmbedBridge` and therefore no
 * `answer` or `complete` message for the host page.
 *
 * `sessionStorage`, because a redirect keeps the same tab (and, inside an embed, the same
 * storage partition), and because per-tab is exactly the scope of "the URL this form was opened
 * at".
 */
export const embedQueryKey = (slug: string) => `chatform:embed-query:${slug}`;

/** Keep the embed parameters of the address this form is being shown at, if it has any. */
export function rememberEmbedQuery(slug: string, search: string): void {
  try {
    const from = new URLSearchParams(search);
    const keep = new URLSearchParams();
    if (from.get("embed") === "1") keep.set("embed", "1");
    const parent = from.get("parentOrigin");
    if (parent) keep.set("parentOrigin", parent);
    const value = keep.toString();
    // Only ever written for a framed form, and never cleared by a standalone
    // visit: the two are different tabs.
    if (value) sessionStorage.setItem(embedQueryKey(slug), value);
  } catch {
    // Blocked or partitioned storage. The form comes back standalone, which is
    // the behaviour this replaces rather than a regression.
  }
}

/** `"embed=1&parentOrigin=…"`, or an empty string. */
export function storedEmbedQuery(slug: string): string {
  try {
    return sessionStorage.getItem(embedQueryKey(slug)) ?? "";
  } catch {
    return "";
  }
}

/**
 * The conversation this browser holds for a form, live or just finished.
 *
 * Finished counts because a payment can be the last question: by the time the
 * return page runs, the webhook may already have settled it and completed the
 * response, which moves the session from one key to the other.
 */
export function findStoredSession(slug: string): { sessionId: string; token: string } | null {
  for (const key of [storageKey(slug), submittedKey(slug)]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { sessionId?: string; token?: string };
      if (parsed.sessionId && parsed.token) return { sessionId: parsed.sessionId, token: parsed.token };
    } catch {
      // Private mode, blocked or partitioned storage, a corrupt value. Not
      // finding the session is an outcome the caller already handles.
    }
  }
  return null;
}
