"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2, Phone, ShieldCheck } from "lucide-react";
import type { AuthState } from "./use-chat";
import { firebasePhoneConfigured, sendPhoneCode, type PhoneCodeSent } from "./firebase-phone";

const GOOGLE_RESPONDENT_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_RESPONDENT_CLIENT_ID ?? "";
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
  onPhoneToken,
  onChangeNumber,
}: {
  auth: AuthState;
  onGoogle: (idToken: string) => void;
  onRequestCode: (phone: string, dialHint?: string) => void;
  onVerifyCode: (code: string) => void;
  onPhoneToken: (idToken: string) => void;
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

      {/*
        Two ways to prove a phone number, picked by what this deployment has
        configured. Firebase carries the SMS in production; the server-side OTP
        is the fallback, and is what runs locally where it prints the code
        instead of sending it — so the form is testable with no Firebase
        project and no money spent.
      */}
      {showPhone &&
        (firebasePhoneConfigured ? (
          <FirebasePhoneFlow auth={auth} onPhoneToken={onPhoneToken} />
        ) : (
          <PhoneFlow
            auth={auth}
            onRequestCode={onRequestCode}
            onVerifyCode={onVerifyCode}
            onChangeNumber={onChangeNumber}
          />
        ))}

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
  const [failed, setFailed] = useState(!GOOGLE_RESPONDENT_CLIENT_ID);
  // Kept in a ref so re-renders never re-initialize GSI, which would tear down
  // and re-mount its iframe under the respondent's cursor.
  const cb = useRef(onToken);
  useEffect(() => {
    cb.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!GOOGLE_RESPONDENT_CLIENT_ID) return;
    let cancelled = false;
    loadGsi()
      .then(() => {
        const id = window.google?.accounts?.id;
        if (cancelled || !id || !host.current) return;
        id.initialize({
          client_id: GOOGLE_RESPONDENT_CLIENT_ID,
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

/**
 * The number step and the code step, as plain rendering.
 *
 * Both phone flows below put a respondent through exactly these two screens —
 * only what happens between them differs — so the markup lives here once and
 * the controllers stay small enough to read in one go.
 */
function NumberForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (phone: string) => void;
}) {
  const [phone, setPhone] = useState("");
  const phoneId = useId();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (phone.trim() && !pending) onSubmit(phone.trim());
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
            disabled={pending}
            className="h-11 w-full rounded-full border border-[var(--cf-chip-border)] bg-[var(--cf-bg)] pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--cf-accent)]"
          />
        </div>
        <button
          type="submit"
          disabled={pending || !phone.trim()}
          className="h-11 shrink-0 rounded-full px-4 text-sm font-medium transition-transform active:scale-[0.98] disabled:opacity-50 motion-reduce:active:scale-100"
          style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)" }}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : "Send code"}
        </button>
      </div>
      <p className="text-[0.6875rem] opacity-45">Include your country code.</p>
    </form>
  );
}

/** Matches the server OTP cooldown, so neither path can outrun the other. */
const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Seconds left before another code may be asked for, ticking to zero.
 *
 * Keyed on `sentAt` rather than counted down from a mount, so a resend of the
 * same number restarts the wait — the case a boolean "already sent" flag gets
 * wrong, and the one a respondent who missed the first SMS actually hits.
 */
function useResendCountdown(sentAt: number | null): number {
  const [left, setLeft] = useState(sentAt === null ? 0 : RESEND_COOLDOWN_SECONDS);
  const [seen, setSeen] = useState(sentAt);

  // Reset during render rather than from an effect. React sanctions setting
  // state while rendering the same component — it re-runs before committing,
  // with no extra paint — whereas doing this in an effect shows a stale count
  // for one frame after every send.
  if (sentAt !== seen) {
    setSeen(sentAt);
    setLeft(sentAt === null ? 0 : RESEND_COOLDOWN_SECONDS);
  }

  // Counting down rather than reading the clock: `Date.now()` during render is
  // impure, and the value is only ever a label, so a second's drift over a
  // thirty second wait costs nothing that accuracy would buy back.
  const ticking = sentAt !== null && left > 0;
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    // Torn down as soon as `ticking` flips false, so nothing keeps firing for
    // the rest of the conversation once the wait is over.
    return () => clearInterval(id);
  }, [ticking]);

  return left;
}

