"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, RefreshCw, SendHorizonal } from "lucide-react";
import { toPublicConfig, type FormDoc } from "@repo/form-schema";
import { ChatBubble } from "@/components/chat/chat-bubble";
import { ChatClient } from "@/components/chat/chat-client";
import { getTurnstileToken } from "@/components/chat/turnstile";
import { Button } from "@/components/ui/button";
import { API_ORIGIN } from "@/lib/api/mutator";
import { chatThemeVars } from "@/lib/chat-theme";
import { getRespondentSignal } from "@/lib/respondent-signal";
import { cn } from "@/lib/utils";

/** How long starting waits on Cloudflare's bot check before going ahead without it. */
const TURNSTILE_WAIT_MS = 10_000;

type State =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "live"; session: { sessionId: string; token: string; eventsUrl: string } }
  | { kind: "limit"; message: string; signedIn: boolean }
  | { kind: "error"; message: string };

/**
 * The template, running: the real chat against the real runtime, in the same
 * colours as its card in the gallery.
 *
 * It opens already showing the greeting and the first question, so there is no
 * "start" to press: the conversation begins the moment the visitor touches it,
 * types, or picks an answer. Until then nothing is spent, because every
 * conversation is a paid model call and most people only look.
 *
 * The API caps tries per person per day (`template-demo-quota.ts`) on the
 * FingerprintJS device id, or the user when signed in. Past the cap the page
 * still has everything else: the questions, the flow and the button to use it.
 */
