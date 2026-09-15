"use client";

import { useMemo } from "react";
import { KeyRound, ShieldCheck, TriangleAlert } from "lucide-react";
import { chatThemeVars } from "@/lib/chat-theme";
import { Bubble, ChatHeader } from "./chat-client";
import type { ChatSnapshot } from "./chat-snapshot";

/**
 * A respondent's screen at the moment they reported a bug, drawn again.
 *
 * Read-only and fed by a snapshot rather than a session, but made of the same
 * parts as the page: `ChatHeader`, `Bubble` and `chatThemeVars` are the
 * runtime's own, imported rather than copied. A replay built from lookalike
 * components would show the founders a screen that never existed, which is worse
 * than no replay — it would be believed.
 *
 * What it does not do is re-run the interactive card under the thread (the chips,
 * the date picker, the upload tray). Those need a live session behind them. The
 * replay names what was waiting instead — the question, its type, any gate — so
 * "the picker would not open" can be matched to the question it was on.
 *
 * Message text goes through `Bubble`, which renders assistant markdown with
 * `trusted={false}`. That must not be widened here: this is a customer's form and
 * a stranger's typing, displayed inside our own console.
 */
export function ChatReplay({ snapshot, height = 560 }: { snapshot: ChatSnapshot; height?: number }) {
  const { config } = snapshot;
  const themeVars = useMemo(() => chatThemeVars(config.theme, config.slug), [config.theme, config.slug]);
  const progress = snapshot.question?.progress;
  const pct = snapshot.ending || snapshot.submitted || snapshot.review ? 100 : (progress?.pct ?? 0);

  return (
    <div className="space-y-2">
      <div
        className="chat-surface flex flex-col overflow-hidden rounded-xl border"
        style={{ ...themeVars, height }}
        aria-label="The respondent's screen when they reported this"
      >
        <ChatHeader
          title={config.agentName || config.title}
          brandName={config.theme.brandName}
          logoUrl={config.theme.logoUrl}
          pct={pct}
          mode={config.progressBar}
          answered={progress?.answered ?? 0}
          total={progress?.totalEstimate ?? 0}
          status={snapshot.status}
        />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-5">
            {snapshot.messages.length === 0 && (
              <p className="py-10 text-center text-sm opacity-50">Nothing had been said yet.</p>
            )}
            {snapshot.messages.map((m) => (
              <Bubble key={m.id} message={m} canEdit={false} onEdit={noop} />
            ))}

            {snapshot.thinking && <p className="pl-1 text-xs opacity-50">The agent was still typing…</p>}

            <OnScreen snapshot={snapshot} />
          </div>
        </div>

        {(snapshot.error || snapshot.validationHint) && (
          <div className="mx-auto w-full max-w-2xl px-4 pb-2">
            <p
              className="flex items-center gap-2 rounded-xl border border-current/20 px-3 py-2 text-sm"
              style={{ color: "var(--cf-warning)" }}
            >
              <TriangleAlert className="size-4 shrink-0" />
              {snapshot.error ?? snapshot.validationHint}
            </p>
          </div>
        )}

        {/* The composer as a shape, not a control: nothing here can be typed into. */}
        <div className="mx-auto w-full max-w-2xl px-4 pt-1 pb-4">
          <div
            className="flex h-11 items-center rounded-full border px-4 text-sm opacity-50"
            style={{ background: "var(--cf-composer-bg)", borderColor: "var(--cf-chip-border)" }}
          >
            {snapshot.question ? "Type your answer…" : "—"}
          </div>
        </div>
      </div>

      <p className="text-muted-foreground text-caption">
        Captured {new Date(snapshot.capturedAt).toLocaleString()}
        {snapshot.viewport.width > 0 && ` · ${snapshot.viewport.width}×${snapshot.viewport.height} viewport`}
        {snapshot.timezone && ` · ${snapshot.timezone}`}
        {` · connection ${snapshot.status}`}
      </p>
    </div>
  );
}

const noop = () => {};

/**
 * Whatever card was waiting under the thread, said in words.
 *
 * Only one of these is ever up at a time on the real page, in this precedence,
 * so the replay picks the same one.
 */
function OnScreen({ snapshot }: { snapshot: ChatSnapshot }) {
  const card = "rounded-2xl border px-4 py-3 text-sm";
  const cardStyle = { background: "var(--cf-chip-bg)", borderColor: "var(--cf-chip-border)" };

  if (snapshot.ending) {
    return (
      <div className={card} style={cardStyle}>
        <p className="text-xs font-semibold tracking-wide uppercase opacity-55">
          Ending shown · {snapshot.ending.kind === "screen_out" ? "screened out" : "success"}
        </p>
        <p className="mt-1 font-medium">{snapshot.ending.title}</p>
      </div>
    );
  }
  if (snapshot.review) {
    return (
      <div className={card} style={cardStyle}>
        <p className="text-xs font-semibold tracking-wide uppercase opacity-55">Review before submitting</p>
        <ul className="mt-2 space-y-1">
          {snapshot.review.answers.map((a) => (
            <li key={a.ref} className="flex gap-2">
              <span className="min-w-0 flex-1 truncate opacity-60">{a.title}</span>
              <span className="min-w-0 flex-1 truncate">{a.display}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (snapshot.auth) {
    return (
      <div className={card} style={cardStyle}>
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase opacity-55">
          <KeyRound className="size-3.5" /> Sign-in gate · {snapshot.auth.method}
        </p>
        <p className="mt-1">{snapshot.auth.message}</p>
        {snapshot.auth.error && (
          <p className="mt-1" style={{ color: "var(--cf-warning)" }}>
            {snapshot.auth.error}
          </p>
        )}
      </div>
    );
  }
  if (snapshot.verify) {
    return (
      <div className={card} style={cardStyle}>
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase opacity-55">
          <ShieldCheck className="size-3.5" /> Waiting for a code · {snapshot.verify.channel}
        </p>
        {snapshot.verify.sentTo && <p className="mt-1">Sent to {snapshot.verify.sentTo}</p>}
      </div>
    );
  }
  if (snapshot.question) {
    const { block, progress } = snapshot.question;
    return (
      <div className={card} style={cardStyle}>
        <p className="text-xs font-semibold tracking-wide uppercase opacity-55">
          Waiting on · {block.type.replace(/_/g, " ")}
          {block.required ? " · required" : ""}
          {progress.totalEstimate > 0 && ` · question ${progress.answered + 1} of ~${progress.totalEstimate}`}
        </p>
        <p className="mt-1 font-medium">{block.title}</p>
      </div>
    );
  }
  if (snapshot.submitted) {
    return (
      <div className={card} style={cardStyle}>
        <p className="text-xs font-semibold tracking-wide uppercase opacity-55">Already submitted</p>
      </div>
    );
  }
  return null;
}
