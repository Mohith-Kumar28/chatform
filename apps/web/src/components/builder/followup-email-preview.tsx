"use client";

/**
 * What the reminder actually looks like in an inbox.
 *
 * A subject line and a body box tell an author what they typed, not what gets
 * sent — and most of this message is not typed at all: the progress line, the
 * button, the unsubscribe and the postal address are all assembled server-side.
 * Without seeing it, the obvious mistake is writing a body that repeats the
 * progress line, or a call to action that competes with the button.
 *
 * The colours are the ones `mail-templates.ts` renders with, and the preview is
 * light regardless of the app's theme, because email clients are.
 *
 * This is a second rendering of the same message, so it can drift from the
 * real one. It is deliberately shallow — one layout, no branching beyond the
 * progress line — and anything structural belongs in the template first.
 */

const INK = "#3b3530";
const MUTED = "#7b736c";
const BORDER = "#e8e3da";
const GROUND = "#faf8f4";
const CARD = "#ffffff";
const ORANGE = "#fd6f29";
const VIOLET = "#9d6ee4";
const ON_PRIMARY = "#201a16";

/** Mirrors `estimateMinutes` in the template: fifteen seconds a question, rounded hard. */
function estimateMinutes(remaining: number): string {
  const mins = Math.max(1, Math.round((remaining * 15) / 60));
  return mins === 1 ? "a minute" : `${mins} minutes`;
}

/**
 * `{{form.title}}` and `{{remaining}}` resolved against the sample numbers
 * below, so the preview reads as a sentence rather than as a template.
 */
function fill(text: string, formTitle: string, remaining: number): string {
  return text
    .replace(/\{\{\s*form\.title\s*\}\}/g, formTitle)
    .replace(/\{\{\s*remaining\s*\}\}/g, String(remaining))
    .replace(/\{\{\s*[\w.]+\s*\}\}/g, "…");
}

export function FollowUpEmailPreview({
  subject,
  body,
  formTitle,
  showProgress,
  postalAddress,
}: {
  subject: string;
  body: string;
  formTitle: string;
  showProgress: boolean;
  /** Absent until the organization has one; the real footer always carries it. */
  postalAddress?: string | null;
}) {
  // A stand-in conversation, so the numbers in the copy have something to mean.
  const answered = 3;
  const total = 7;
  const remaining = total - answered;

  return (
    <div className="overflow-hidden rounded-lg border" style={{ borderColor: BORDER, background: GROUND }}>
      <div className="p-3">
        <div
          className="overflow-hidden rounded-lg border"
          style={{ borderColor: BORDER, background: CARD }}
        >
          {/* The brand rule the template puts across the top of every message. */}
          <div style={{ height: 3, backgroundImage: `linear-gradient(100deg, ${ORANGE}, ${VIOLET})` }} />
          <div className="space-y-2.5 p-4">
            <p className="text-[13px] font-semibold" style={{ color: INK }}>
              {fill(subject, formTitle, remaining) || "Subject"}
            </p>

            {showProgress ? (
              <p className="text-[12px] leading-relaxed" style={{ color: INK }}>
                You answered{" "}
                <strong>
                  {answered} of {total}
                </strong>{" "}
                questions in <strong>{formTitle}</strong>, {remaining} to go, about{" "}
                {estimateMinutes(remaining)}.
              </p>
            ) : (
              <p className="text-[12px] leading-relaxed" style={{ color: INK }}>
                You started <strong>{formTitle}</strong> and did not finish. Your answers are
                still there.
              </p>
            )}

            {body.trim() && (
              <p className="text-[12px] leading-relaxed" style={{ color: INK }}>
                {fill(body, formTitle, remaining)}
              </p>
            )}

            <div className="pt-1">
              <span
                className="inline-block rounded-full px-4 py-1.5 text-[12px] font-semibold"
                style={{ background: ORANGE, color: ON_PRIMARY }}
              >
                Pick up where you left off
              </span>
            </div>

            <p className="pt-1 text-[10px] leading-relaxed" style={{ color: MUTED }}>
              You are receiving this because you started filling in {formTitle}.
              <br />
              <span style={{ textDecoration: "underline" }}>Unsubscribe</span>
              {postalAddress?.trim() ? (
                <>
                  <br />
                  {postalAddress}
                </>
              ) : null}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
