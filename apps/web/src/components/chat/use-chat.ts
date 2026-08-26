"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicBlock } from "@repo/form-schema";

export interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  text: string;
  streaming?: boolean;
}

interface QuestionState {
  block: PublicBlock;
  progress: { answered: number; totalEstimate: number; pct: number };
}

interface EndingState {
  title: string;
  bodyMd: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

interface UseChatOptions {
  slug: string;
  apiOrigin: string;
  hiddenFields?: Record<string, string>;
  /** Existing session (preview mode) — skips session creation. */
  existingSession?: { sessionId: string; token: string; eventsUrl: string } | null;
}

export function useChat({ slug, apiOrigin, hiddenFields, existingSession }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState<QuestionState | null>(null);
  const [ending, setEnding] = useState<EndingState | null>(null);
  const [status, setStatus] = useState<"connecting" | "ready" | "ended" | "error">("connecting");
  const [error, setError] = useState<string | null>(null);
  const [escalatedRef, setEscalatedRef] = useState<string | null>(null);
  const [validationHint, setValidationHint] = useState<string | null>(null);
  const [uploadSpec, setUploadSpec] = useState<{ ref: string; accept: string[]; maxFiles: number; maxSizeMB: number } | null>(null);
  const sessionRef = useRef<{ sessionId: string; token: string } | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const pendingRef = useRef<Promise<void> | null>(null);

  const pushMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
  }, []);

  const appendToken = useCallback((messageId: string, delta: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, text: m.text + delta } : m)),
    );
  }, []);

  const reconnectRef = useRef<((sessionId: string, token: string, attempt: number) => void) | null>(null);

  const connectStream = useCallback(
    (sessionId: string, token: string, attempt: number) => {
      esRef.current?.close();
      // replay rebuilds the full transcript, so always clear local state —
      // otherwise re-streamed tokens double-append onto existing bubbles
      setMessages([]);
      const es = new EventSource(`${apiOrigin}/p/sessions/${sessionId}/events?t=${token}`);
      esRef.current = es;

      es.addEventListener("session_ready", () => setStatus("ready"));

      es.addEventListener("user_message", (e) => {
        const { messageId, text } = JSON.parse((e as MessageEvent).data) as { messageId: string; text: string };
        pushMessage({ id: messageId, role: "user", text });
      });

      es.addEventListener("message_start", (e) => {
        const { messageId } = JSON.parse((e as MessageEvent).data) as { messageId: string };
        pushMessage({ id: messageId, role: "assistant", text: "", streaming: true });
      });

      es.addEventListener("token", (e) => {
        const { messageId, delta } = JSON.parse((e as MessageEvent).data) as { messageId: string; delta: string };
        appendToken(messageId, delta);
      });

      es.addEventListener("message_end", (e) => {
        const { messageId } = JSON.parse((e as MessageEvent).data) as { messageId: string };
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, streaming: false } : m)));
      });

      es.addEventListener("question", (e) => {
        const data = JSON.parse((e as MessageEvent).data) as QuestionState;
        setQuestion(data);
        setEscalatedRef(null);
        setValidationHint(null);
      });

      es.addEventListener("validation_error", (e) => {
        const { message } = JSON.parse((e as MessageEvent).data) as { message: string };
        setValidationHint(message);
      });

      es.addEventListener("upload_request", (e) => {
        const data = JSON.parse((e as MessageEvent).data) as { ref: string; accept?: string[]; maxFiles?: number; maxSizeMB?: number };
        setUploadSpec({ ref: data.ref, accept: data.accept ?? ["image/png", "image/jpeg", "application/pdf"], maxFiles: data.maxFiles ?? 1, maxSizeMB: data.maxSizeMB ?? 10 });
      });

      es.addEventListener("upload_received", () => {
        setUploadSpec(null);
      });

      es.addEventListener("escalate_ui", (e) => {
        const { ref } = JSON.parse((e as MessageEvent).data) as { ref: string };
        setEscalatedRef(ref);
      });

      es.addEventListener("ending", (e) => {
        const { ending } = JSON.parse((e as MessageEvent).data) as { ending: EndingState };
        setEnding({ title: ending.title, bodyMd: ending.bodyMd, ctaLabel: ending.ctaLabel, ctaUrl: ending.ctaUrl });
        setQuestion(null);
      });

      es.addEventListener("complete", () => {
        setStatus("ended");
        es.close();
      });

      es.onerror = () => {
        es.close();
        if (attempt < 5) {
          setTimeout(() => reconnectRef.current?.(sessionId, token, attempt + 1), 800 * (attempt + 1));
        } else {
          setStatus("error");
          setError("Connection lost");
        }
      };
    },
    [apiOrigin, appendToken, pushMessage],
  );
  useEffect(() => {
    reconnectRef.current = connectStream;
  }, [connectStream]);

  const start = useCallback(async () => {
    if (existingSession) {
      sessionRef.current = { sessionId: existingSession.sessionId, token: existingSession.token };
      connectStream(existingSession.sessionId, existingSession.token, 0);
      return;
    }
    if (sessionRef.current) {
      connectStream(sessionRef.current.sessionId, sessionRef.current.token, 0);
      return;
    }
    if (pendingRef.current) {
      await pendingRef.current;
      const existing = sessionRef.current as { sessionId: string; token: string } | null;
      if (existing) connectStream(existing.sessionId, existing.token, 0);
      return;
    }
    pendingRef.current = (async () => {
      try {
        const res = await fetch(`${apiOrigin}/p/forms/${slug}/sessions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ hiddenFields }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
          throw new Error(body?.error?.message ?? "Could not start session");
        }
        const data = (await res.json()) as { sessionId: string; respondentToken: string };
        sessionRef.current = { sessionId: data.sessionId, token: data.respondentToken };
        connectStream(data.sessionId, data.respondentToken, 0);
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Connection failed");
      } finally {
        pendingRef.current = null;
      }
    })();
    await pendingRef.current;
  }, [slug, apiOrigin, hiddenFields, connectStream]);

  const send = useCallback(async (text: string) => {
    const session = sessionRef.current;
    if (!session) return;
    // user turn is echoed back via the `user_message` SSE event (replay-safe)
    await fetch(`${apiOrigin}/p/sessions/${session.sessionId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-respondent-token": session.token },
      body: JSON.stringify({ type: "text", text }),
    });
  }, [apiOrigin]);

  const sendStructured = useCallback(async (ref: string, value: unknown, display?: string) => {
    const session = sessionRef.current;
    if (!session) return;
    await fetch(`${apiOrigin}/p/sessions/${session.sessionId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-respondent-token": session.token },
      body: JSON.stringify({ type: "structured", ref, value }),
    });
    void display;
  }, [apiOrigin]);

  const sendAction = useCallback(async (action: "skip" | "restart" | "stop") => {
    const session = sessionRef.current;
    if (!session) return;
    await fetch(`${apiOrigin}/p/sessions/${session.sessionId}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-respondent-token": session.token },
      body: JSON.stringify({ action }),
    });
  }, [apiOrigin]);

  /** Base URL for the upload endpoints of the live session (null before connect). */
  const getUploadBase = useCallback(() => {
    const s = sessionRef.current;
    return s ? `${apiOrigin}/p/sessions/${s.sessionId}/uploads` : null;
  }, [apiOrigin]);

  const getRespondentToken = useCallback(() => sessionRef.current?.token ?? null, []);

  useEffect(() => {
    const t = setTimeout(() => void start(), 0);
    return () => {
      clearTimeout(t);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [start]);

  return { messages, question, ending, status, error, escalatedRef, validationHint, uploadSpec, getUploadBase, getRespondentToken, send, sendStructured, sendAction };
}
