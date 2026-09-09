"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MailCheck, MessageSquareText } from "lucide-react";
import { CodeForm } from "./auth-card";
import { firebasePhoneConfigured, sendPhoneCode, type PhoneCodeSent } from "./firebase-phone";
import type { VerifyState } from "./use-chat";

/**
 * Confirming the answer they just gave, in the thread under it.
 *
 * Deliberately smaller than `AuthCard`. The sign-in gate is a door in front of
 * the whole conversation; this is one question pausing for a moment, so it
 * keeps the transcript, the progress bar and everything already answered right
 * where they were — and reuses that card's code box rather than growing a
 * second one that would drift.
 *
 * The two channels are proved in completely different places, which is why
 * this is two components rather than one with a flag:
 *
 *   - a number goes through Firebase, exactly as phone sign-in does. Firebase
 *     sends the SMS and checks the code in this browser, and the server only
 *     ever sees the ID token that comes out. There is no SMS provider of ours
 *     anywhere in the product.
 *   - an address gets a code we sent ourselves, and typing it back is an
 *     ordinary message — the session is already reading messages as the code.
 *
 * The number or address is repeated in the header because it is the last place
 * a typo can be caught. "Change" is next to it for the same reason: a
 * verification step with no way back is a dead end, and the one thing somebody
 * stuck in it is likely to need is to fix what they typed.
 */
export function VerifyCard({
  verify,
  hint,
  onSubmitCode,
  onPhoneToken,
  onResend,
  onChange,
}: {
  verify: VerifyState;
  /** The refusal from the last attempt — a wrong code, an expired one. */
  hint: string | null;
  onSubmitCode: (code: string) => void;
  onPhoneToken: (idToken: string) => void;
  onResend: () => void;
  onChange: () => void;
}) {
  const sms = verify.channel === "sms";
  const Icon = sms ? MessageSquareText : MailCheck;

  return (
    <div className="animate-message-in space-y-3 rounded-2xl bg-[var(--cf-chip-bg)] p-4">
      <p className="flex items-center gap-2 text-xs font-medium opacity-60">
        <Icon className="size-3.5" />
        {sms ? "Confirm your number" : "Confirm your email"}
      </p>

      {sms ? (
        <PhoneProof verify={verify} onPhoneToken={onPhoneToken} onChange={onChange} />
      ) : (
        <CodeForm
          sentTo={verify.sentTo}
          sentAt={verify.sentAt}
          pending={verify.pending}
          devCode={verify.devCode}
          onSubmit={onSubmitCode}
          onResend={onResend}
          onChangeNumber={onChange}
          changeLabel="Use a different address"
        />
      )}

      {hint && (
        <p role="alert" className="text-destructive text-xs">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * The number, proved by Firebase.
 *
 * The same module the sign-in card uses, with the one difference that matters:
 * there is no number to ask for. They already answered with it, so the first
 * step is a single button that sends to *that* number and nothing else — which
 * is also what keeps the token honest, since the server refuses a token for
 * any other number.
 *
 * The send is on a tap rather than automatic. reCAPTCHA escalates to a visible
 * challenge whenever Google is unsure about a visitor, and a challenge that
 * appears without anybody asking for it reads as a hijacked page.
 */
function PhoneProof({
  verify,
  onPhoneToken,
  onChange,
}: {
  verify: VerifyState;
  onPhoneToken: (idToken: string) => void;
  onChange: () => void;
}) {
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Held in a ref, not state: replacing it must never re-render mid-flow, and
  // it is read only inside callbacks.
  const confirmation = useRef<PhoneCodeSent | null>(null);
  // reCAPTCHA needs a real, mounted element to attach to — and to expand into
  // if Google decides this visitor has to solve a challenge.
  const recaptchaHost = useRef<HTMLDivElement>(null);

  const pending = busy || verify.pending;

  const send = useCallback(async () => {
    const host = recaptchaHost.current;
    if (!host) return;
    setBusy(true);
    setError(null);
    const res = await sendPhoneCode(verify.sentTo, host);
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    confirmation.current = res.sent;
    setSentAt(Date.now());
  }, [verify.sentTo]);

  const confirm = useCallback(
    async (code: string) => {
      const outstanding = confirmation.current;
      if (!outstanding) return;
      setBusy(true);
      setError(null);
      const res = await outstanding.confirm(code);
      setBusy(false);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      // From here the server owns the outcome, and the card's `hint` reports it.
      onPhoneToken(res.idToken);
    },
    [onPhoneToken],
  );

  if (!firebasePhoneConfigured) return <PhoneUnavailable />;

  return (
    <div className="space-y-2">
      {sentAt === null ? (
        <button
          type="button"
          onClick={() => void send()}
          disabled={pending}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-medium transition-transform active:scale-[0.98] disabled:opacity-50 motion-reduce:active:scale-100"
          style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)" }}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : `Send code to ${verify.sentTo}`}
        </button>
      ) : (
        <CodeForm
          sentTo={verify.sentTo}
          sentAt={sentAt}
          pending={pending}
          onSubmit={confirm}
          // A fresh send mints a fresh reCAPTCHA and a fresh confirmation, so
          // the code from the earlier SMS stops working the moment a new one
          // goes out. That is Firebase's rule, not ours.
          onResend={() => void send()}
          onChangeNumber={onChange}
        />
      )}

      {sentAt === null && (
        <button
          type="button"
          onClick={onChange}
          className="text-[0.6875rem] underline opacity-55 hover:opacity-100"
        >
          Use a different number
        </button>
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
 * Firebase is the only way a number is proved, so a deployment without it has
 * nothing to offer here. The console line is addressed to whoever can fix it,
 * which is never the respondent.
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

/** The attribution Google's terms require in exchange for hiding the badge. */
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
