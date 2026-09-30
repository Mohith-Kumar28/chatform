"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { toPublicBlock, toPublicConfig, type FormDoc } from "@repo/form-schema";
import { ChatClient, ChatSurface } from "@/components/chat/chat-client";
import { toChatState } from "@/components/chat/chat-snapshot";
import { getTurnstileToken } from "@/components/chat/turnstile";
import { Button } from "@/components/ui/button";
import { API_ORIGIN } from "@/lib/api/mutator";
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
  const still = useMemo(() => {
    const greeting = doc.blocks.find((b) => b.type === "welcome");
    const first = doc.blocks.find((b) => b.type !== "welcome" && b.type !== "statement");
    const asked = doc.blocks.filter((b) => b.type !== "welcome" && b.type !== "statement").length;
    return toChatState({
      v: 1,
      capturedAt: 0,
      config,
      messages: [
        ...(greeting ? [{ id: "still-greeting", role: "assistant" as const, text: greeting.title }] : []),
        ...(first ? [{ id: "still-first", role: "assistant" as const, text: first.title }] : []),
      ],
      question: first ? { block: toPublicBlock(first), progress: { answered: 0, totalEstimate: asked, pct: 0 } } : null,
      review: null,
      ending: null,
      submitted: null,
      auth: null,
      verify: null,
      status: "ready",
      error: null,
      thinking: false,
      validationHint: null,
      viewport: { width: 0, height: 0, dpr: 1 },
      timezone: null,
      path: null,
    });
  }, [doc, config]);

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
          /*
            Before the first touch: the real chat screen, drawn from a still
            state (the greeting and the first question, waiting). The same
            `ChatSurface` the hosted form renders, so header, chips and composer
            are the form's own; it is `inert`, and the wrapper catches the first
            click, tap or keypress and starts the live conversation in its place.
          */
          <div
            role="button"
            tabIndex={0}
            aria-label="Start the conversation"
            onPointerDown={() => state.kind === "idle" && void start()}
            onKeyDown={(e) => state.kind === "idle" && (e.key === "Enter" || e.key.length === 1) && void start()}
            className="h-full cursor-text focus-visible:outline-none"
          >
            <ChatSurface chat={still} config={config} replay />
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
