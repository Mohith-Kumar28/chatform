"use client";

import { MailCheck, MessageSquareText } from "lucide-react";
import { CodeForm } from "./auth-card";
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
 * The number or address is repeated in the header because it is the last place
 * a typo can be caught. "Change" is next to it for the same reason: a code step
 * with no way back is a dead end, and the one thing somebody in it is likely to
 * need is to fix what they typed.
 */
export function VerifyCard({
  verify,
  hint,
  onSubmit,
  onResend,
  onChange,
}: {
  verify: VerifyState;
  /** The refusal from the last attempt — a wrong code, an expired one. */
  hint: string | null;
  onSubmit: (code: string) => void;
  onResend: () => void;
  onChange: () => void;
}) {
  const Icon = verify.channel === "sms" ? MessageSquareText : MailCheck;

  return (
    <div className="animate-message-in space-y-3 rounded-2xl bg-[var(--cf-chip-bg)] p-4">
      <p className="flex items-center gap-2 text-xs font-medium opacity-60">
        <Icon className="size-3.5" />
        {verify.channel === "sms" ? "Confirm your number" : "Confirm your email"}
      </p>

      <CodeForm
        sentTo={verify.sentTo}
        sentAt={verify.sentAt}
        pending={verify.pending}
        devCode={verify.devCode}
        onSubmit={onSubmit}
        onResend={onResend}
        onChangeNumber={onChange}
        changeLabel={verify.channel === "sms" ? "Use a different number" : "Use a different address"}
      />

      {hint && (
        <p role="alert" className="text-destructive text-xs">
          {hint}
        </p>
      )}
    </div>
  );
}
