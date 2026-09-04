import { describe, expect, it } from "vitest";

/**
 * The reconnect contract, asserted directly.
 *
 * The server replays a session's whole transcript to every new SSE connection,
 * so a reconnect delivers every event the client has already applied. The old
 * client dealt with that by clearing the thread on connect and rebuilding it —
 * which blanked the conversation for a network round trip in front of the
 * respondent, and double-appended streamed tokens whenever the wipe raced the
 * replay. The fix is a monotonic high-water mark on the `id:` each frame
 * carries; this is that rule, isolated.
 */
function applier() {
  let lastSeq = 0;
  const applied: string[] = [];
  return {
    applied,
    /** Returns true when the event was applied rather than skipped. */
    on(lastEventId: string | undefined, label: string): boolean {
      const seq = Number(lastEventId);
      if (Number.isFinite(seq) && seq > 0) {
        if (seq <= lastSeq) return false;
        lastSeq = seq;
      }
      applied.push(label);
      return true;
    },
  };
}

describe("SSE replay de-duplication", () => {
  it("applies each persisted event exactly once across a reconnect", () => {
    const a = applier();
    const stream = [
      { id: "1", label: "message_start" },
      { id: "2", label: "token" },
      { id: "3", label: "message_end" },
      { id: "4", label: "question" },
    ];
    for (const e of stream) a.on(e.id, e.label);
    // The reconnect replays all of it, then adds one new event.
    for (const e of stream) a.on(e.id, e.label);
    a.on("5", "user_message");

    expect(a.applied).toEqual(["message_start", "token", "message_end", "question", "user_message"]);
  });

  it("never skips per-connection events, which carry no sequence", () => {
    const a = applier();
    a.on("7", "question");
    // session_ready and ping are sent per connection with seq 0.
    a.on("0", "session_ready");
    a.on("0", "session_ready");
    expect(a.applied).toEqual(["question", "session_ready", "session_ready"]);
  });

  it("keeps ratcheting after a replay, so a later event is not swallowed", () => {
    const a = applier();
    a.on("10", "question");
    a.on("3", "token"); // stale replay
    a.on("11", "user_message");
    expect(a.applied).toEqual(["question", "user_message"]);
  });
});

/**
 * The optimistic echo contract.
 *
 * A local bubble is shown the instant someone answers, and the server's
 * confirmation replaces that exact bubble. Matching on "any message still
 * marked optimistic" broke as soon as one answer was refused: the refused echo
 * stayed pending forever and the next answer replaced it, so the transcript
 * showed the rejected answer as though it had been accepted.
 */
interface Msg { id: string; text: string; optimistic?: boolean }

function thread() {
  let pending: string | null = null;
  const messages: Msg[] = [];
  return {
    messages,
    send(id: string, text: string) {
      pending = id;
      messages.push({ id, text, optimistic: true });
    },
    /** The server confirms an answer; its echo is replaced in place. */
    confirm(id: string, text: string) {
      const echoId = pending;
      pending = null;
      const i = echoId ? messages.findIndex((m) => m.id === echoId) : -1;
      if (i !== -1) messages[i] = { id, text: messages[i]!.text || text };
      else messages.push({ id, text });
    },
    /** The server refused; the echo will never get a twin. */
    reject() {
      const id = pending;
      pending = null;
      const i = messages.findIndex((m) => m.id === id);
      if (i !== -1) messages[i] = { ...messages[i]!, optimistic: false };
    },
  };
}

describe("optimistic echoes", () => {
  it("replaces an echo with its own confirmation, keeping the richer label", () => {
    const t = thread();
    t.send("local_1", "4/5");
    t.confirm("srv_1", "4");
    expect(t.messages).toEqual([{ id: "srv_1", text: "4/5" }]);
  });

  it("does not let a later answer inherit a refused echo", () => {
    const t = thread();
    t.send("local_1", "Email, Slack, SMS, WhatsApp");
    t.reject();
    t.send("local_2", "Email, Slack");
    t.confirm("srv_2", "Email, Slack");

    expect(t.messages.map((m) => m.text)).toEqual([
      "Email, Slack, SMS, WhatsApp",
      "Email, Slack",
    ]);
  });

  it("leaves an unmatched confirmation as its own message", () => {
    const t = thread();
    t.confirm("srv_1", "Verified as a@b.co");
    expect(t.messages).toEqual([{ id: "srv_1", text: "Verified as a@b.co" }]);
  });
});