function CodeForm({
  sentTo,
  sentAt,
  pending,
  devCode,
  onSubmit,
  onResend,
  onChangeNumber,
}: {
  sentTo: string;
  sentAt: number | null;
  pending: boolean;
  devCode?: string;
  onSubmit: (code: string) => void;
  onResend: () => void;
  onChangeNumber: () => void;
}) {
  const secondsLeft = useResendCountdown(sentAt);
  const [code, setCode] = useState("");
  const codeId = useId();
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    codeRef.current?.focus();
  }, []);

  const submit = useCallback(
    (value: string) => {
      if (value.length >= 4 && !pending) onSubmit(value);
    },
    [pending, onSubmit],
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(code);
      }}
      className="space-y-2"
    >
      <label htmlFor={codeId} className="block text-xs opacity-60">
        Enter the code sent to {sentTo}
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
            if (next.length === 6) submit(next);
          }}
          disabled={pending}
          className="h-11 w-32 rounded-full border border-[var(--cf-chip-border)] bg-[var(--cf-bg)] px-4 text-center font-mono text-lg tracking-[0.3em] outline-none focus-visible:ring-2 focus-visible:ring-[var(--cf-accent)]"
        />
        <button
          type="submit"
          disabled={pending || code.length < 4}
          className="h-11 flex-1 rounded-full text-sm font-medium transition-transform active:scale-[0.98] disabled:opacity-50 motion-reduce:active:scale-100"
          style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)" }}
        >
          {pending ? <Loader2 className="mx-auto size-4 animate-spin" /> : "Verify"}
        </button>
      </div>
      <div className="flex items-center gap-3 text-[0.6875rem]">
        {secondsLeft > 0 ? (
          // Plain text, not a disabled button: there is nothing to press yet,
          // and the number is the useful part — it says the wait is finite
          // rather than leaving someone wondering if the tap registered.
          <span className="opacity-45" aria-live="polite">
            Resend in {secondsLeft}s
          </span>
        ) : (
          <button
            type="button"
            onClick={onResend}
            disabled={pending}
            className="underline opacity-55 hover:opacity-100 disabled:opacity-30"
          >
            Resend code
          </button>
        )}
        <button type="button" onClick={onChangeNumber} className="underline opacity-55 hover:opacity-100">
          Use a different number
        </button>
        {devCode && <span className="font-mono opacity-40">dev code: {devCode}</span>}
      </div>
    </form>
  );
}

/**
 * Phone verification against our own OTP endpoints.
 *
 * The step the respondent is on is server state — `auth.phoneSentTo` is set by
 * the reply to `phone/start` — because only the server knows whether an SMS
 * was actually accepted for sending.
 */
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
  const sent = auth.phoneSentTo;

  if (!sent) return <NumberForm pending={auth.pending} onSubmit={onRequestCode} />;

  return (
    <CodeForm
      sentTo={sent}
      sentAt={auth.phoneSentAt}
      pending={auth.pending}
      devCode={auth.devCode}
      onSubmit={onVerifyCode}
      // The server is the one that knows the number, and re-asking for the
      // same one is exactly what `phone/start` already does.
      onResend={() => onRequestCode(sent)}
      onChangeNumber={onChangeNumber}
    />
  );
}

/**
 * Phone verification through Firebase.
 *
 * Everything up to the ID token happens in the browser, so unlike `PhoneFlow`
 * the step and its errors are local state — the server hears about this
 * respondent exactly once, at the end, when there is something proven to say.
 */
function FirebasePhoneFlow({
  auth,
  onPhoneToken,
}: {
  auth: AuthState;
  onPhoneToken: (idToken: string) => void;
}) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Held in a ref, not state: replacing it must never re-render mid-flow, and
  // it is read only inside callbacks.
  const confirmation = useRef<PhoneCodeSent | null>(null);
  // reCAPTCHA needs a real, mounted element to attach to — and to expand into
  // if Google decides this visitor has to solve a challenge.
  const recaptchaHost = useRef<HTMLDivElement>(null);

  const pending = busy || auth.pending;

  const send = useCallback(async (phone: string) => {
    const host = recaptchaHost.current;
    if (!host) return;
    setBusy(true);
    setError(null);
    const res = await sendPhoneCode(phone, host);
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    confirmation.current = res.sent;
    setSentTo(phone);
    setSentAt(Date.now());
  }, []);

  const verify = useCallback(
    async (code: string) => {
      const pendingConfirmation = confirmation.current;
      if (!pendingConfirmation) return;
      setBusy(true);
      setError(null);
      const res = await pendingConfirmation.confirm(code);
      setBusy(false);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      // From here the server owns the outcome, and `auth.error` reports it.
      onPhoneToken(res.idToken);
    },
    [onPhoneToken],
  );

  const changeNumber = useCallback(() => {
    confirmation.current = null;
    setSentTo(null);
    setSentAt(null);
    setError(null);
  }, []);

  return (
    <div className="space-y-2">
      {sentTo ? (
        <CodeForm
          sentTo={sentTo}
          sentAt={sentAt}
          pending={pending}
          onSubmit={verify}
          // `send` again, which mints a fresh reCAPTCHA and a fresh
          // confirmation — the old one is abandoned, so a code from the
          // earlier SMS stops working the moment a new one goes out.
          onResend={() => void send(sentTo)}
          onChangeNumber={changeNumber}
        />
      ) : (
        <NumberForm pending={pending} onSubmit={send} />
      )}
      {/*
        The verifier binds to this element. It stays in the layout even though
        the badge itself is hidden in globals.css, because the challenge dialog
        — shown only when Google is unsure about a visitor — positions itself
        against it.
      */}
      <div ref={recaptchaHost} />
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
      <RecaptchaNotice />
    </div>
  );
}

/**
 * The attribution Google's terms require in exchange for hiding the badge.
 *
 * Deliberately quiet — it is a legal notice at the bottom of a sign-in card,
 * not something a respondent needs to read to get on with the form.
 */
function RecaptchaNotice() {
  return (
    <p className="text-[0.625rem] leading-relaxed opacity-40">
      Protected by reCAPTCHA. Google&apos;s{" "}
      <a
        href="https://policies.google.com/privacy"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:opacity-80"
      >
        Privacy Policy
      </a>{" "}
      and{" "}
      <a
        href="https://policies.google.com/terms"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:opacity-80"
      >
        Terms
      </a>{" "}
      apply.
    </p>
  );
}
