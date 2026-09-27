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
