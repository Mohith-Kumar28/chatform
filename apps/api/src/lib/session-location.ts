/**
 * Where a session object is created: beside D1, which lives in APAC (SIN).
 *
 * A Durable Object is born near whoever first calls it, and it then does its
 * own D1 reads and writes for the life of the conversation. Left to chance it
 * was born near the respondent's colo (India is often routed to Marseille),
 * and opening a session spent over a second on round trips from there. The
 * hint only applies at creation; an existing object stays where it is.
 */
export const SESSION_LOCATION: DurableObjectNamespaceGetDurableObjectOptions = { locationHint: "apac" };

const OBJECT_ID_SESSION = /^chs_([0-9a-f]{64})$/;

/**
 * A new session's id, which is also the address of its object.
 *
 * Sessions used to be found by name (`idFromName(sessionId)`). The first call
 * to an object that is only a name makes Cloudflare check the whole world for
 * an existing object of that name, and measured from this worker that check
 * was about 450ms of every session open, in front of every respondent. An id
 * the platform mints itself is known to be new and skips it. So the session id
 * carries that id, and `sessionObjectId` reads it back out.
 */
export function mintSessionId(ns: DurableObjectNamespace): string {
  return `chs_${ns.newUniqueId().toString()}`;
}

/** The object behind a session id: by its own id when it carries one, by name for every older session. */
export function sessionObjectId(ns: DurableObjectNamespace, sessionId: string): DurableObjectId {
  const hex = OBJECT_ID_SESSION.exec(sessionId)?.[1];
  if (hex) {
    try {
      return ns.idFromString(hex);
    } catch {
      // Sixty-four hex characters that are not an id of this namespace: nobody's session.
    }
  }
  return ns.idFromName(sessionId);
}

/** Whether a session id a browser handed back is one `mintSessionId` could have made. */
export function isReservableSessionId(ns: DurableObjectNamespace, sessionId: string): boolean {
  const hex = OBJECT_ID_SESSION.exec(sessionId)?.[1];
  if (!hex) return false;
  try {
    ns.idFromString(hex);
    return true;
  } catch {
    return false;
  }
}