export function TemplateTryLive({ slug, doc, useHref }: { slug: string; doc: FormDoc; useHref: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const busy = useRef(false);

  // The template's own theme: the live try looks exactly like the form a
  // respondent opens once it is published.
  const config = useMemo(() => toPublicConfig(doc, { slug, brandingHidden: true }), [doc, slug]);
  const vars = useMemo(() => chatThemeVars(doc.theme, slug), [doc.theme, slug]);

  const greeting = doc.blocks.find((b) => b.type === "welcome")?.title;
  const first = doc.blocks.find((b) => b.type !== "welcome" && b.type !== "statement") as
    | { title: string; options?: { id: string; label: string }[] }
    | undefined;

  // Warm the device id while the visitor reads, so starting does not wait on it.
  useEffect(() => {
    void getRespondentSignal();
  }, []);

  const start = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setState({ kind: "starting" });
    try {
      // The bot check never holds the try hostage: after a few seconds it goes
      // ahead without a token, and the server answers with scripted questions
      // instead of the model (see `routes/template-demo.ts`).
      const [deviceSignal, turnstileToken] = await Promise.all([
        getRespondentSignal(),
        Promise.race([
          getTurnstileToken(),
          new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), TURNSTILE_WAIT_MS)),
        ]),
      ]);
      const res = await fetch(`${API_ORIGIN}/api/templates/${slug}/demo-sessions`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(deviceSignal ? { deviceSignal } : {}),
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { sessionId: string; respondentToken: string; sseUrl: string }
        | { error?: { code?: string; message?: string; signedIn?: boolean } }
        | null;
      if (res.ok && body && "sessionId" in body) {
        setState({ kind: "live", session: { sessionId: body.sessionId, token: body.respondentToken, eventsUrl: body.sseUrl } });
        return;
      }
      const err = body && "error" in body ? body.error : undefined;
      if (res.status === 429 || err?.code === "device_required") {
        setState({
          kind: "limit",
          message: err?.message ?? "You've used today's live tries. Come back tomorrow, or sign in and use this template to make your own.",
          signedIn: err?.signedIn === true,
        });
        return;
      }
      setState({ kind: "error", message: err?.message ?? "We couldn't start this template. Try again in a moment." });
    } catch {
      setState({ kind: "error", message: "We couldn't reach the chat. Check your connection and try again." });
    } finally {
      busy.current = false;
    }
  }, [slug]);

  return (
    <div className="border-border/80 bg-card overflow-hidden rounded-3xl border shadow-xl">
      <div className="border-border/70 flex items-center justify-between gap-3 border-b px-5 py-3">
        <p className="text-foreground/80 flex items-center gap-2 text-xs font-bold tracking-[0.14em] uppercase">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          The real thing. Go ahead, try it.
        </p>
        <Link prefetch={false} href={useHref} className="text-foreground hover:text-primary inline-flex items-center gap-1 text-sm font-semibold">
          Use this template
          <ArrowUpRight className="size-4" />
        </Link>
      </div>

      <div className="relative h-[36rem] [&_.chat-surface]:rounded-none">
        {state.kind === "live" ? (
          <ChatClient config={config} existingSession={state.session} previewMode onRestart={() => void start()} />
        ) : (
          <div
            role="button"
            tabIndex={0}
            aria-label="Start the conversation"
            onPointerDown={() => state.kind === "idle" && void start()}
            onKeyDown={(e) => state.kind === "idle" && (e.key === "Enter" || e.key.length === 1) && void start()}
            className="chat-surface flex h-full cursor-text flex-col focus-visible:outline-none"
            style={vars}
          >
            <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-start gap-3 px-5 pt-[4.5rem] pb-4">
              {greeting && (
                <div className="flex justify-start">
                  <ChatBubble from="bot">{greeting}</ChatBubble>
                </div>
              )}
              {first && (
                <div className="flex justify-start">
                  <ChatBubble from="bot">{first.title}</ChatBubble>
                </div>
              )}
              {first?.options && first.options.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {first.options.slice(0, 5).map((o) => (
                    <span
                      key={o.id}
                      className="rounded-[var(--cf-radius-control)] border border-[var(--cf-chip-border)] bg-[var(--cf-chip-bg)] px-3.5 py-1.5 text-sm font-medium"
                    >
                      {o.label}
                    </span>
                  ))}
                </div>
              )}
              {state.kind === "starting" && (
                <div className="flex justify-start">
                  <ChatBubble from="bot" aria-label="Typing">
                    <span className="flex gap-1 py-1">
                      <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.2s]" />
                      <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.1s]" />
                      <span className="size-1.5 animate-bounce rounded-full bg-current" />
                    </span>
                  </ChatBubble>
                </div>
              )}
            </div>
            <div className="mx-auto w-full max-w-2xl px-5 pb-5">
              <div className="flex items-center gap-3 rounded-[var(--cf-radius-card)] border border-[var(--cf-chip-border)] bg-[var(--cf-composer-bg)] px-4 py-3">
                <span className="flex-1 text-[0.9375rem] text-[var(--cf-muted)]">
                  {state.kind === "starting" ? "Starting the conversation…" : "Type your answer, or tap one above…"}
                </span>
                <span className="grid size-8 place-items-center rounded-full bg-[var(--cf-accent)] text-[var(--cf-accent-text)]">
                  <SendHorizonal className="size-4" />
                </span>
              </div>
            </div>
          </div>
        )}

        {(state.kind === "limit" || state.kind === "error") && (
          <div className="bg-background/70 absolute inset-0 grid place-items-center p-6 backdrop-blur-sm">
            <div className="bg-card border-border max-w-md rounded-2xl border p-6 text-center shadow-lg">
              <p className="text-foreground text-[0.9375rem] leading-relaxed">{state.message}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {state.kind === "limit" ? (
                  <>
                    <Button asChild shape="pill">
                      <Link prefetch={false} href={useHref}>Use this template</Link>
                    </Button>
                    {!state.signedIn && (
                      <Button asChild shape="pill" variant="outline">
                        <Link prefetch={false} href={`/signin?next=${encodeURIComponent(useHref)}`}>Sign in</Link>
                      </Button>
                    )}
                  </>
                ) : (
                  <Button variant="outline" shape="pill" onClick={() => void start()}>
                    <RefreshCw className="size-4" />
                    Try again
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Screen readers get a plain statement of what the panel is. */}
      <span className={cn("sr-only")}>A live preview of this template. Answer the first question to begin.</span>
    </div>
  );
}
