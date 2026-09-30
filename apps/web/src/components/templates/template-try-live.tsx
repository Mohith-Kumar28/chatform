"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, MessageCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { toPublicConfig, type FormDoc } from "@repo/form-schema";
import { ChatClient } from "@/components/chat/chat-client";
import { getTurnstileToken } from "@/components/chat/turnstile";
import { Button } from "@/components/ui/button";
import { API_ORIGIN } from "@/lib/api/mutator";
import { getRespondentSignal } from "@/lib/respondent-signal";
import { cn } from "@/lib/utils";

/** How long Start waits on Cloudflare's bot check before going ahead without it. */
const TURNSTILE_WAIT_MS = 10_000;

type State =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "live"; session: { sessionId: string; token: string; eventsUrl: string } }
  | { kind: "limit"; message: string; signedIn: boolean }
  | { kind: "error"; message: string };

/**
 * The template, running: the real chat against the real runtime.
 *
 * Nothing starts until the visitor asks, because every conversation is paid
 * for and most people scroll past. The API caps tries per person per day
 * (`apps/api/src/lib/template-demo-quota.ts`), keyed on the same FingerprintJS
 * device id the chat uses, or the user when signed in. Past the cap the page
 * still has everything else: the questions, the flow and the button to use it.
 *
 * `credentials: "include"` so a signed-in visitor is counted as themselves and
 * gets the higher allowance.
 */
export function TemplateTryLive({
  slug,
  doc,
  useHref,
}: {
  slug: string;
  doc: FormDoc;
  useHref: string;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const busy = useRef(false);

  // Warm the device id while the visitor reads, so Start does not wait on it.
  // Memoised and cached by the helper, and it never throws.
  useEffect(() => {
    void getRespondentSignal();
  }, []);

  const config = useMemo(() => toPublicConfig(doc, { slug, brandingHidden: true }), [doc, slug]);

  const start = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setState({ kind: "starting" });
    try {
      // The bot check never holds the try hostage: after a few seconds it
      // starts without a token, and the server runs it with scripted
      // questions instead of the model (see `routes/template-demo.ts`).
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
          message: err?.message ?? "You've used today's live tries. Come back tomorrow, or sign in and use this template.",
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
    <div
      className={cn(
        "bg-card border-border/70 isolate flex w-full flex-col overflow-hidden rounded-2xl border shadow-md [&_.chat-surface]:rounded-2xl",
        // Full height only once there is a conversation to hold.
        state.kind === "live" ? "h-[34rem]" : "min-h-56",
      )}
    >
      {state.kind === "live" ? (
        <div className="min-h-0 flex-1">
          <ChatClient config={config} existingSession={state.session} previewMode onRestart={() => void start()} />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          {state.kind === "limit" ? (
            <>
              <p className="text-body max-w-sm">{state.message}</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild shape="pill">
                  <Link href={useHref}>
                    Use this template
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                {!state.signedIn && (
                  <Button asChild shape="pill" variant="outline">
                    <Link href={`/signin?next=${encodeURIComponent(useHref)}`}>Sign in</Link>
                  </Button>
                )}
              </div>
            </>
          ) : state.kind === "error" ? (
            <>
              <TriangleAlert className="text-destructive size-5" />
              <p className="text-body text-muted-foreground max-w-sm">{state.message}</p>
              <Button variant="outline" shape="pill" onClick={() => void start()}>
                <RefreshCw className="size-4" />
                Try again
              </Button>
            </>
          ) : (
            <>
              <span className="bg-primary/10 text-primary grid size-12 place-items-center rounded-2xl">
                <MessageCircle className="size-6" strokeWidth={1.75} />
              </span>
              <p className="font-display text-h3 font-semibold">Try it as a respondent</p>
              <Button shape="pill" size="lg" onClick={() => void start()} disabled={state.kind === "starting"}>
                {state.kind === "starting" ? "Starting…" : "Start the conversation"}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
