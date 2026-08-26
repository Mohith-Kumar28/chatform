"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2, Phone, ShieldCheck } from "lucide-react";
import type { AuthState } from "./use-chat";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const GSI_SRC = "https://accounts.google.com/gsi/client";

interface GsiId {
  initialize: (o: { client_id: string; callback: (r: { credential: string }) => void; auto_select?: boolean }) => void;
  renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
}
declare global {
  interface Window {
    google?: { accounts?: { id?: GsiId } };
  }
}

/** Load the Google script once per page, however many cards ask for it. */
let gsiPromise: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  if (window.google?.accounts?.id) return Promise.resolve();
  gsiPromise ??= new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    const script = existing ?? document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gsiPromise = null; // let a later attempt retry rather than fail forever
      reject(new Error("gsi_load_failed"));
    };
    if (!existing) document.head.appendChild(script);
  });
  return gsiPromise;
}

/**
 * Sign-in, rendered as a card inside the conversation.
 *
 * The respondent never leaves the chat: no interstitial, no redirect, no
 * bounce back to a cold page. Google returns an ID token straight to the
 * callback here, and phone verification is two steps in the same card. A
 * redirect-based OAuth flow would lose the session mid-form, which is exactly
 * the moment people give up on a form.
 */
export function AuthCard({
  auth,
  onGoogle,
  onRequestCode,
  onVerifyCode,
  onChangeNumber,
}: {
  auth: AuthState;
  onGoogle: (idToken: string) => void;
  onRequestCode: (phone: string, dialHint?: string) => void;
  onVerifyCode: (code: string) => void;
  onChangeNumber: () => void;
}) {
  const showGoogle = auth.methods.includes("google");
  const showPhone = auth.methods.includes("phone");

  return (
    <div className="animate-message-in space-y-3 rounded-2xl bg-[var(--cf-chip-bg)] p-4">
      <p className="flex items-center gap-2 text-xs font-medium opacity-60">
        <ShieldCheck className="size-3.5" />
        Verify to continue
      </p>

      {showGoogle && <GoogleButton onToken={onGoogle} disabled={auth.pending} />}

      {showGoogle && showPhone && (
        <div className="flex items-center gap-3 text-[0.6875rem] opacity-40">
          <span className="h-px flex-1 bg-current" />
          or
          <span className="h-px flex-1 bg-current" />
        </div>
      )}

      {showPhone && (
        <PhoneFlow
          auth={auth}
          onRequestCode={onRequestCode}
          onVerifyCode={onVerifyCode}
          onChangeNumber={onChangeNumber}
        />
      )}

      {auth.error && (
        <p role="alert" className="text-destructive text-xs">
          {auth.error}
        </p>
      )}
    </div>
  );
}

function GoogleButton({ onToken, disabled }: { onToken: (t: string) => void; disabled: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  // No client id configured is knowable at first render; there is nothing to
  // wait for and nothing to load.
  const [failed, setFailed] = useState(!GOOGLE_CLIENT_ID);
  // Kept in a ref so re-renders never re-initialize GSI, which would tear down
  // and re-mount its iframe under the respondent's cursor.
  const cb = useRef(onToken);
  useEffect(() => {
    cb.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    loadGsi()
      .then(() => {
        const id = window.google?.accounts?.id;
        if (cancelled || !id || !host.current) return;
        id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (r) => cb.current(r.credential),
        });
        id.renderButton(host.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          width: 320,
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <p className="text-xs opacity-60">
        Google sign-in isn&apos;t available right now.
      </p>
    );
  }

  return (
    <div
      ref={host}
      // GSI renders its own button in an iframe, so pointer-events is the only
      // way to disable it while a verification is in flight.
      className={disabled ? "pointer-events-none opacity-50" : undefined}
    />
  );
}

function PhoneFlow({
  auth,
  onRequestCode,
  onVerifyCode,
  onChangeNumber,
}: {
  auth: AuthState;
  onRequestCode: (phone: string, dialHint?: string) => void;
  onVerifyCode: (code: string) => void;
  onChangeNumber: () => void;
}) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const phoneId = useId();
  const codeId = useId();
  const codeRef = useRef<HTMLInputElement>(null);

  const sent = auth.phoneSentTo;

  useEffect(() => {
    if (sent) codeRef.current?.focus();
  }, [sent]);

  const submitCode = useCallback(
    (value: string) => {
      if (value.length >= 4 && !auth.pending) onVerifyCode(value);
    },
    [auth.pending, onVerifyCode],
  );

  if (!sent) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (phone.trim() && !auth.pending) onRequestCode(phone.trim());
        }}
        className="space-y-2"
      >
        <label htmlFor={phoneId} className="sr-only">
          Phone number
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Phone className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 opacity-40" />
            <input
              id={phoneId}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 415 555 0132"
              disabled={auth.pending}
              className="h-11 w-full rounded-full border border-[var(--cf-chip-border)] bg-[var(--cf-bg)] pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--cf-accent)]"
            />
          </div>
          <button
            type="submit"
            disabled={auth.pending || !phone.trim()}
            className="h-11 shrink-0 rounded-full px-4 text-sm font-medium transition-transform active:scale-[0.98] disabled:opacity-50 motion-reduce:active:scale-100"
            style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)" }}
          >
            {auth.pending ? <Loader2 className="size-4 animate-spin" /> : "Send code"}
          </button>
        </div>
        <p className="text-[0.6875rem] opacity-45">Include your country code.</p>
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submitCode(code);
      }}
      className="space-y-2"
    >
      <label htmlFor={codeId} className="block text-xs opacity-60">
        Enter the code sent to {sent}
      </label>
      <div className="flex gap-2">
        <input
          id={codeId}
          ref={codeRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => {
            const next = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(next);
            // Six digits is the whole code, so submit rather than making them
            // reach for a button they can already see is redundant.
            if (next.length === 6) submitCode(next);
          }}
          disabled={auth.pending}
          className="h-11 w-32 rounded-full border border-[var(--cf-chip-border)] bg-[var(--cf-bg)] px-4 text-center font-mono text-lg tracking-[0.3em] outline-none focus-visible:ring-2 focus-visible:ring-[var(--cf-accent)]"
        />
        <button
          type="submit"
          disabled={auth.pending || code.length < 4}
          className="h-11 flex-1 rounded-full text-sm font-medium transition-transform active:scale-[0.98] disabled:opacity-50 motion-reduce:active:scale-100"
          style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)" }}
        >
          {auth.pending ? <Loader2 className="mx-auto size-4 animate-spin" /> : "Verify"}
        </button>
      </div>
      <div className="flex items-center gap-3 text-[0.6875rem]">
        <button type="button" onClick={onChangeNumber} className="underline opacity-55 hover:opacity-100">
          Use a different number
        </button>
        {auth.devCode && <span className="font-mono opacity-40">dev code: {auth.devCode}</span>}
      </div>
    </form>
  );
}
