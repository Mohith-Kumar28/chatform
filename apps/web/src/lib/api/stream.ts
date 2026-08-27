import { API_ORIGIN, throwApiError } from "./mutator";

/**
 * Server-sent events over `fetch`, for the routes that narrate their work.
 *
 * Not `EventSource`, for two reasons: it cannot POST — and the AI generator's
 * input is a 2,000-character prompt, not a query string — and it cannot see a
 * failure body, so a plan denial would arrive as an opaque connection error
 * instead of the paywall the rest of the app shows. Reading the body by hand
 * costs a parser and buys both.
 *
 * The trade is that reconnection is not free the way `EventSource` gives it.
 * That is the right trade here: these streams narrate one action the author is
 * watching, and silently restarting a form generation would bill them twice.
 */

export interface SseEvent {
  event: string;
  data: unknown;
}

export async function streamEvents(
  path: string,
  init: {
    body?: unknown;
    signal?: AbortSignal;
    onEvent: (event: SseEvent) => void;
  },
): Promise<void> {
  const res = await fetch(path.startsWith("http") ? path : `${API_ORIGIN}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
  });

  // A refusal arrives as ordinary JSON before the stream begins — quota, role,
  // or a missing organization. Same handling as every other request.
  if (!res.ok) await throwApiError(res, path);
  if (!res.body) throw new Error("The server sent no events.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Events are separated by a blank line. Anything after the last one is a
      // partial event still arriving and stays in the buffer.
      let split: number;
      while ((split = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        const parsed = parseEvent(chunk);
        if (parsed) init.onEvent(parsed);
      }
    }
  } finally {
    // Cancelling on the way out is what actually stops the work upstream: the
    // Worker's writes start failing and its pipeline unwinds.
    await reader.cancel().catch(() => {});
  }
}

function parseEvent(chunk: string): SseEvent | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of chunk.split("\n")) {
    if (line.startsWith(":")) continue; // keepalive comment
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return { event, data: dataLines.join("\n") };
  }
}
