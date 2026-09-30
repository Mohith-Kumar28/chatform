/**
 * A server-sent event stream whose work outlives the handler.
 *
 * Both AI streams (creating a form, editing one) need the same three things:
 * headers flushed at once, so Cloudflare's edge never sees an idle request and
 * ends it with a 524; writes that stop quietly when the author closes the tab;
 * and `waitUntil`, so the runtime does not cancel work still writing to a
 * response it has already returned.
 */

const HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  // no-transform is what stops an intermediary from buffering the whole
  // response and delivering it at the end.
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
} as const;

export type SendEvent = (event: string, data: unknown) => Promise<void>;

export function eventStream(ctx: { waitUntil(p: Promise<unknown>): void }, run: (send: SendEvent) => Promise<void>): Response {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  let closed = false;

  const send: SendEvent = async (event, data) => {
    if (closed) return;
    try {
      await writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    } catch {
      // The author navigated away or hit cancel.
      closed = true;
    }
  };

  ctx.waitUntil(
    (async () => {
      try {
        await run(send);
      } finally {
        closed = true;
        try {
          await writer.close();
        } catch {
          // Already closed by the client disconnecting.
        }
      }
    })(),
  );
  return new Response(readable, { headers: HEADERS });
}
