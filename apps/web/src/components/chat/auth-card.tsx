"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronRight, Loader2, Phone, ShieldCheck } from "lucide-react";
import type { AuthState } from "./use-chat";
import { firebasePhoneConfigured, sendPhoneCode, type PhoneCodeSent } from "./firebase-phone";
import { asEmail, type RespondentHint } from "./respondent-hint";
import {
  GOOGLE_RESPONDENT_CLIENT_ID,
  prepareGoogle,
  setCredentialSink,
  type GsiId,
} from "./google-signin";

/**
 * Sign-in, rendered as a card inside the conversation.
 *
 * The respondent never leaves the chat: no interstitial, no redirect, no
 * bounce back to a cold page. Google returns an ID token straight to the
 * callback here, and phone verification is two steps in the same card. A
 * redirect-based OAuth flow would lose the session mid-form, which is exactly
 * the moment people give up on a form.
 *
 * One method is offered, never two. The form names it — see
 * `settings.requireAuth.method` — because a card with two doors produces two
 * different identities for the same person, and "one response per person"
 * cannot mean anything when the second door is right there.
 */
export function AuthCard({
  auth,
  hint,
  onGoogle,
  onPhoneToken,
  onForgetHint,
}: {
  auth: AuthState;
  /** Who this device signed in as last time, if this form takes that method. */
  hint: RespondentHint | null;
  onGoogle: (idToken: string) => void;
  onPhoneToken: (idToken: string) => void;
  onForgetHint: () => void;
}) {
  const showGoogle = auth.method === "google";
  const showPhone = auth.method === "phone";

  // A hint is only worth showing when this form actually takes that method: a
  // form that asks for a phone number has no use for a remembered Google
  // account, and offering one would be a dead end.
  const googleHint = showGoogle && hint?.provider === "google" ? hint : null;
  const phoneHint = showPhone && hint?.provider === "phone" ? hint : null;

  return (
    <div className="animate-message-in space-y-3 rounded-2xl bg-[var(--cf-chip-bg)] p-4">
      <p className="flex items-center gap-2 text-xs font-medium opacity-60">
        <ShieldCheck className="size-3.5" />
        Verify to continue
      </p>

      {showGoogle && (
        <GoogleSignIn
          hint={googleHint}
          onToken={onGoogle}
          onUseAnother={onForgetHint}
          disabled={auth.pending}
        />
      )}

      {/*
        Firebase carries the SMS — there is no second phone path, so a
        deployment without it says so plainly instead of drawing a form that
        cannot send anything.
      */}
      {showPhone &&
        (firebasePhoneConfigured ? (
          <FirebasePhoneFlow auth={auth} hint={phoneHint} onPhoneToken={onPhoneToken} />
        ) : (
          <PhoneUnavailable />
        ))}

      {auth.error && (
        <p role="alert" className="text-destructive text-xs">
          {auth.error}
        </p>
      )}
    </div>
  );
}

/**
 * One Tap is drawn by the browser against the top-level document. Inside an
 * embedded form it has nowhere to go, so the shortcut is not offered there —
 * the standard button, which works in a frame, is.
 */
function inTopLevelWindow(): boolean {
  try {
    return window.self === window.top;
  } catch {
    // Reading `top` across origins throws, and that is itself the answer.
    return false;
  }
}

/** How long a prompt that may never appear is given before the button does. */
const PROMPT_GRACE_MS = 4000;

/**
 * The same wait, for the attempt nobody asked for.
 *
 * Shorter, because this one runs on its own the moment the card appears and
 * whatever it is hiding — the row they could press — is the thing they came to
 * press. Long enough for a silent credential to come back, short enough that a
 * respondent whose browser is not going to answer is not left watching a
 * spinner.
 */
const AUTO_PROMPT_GRACE_MS = 2000;

/**
 * Google sign-in — and, for someone who has already done this once, a way past
 * it.
 *
 * Most respondents arriving at a form that asks them to verify are signed in
 * to Google in that very browser already. Making them press "Continue with
 * Google", pick their account out of a chooser, and wait for a popup is asking
 * them to prove something the browser could simply be asked for. When this
 * device has verified before, the card opens on "Continue as <them>", and one
 * press takes the whole sign-in: `auto_select` returns a credential outright
 * when Google is sure who this is, and shows the account when it wants a
 * confirmation.
 *
 * Nothing about the trust model moves. The remembered name is a hint with no
 * authority — the press still produces a fresh ID token, and the server still
 * verifies its signature, issuer, audience and expiry before anyone is
 * verified. The shortcut saves taps, not checks.
 */
