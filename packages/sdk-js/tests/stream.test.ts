import { describe, it, expect } from "vitest";
import { parseFrame, streamSession } from "../src/session/stream";

/**
 * The stream client's job is to survive a dropped connection without losing or
 * repeating an event. That is the whole reason for the sequence high-water mark,
 * so that is what these test.
 */

function sse(events: { seq: number; type: string }[]): string {
  return events.map((e) => `id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify({ v: 1, ...e, ts: 0, data: {} })}\n\n`).join("");
}

function bodyOf(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

describe("parseFrame", () => {
  it("reads a data line", () => {
    const event = parseFrame('id: 3\nevent: question\ndata: {"v":1,"seq":3,"ts":0,"type":"question","data":{}}');
    expect(event?.seq).toBe(3);
  });

  it("ignores keep-alives and comments", () => {
    expect(parseFrame(": ping")).toBeNull();
    expect(parseFrame("event: ping")).toBeNull();
  });
});

describe("streamSession", () => {
  it("yields events in order and stops at completion", async () => {
    const fetchImpl = async () =>
      new Response(bodyOf(sse([
        { seq: 1, type: "session_ready" },
        { seq: 2, type: "question" },
        { seq: 3, type: "complete" },
      ])), { status: 200 });

    const seen: number[] = [];
    for await (const event of streamSession("chs_1", { fetch: fetchImpl as never, apiKey: "sk_test_x" })) {
      seen.push(event.seq);
    }
    expect(seen).toEqual([1, 2, 3]);
  });

  it("resumes where the consumer got to, without repeating", async () => {
    let call = 0;
    const fetchImpl = async (_url: unknown, init?: RequestInit) => {
      call++;
      if (call === 1) {
        // The connection drops after two events.
        return new Response(bodyOf(sse([{ seq: 1, type: "session_ready" }, { seq: 2, type: "question" }])), {
          status: 200,
        });
      }
      // The reconnect must say where it got to, and the replay must not
      // re-deliver what was already yielded.
      expect((init?.headers as Record<string, string>)["last-event-id"]).toBe("2");
      return new Response(bodyOf(sse([
        { seq: 1, type: "session_ready" },
        { seq: 2, type: "question" },
        { seq: 3, type: "answer_recorded" },
        { seq: 4, type: "complete" },
      ])), { status: 200 });
    };

    const seen: number[] = [];
    for await (const event of streamSession("chs_1", {
      fetch: fetchImpl as never,
      apiKey: "sk_test_x",
      maxAttempts: 2,
    })) {
      seen.push(event.seq);
    }
    expect(seen).toEqual([1, 2, 3, 4]);
  });

  it("starts from a given sequence number", async () => {
    const fetchImpl = async (_url: unknown, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)["last-event-id"]).toBe("5");
      return new Response(bodyOf(sse([{ seq: 6, type: "complete" }])), { status: 200 });
    };
    const seen: number[] = [];
    for await (const event of streamSession("chs_1", { fetch: fetchImpl as never, since: 5 })) {
      seen.push(event.seq);
    }
    expect(seen).toEqual([6]);
  });
});
