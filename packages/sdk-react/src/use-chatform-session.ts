"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserClient, streamSession } from "@chatformhq/js/browser";
import type { PublicBlock, PublicEnding, SessionEvent } from "@chatformhq/js/browser";

/**
 * A conversation, as React state.
 *
 * The engine decides what to ask and what is valid; this hook only tracks what
 * has been said so you can render it. That division is the point — you own every
 * pixel and none of the flow logic.
 */

export interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  /** False while tokens are still arriving. */
  done: boolean;
}

export interface UseChatformSessionOptions {
  formId: string;
  /** A `pk_` key, or omit it and pass a `respondentToken` your server minted. */
  publishableKey?: string;
  respondentToken?: string;
  sessionId?: string;
  hiddenFields?: Record<string, string>;
  baseUrl?: string;
  /** Wait for an explicit `start()` instead of opening on mount. */
  manual?: boolean;
}

export interface UseChatformSession {
  sessionId: string | null;
  messages: ChatMessage[];
  question: PublicBlock | null;
  ending: PublicEnding | null;
  status: "idle" | "opening" | "ready" | "thinking" | "complete" | "error";
  /** A rejected answer. Not an error — the same question is still open. */
  validation: { ref: string; code: string; message: string } | null;
  error: Error | null;
  awaitingSubmit: boolean;
  start: () => Promise<void>;
  send: (text: string) => Promise<void>;
  answer: (ref: string, value: unknown) => Promise<void>;
  act: (action: "skip" | "stop" | "restart" | "submit", ref?: string) => Promise<void>;
}

export function useChatformSession(options: UseChatformSessionOptions): UseChatformSession {
  const [sessionId, setSessionId] = useState<string | null>(options.sessionId ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState<PublicBlock | null>(null);
  const [ending, setEnding] = useState<PublicEnding | null>(null);
  const [status, setStatus] = useState<UseChatformSession["status"]>("idle");
  const [validation, setValidation] = useState<UseChatformSession["validation"]>(null);
  const [error, setError] = useState<Error | null>(null);
  const [awaitingSubmit, setAwaitingSubmit] = useState(false);

  /**
   * Guards a double-open.
   *
   * React's strict mode mounts effects twice in development, and without this
   * every developer sees two sessions created for every page load — which looks
   * like a bug in the API rather than in their own tree.
   */
  const opening = useRef<Promise<void> | null>(null);
  const client = useRef(
    options.publishableKey
      ? createBrowserClient({ publishableKey: options.publishableKey, baseUrl: options.baseUrl })
      : null,
  );

  const applyEvents = useCallback((events: SessionEvent[]) => {
    for (const event of events) {
      const data = event.data as Record<string, unknown>;
      if (event.type === "message_start") {
        setMessages((prev) => [
          ...prev,
          { id: String(data.messageId), role: "assistant", content: "", done: false },
        ]);
      }
      if (event.type === "token") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === String(data.messageId) ? { ...m, content: m.content + String(data.delta) } : m,
          ),
        );
      }
      if (event.type === "message_end") {
        setMessages((prev) => prev.map((m) => (m.id === String(data.messageId) ? { ...m, done: true } : m)));
      }
    }
  }, []);

  const start = useCallback(async () => {
    if (opening.current) return opening.current;
    if (!client.current) {
      setError(new Error("A publishable key is required to open a session from the browser."));
      setStatus("error");
      return;
    }
    setStatus("opening");
    opening.current = (async () => {
      try {
        const session = await client.current!.sessions.create(options.formId, {
          hiddenFields: options.hiddenFields,
        });
        setSessionId(session.sessionId);
        setQuestion(session.question);
        if (session.greeting) {
          setMessages([{ id: "greeting", role: "assistant", content: session.greeting, done: true }]);
        }
        setStatus("ready");
      } catch (err) {
        setError(err as Error);
        setStatus("error");
      }
    })();
    return opening.current;
  }, [options.formId, options.hiddenFields]);

  useEffect(() => {
    if (!options.manual && !sessionId && status === "idle") void start();
  }, [options.manual, sessionId, status, start]);

  const turn = useCallback(
    async (run: () => Promise<Awaited<ReturnType<NonNullable<typeof client.current>["sessions"]["send"]>>>) => {
      if (!sessionId || !client.current) return;
      setStatus("thinking");
      setValidation(null);
      try {
        const result = await run();
        applyEvents(result.events ?? []);
        setQuestion(result.question);
        setEnding(result.ending);
        setValidation(result.validation);
        setAwaitingSubmit(result.awaitingSubmit);
        setStatus(result.complete ? "complete" : "ready");
      } catch (err) {
        setError(err as Error);
        setStatus("error");
      }
    },
    [sessionId, applyEvents],
  );

  const send = useCallback(
    async (text: string) => {
      setMessages((prev) => [
        ...prev,
        { id: `user_${Date.now()}`, role: "user", content: text, done: true },
      ]);
      await turn(() => client.current!.sessions.send(sessionId!, text));
    },
    [sessionId, turn],
  );

  const answer = useCallback(
    async (ref: string, value: unknown) => turn(() => client.current!.sessions.answer(sessionId!, { ref, value })),
    [sessionId, turn],
  );

  const act = useCallback(
    async (action: "skip" | "stop" | "restart" | "submit", ref?: string) =>
      turn(() => client.current!.sessions.act(sessionId!, action, ref)),
    [sessionId, turn],
  );

  return {
    sessionId,
    messages,
    question,
    ending,
    status,
    validation,
    error,
    awaitingSubmit,
    start,
    send,
    answer,
    act,
  };
}

export { streamSession };