function GoogleSignIn({
  hint,
  onToken,
  onUseAnother,
  disabled,
}: {
  hint: RespondentHint | null;
  onToken: (t: string) => void;
  onUseAnother: () => void;
  disabled: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const idRef = useRef<GsiId | null>(null);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // No client id configured is knowable at first render; there is nothing to
  // wait for and nothing to load.
  const [failed, setFailed] = useState(!GOOGLE_RESPONDENT_CLIENT_ID);
  const [ready, setReady] = useState(false);
  const [prompting, setPrompting] = useState(false);
  const [fellBack, setFellBack] = useState(false);
  // Decided once, at mount: whether this form is running inside someone
  // else's page.
  const [topLevel] = useState(() => typeof window !== "undefined" && inTopLevelWindow());
  // Kept in a ref so re-renders never re-initialize GSI, which would tear down
  // and re-mount its iframe under the respondent's cursor. It is also what the
  // module-level sink below forwards to, so a callback that changes identity
  // every render cannot detach and reattach the credential handler.
  const cb = useRef(onToken);
  useEffect(() => {
    cb.current = onToken;
  }, [onToken]);

  const loginHint = hint ? asEmail(hint.label) : undefined;
  const shortcut = Boolean(hint) && topLevel && !fellBack;
  // One automatic attempt per mount, tracked in a ref so re-initializing GSI
  // when the hint arrives from storage cannot fire a second.
  const autoTried = useRef(false);

  // Re-runs if the hint arrives from storage a beat after mount, or is
  // forgotten — both change what Google should be asked for. It runs before
  // any button has been rendered in the first case, and the second only
  // happens from the shortcut, so it never re-initializes under a live button.
  useEffect(() => {
    let cancelled = false;
    prepareGoogle(loginHint)
      .then((id) => {
        if (cancelled || !id) return;
        idRef.current = id;
        setReady(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [loginHint]);

  /*
    Claim the credential for as long as this card is on screen.

    GSI's callback is fixed when `initialize` runs, and that now happens during
    boot — before this component exists — so the token arrives at a module-level
    dispatcher and is handed on to whoever is currently mounted. Detaching on
    unmount is what keeps a credential from a prompt the respondent walked away
    from reaching a card that has since been replaced.
  */
  useEffect(() => setCredentialSink((c) => cb.current(c)), []);

  // The host only exists when the button is being shown, and React has
  // committed it to the DOM by the time this runs — both when the script
  // finishes loading and when the shortcut steps aside for it.
  useEffect(() => {
    if (shortcut || !ready || !host.current) return;
    host.current.replaceChildren(); // never stack two buttons
    idRef.current?.renderButton(host.current, {
      type: "standard",
      theme: "outline",
      size: "large",
      shape: "pill",
      text: "continue_with",
      width: 320,
    });
  }, [ready, shortcut]);

  useEffect(() => () => {
    if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
  }, []);

  const askGoogle = useCallback(
    (auto: boolean) => {
      const id = idRef.current;
      if (!id || disabled) return;
      setPrompting(true);
      id.prompt();
      /*
        Nothing after this line is guaranteed to happen. Google either returns a
        credential, or shows the account for a confirmation, or — cooled off,
        third-party sign-in turned off, the session ended since we last saw it —
        does nothing whatsoever and says nothing about it: under FedCM the
        notifications that used to report a prompt which never appeared are no
        longer sent. So the card waits, and then stops waiting. The prompt is
        not cancelled when it does; if Google was merely slow, both routes still
        land in the same callback.

        What it stops waiting *for* depends on who asked. An attempt they made
        themselves has been refused, so the standard button — the one that
        always works — takes over. An automatic one falls back only as far as
        the row they can press: silent re-authentication has a cool-off period
        that a real press goes straight through, so throwing the shortcut away
        because the browser declined to use it unasked would be giving up one
        step too early.
      */
      fallbackTimer.current = setTimeout(
        () => {
          setPrompting(false);
          if (!auto) setFellBack(true);
        },
        auto ? AUTO_PROMPT_GRACE_MS : PROMPT_GRACE_MS,
      );
    },
    [disabled],
  );

  /**
   * Try to sign them in before they touch anything.
   *
   * A respondent who verified on this device an hour ago has proved everything
   * this gate is asking for, and their browser can say so without a single tap:
   * `auto_select` returns a credential outright when Google holds one consented
   * session for this client. Waiting for a press meant a card that could have
   * cleared itself instead sat there asking a returning respondent to confirm
   * they are still themselves.
   *
   * Nothing about the trust model moves — the credential is a fresh ID token
   * the server verifies exactly as it verifies a pressed one. This decides when
   * to ask, not whether to check.
   */
  useEffect(() => {
    if (!ready || !shortcut || disabled || autoTried.current) return;
    autoTried.current = true;
    askGoogle(true);
  }, [ready, shortcut, disabled, askGoogle]);

  if (failed) {
    return (
      <p className="text-xs opacity-60">
        Google sign-in isn&apos;t available right now.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {shortcut && hint && (
        <>
          <button
            type="button"
            onClick={() => askGoogle(false)}
            disabled={disabled || !ready || prompting}
            className="flex w-full items-center gap-3 rounded-full border border-[var(--cf-chip-border)] bg-[var(--cf-bg)] p-1.5 pr-3 text-left transition-transform active:scale-[0.98] disabled:opacity-50 motion-reduce:active:scale-100"
          >
            <HintAvatar hint={hint} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {prompting ? "Signing you in…" : `Continue as ${hint.name ?? hint.label}`}
              </span>
              <span className="block truncate text-[0.6875rem] opacity-55">{hint.label}</span>
            </span>
            {prompting ? (
              <Loader2 className="size-4 shrink-0 animate-spin opacity-60" />
            ) : (
              <ChevronRight className="size-4 shrink-0 opacity-40" />
            )}
          </button>
          <button
            type="button"
            onClick={onUseAnother}
            className="text-[0.6875rem] underline opacity-55 hover:opacity-100"
          >
            Use a different account
          </button>
        </>
      )}

      {/*
        Said only when the shortcut was pressed and came to nothing. The button
        that appears in its place is not the one they pressed, and without a
        line saying so the card looks like it swapped itself out for no reason.
      */}
      {fellBack && hint && (
        <p className="text-[0.6875rem] opacity-55">
          Pick your account to continue.
        </p>
      )}

      {!shortcut && (
        <div
          ref={host}
          // GSI renders its own button in an iframe, so pointer-events is the
          // only way to disable it while a verification is in flight.
          className={disabled ? "pointer-events-none opacity-50" : undefined}
        />
      )}
    </div>
  );
}

/** The remembered face, or the first letter of the remembered name. */
function HintAvatar({ hint }: { hint: RespondentHint }) {
  const [broken, setBroken] = useState(false);
  const initial = (hint.name ?? hint.label).trim().charAt(0).toUpperCase() || "?";

  if (hint.pictureUrl && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={hint.pictureUrl}
        alt=""
        // Google's profile URLs are served to anyone, and a picture in a
        // sign-in card is not worth handing Google the form's address for.
        referrerPolicy="no-referrer"
        // These URLs outlive nothing in particular; a broken image would leave
        // a torn box where a face should be.
        onError={() => setBroken(true)}
        className="size-8 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-full text-xs font-medium"
      style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)" }}
    >
      {initial}
    </span>
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
  initialPhone,
  onSubmit,
}: {
  pending: boolean;
  /**
   * The number this device verified with last time. Filled in rather than
   * merely suggested — it is already in E.164, so the one thing a respondent
   * most often gets wrong here is answered before they start, and editing it
   * is what a text field is for.
   */
  initialPhone?: string;
  onSubmit: (phone: string) => void;
}) {
  const [phone, setPhone] = useState(initialPhone ?? "");
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
export const RESEND_COOLDOWN_SECONDS = 30;

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

/**
 * The code step, shared.
 *
 * Exported because proving an *answer* — a `verify` email or phone question —
 * puts the respondent through exactly this screen. Two identical code boxes
 * that drifted apart would be worse than one with two callers.
 */
export function CodeForm({
  sentTo,
  sentAt,
  pending,
  devCode,
  onSubmit,
  onResend,
  onChangeNumber,
  changeLabel = "Use a different number",
}: {
  sentTo: string;
  sentAt: number | null;
  pending: boolean;
  devCode?: string;
  onSubmit: (code: string) => void;
  onResend: () => void;
  onChangeNumber: () => void;
  /** An emailed code is not a number; the way back has to say so. */
  changeLabel?: string;
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
          {changeLabel}
        </button>
        {devCode && <span className="font-mono opacity-40">dev code: {devCode}</span>}
      </div>
    </form>
  );
}

/**
 * Said when this deployment has no Firebase project configured.
 *
 * Firebase is the only way a number is proved here, so there is nothing to
 * fall back to and nothing for the respondent to do — the form's author is the
 * one who can fix it, and the console line is addressed to them.
 */
function PhoneUnavailable() {
  useEffect(() => {
    console.error(
      "[chatform] Phone verification is unavailable: NEXT_PUBLIC_FIREBASE_API_KEY, " +
        "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN and NEXT_PUBLIC_FIREBASE_PROJECT_ID must all be set.",
    );
  }, []);
  return <p className="text-xs opacity-60">Phone verification isn&apos;t available right now.</p>;
}

/**
 * Phone verification through Firebase.
 *
 * Everything up to the ID token happens in the browser, so the step and its
 * errors are local state — the server hears about this respondent exactly
 * once, at the end, when there is something proven to say.
 */
function FirebasePhoneFlow({
  auth,
  hint,
  onPhoneToken,
}: {
  auth: AuthState;
  hint: RespondentHint | null;
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
        <NumberForm pending={pending} initialPhone={hint?.label} onSubmit={send} />
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
