import type { SessionEvent } from "../types/index.js";

/**
 * Reading a session's event stream.
 *
 * Server-sent events with durable replay: every event carries a sequence number,
 * so a dropped connection is recoverable by asking for everything after the last
 * one seen. That high-water mark is the whole trick — without it a reconnect
 * either loses events or replays them, and both look like bugs to a user.
 */

export interface StreamOptions {
  baseUrl?: string;
  apiKey?: string;
  respondentToken?: string;
  /** Resume from here. Defaults to the beginning. */
  since?: number;
  signal?: AbortSignal;
  fetch?: typeof globalThis.fetch;
  /** Reconnect attempts before giving up. Default 8. */
  maxAttempts?: number;
}

/** Parse one SSE frame. Ignores comments and keep-alives. */
export function parseFrame(raw: string): SessionEvent | null {
  let data = "";
  for (const line of raw.split("\n")) {
    if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return null;
  try {
    return JSON.parse(data) as SessionEvent;
  } catch {
    return null;
  }
}

/**
 * Every event, as it arrives, reconnecting through failures.
 *
 * An async iterator rather than callbacks because consuming a conversation is a
 * loop — `for await (const event of stream)` reads the way the thing behaves.
 */
export async function* streamSession(
  sessionId: string,
  options: StreamOptions = {},
): AsyncGenerator<SessionEvent> {
  const baseUrl = (options.baseUrl ?? "https://api.chatform.in").replace(/\/$/, "");
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const maxAttempts = options.maxAttempts ?? 8;

  // The high-water mark. Advanced only as events are yielded, so a mid-stream
  // failure resumes exactly where the consumer got to, not where the socket did.
  let lastSeq = options.since ?? 0;
  let attempt = 0;

  while (attempt <= maxAttempts) {
    const headers: Record<string, string> = { accept: "text/event-stream" };
    if (options.apiKey) headers["x-api-key"] = options.apiKey;
    if (options.respondentToken) headers["x-respondent-token"] = options.respondentToken;
    if (lastSeq > 0) headers["last-event-id"] = String(lastSeq);

    try {
      const res = await fetchImpl(`${baseUrl}/v1/sessions/${sessionId}/events`, {
        headers,
        signal: options.signal,
      });
      if (!res.ok || !res.body) throw new Error(`stream failed: ${res.status}`);

      attempt = 0; // a successful connection resets the backoff
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const event = parseFrame(frame);
          if (event && event.seq > lastSeq) {
            lastSeq = event.seq;
            yield event;
            if (event.type === "complete") return;
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
    } catch (err) {
      if (options.signal?.aborted) return;
      if (attempt >= maxAttempts) throw err;
    }

    attempt++;
    // Exponential, capped, jittered — a fleet reconnecting in lockstep after an
    // outage is its own outage.
    const wait = Math.min(2 ** attempt * 250, 10_000) + Math.random() * 300;
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}
