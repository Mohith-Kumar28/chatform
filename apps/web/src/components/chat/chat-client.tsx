"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ArrowDown,
  CheckCheck,
  MoreHorizontal,
  PartyPopper,
  Pencil,
  RotateCcw,
  SkipForward,
  TriangleAlert,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PublicBlock, PublicFormConfig } from "@repo/form-schema";
import { chatThemeVars } from "@/lib/chat-theme";
import { AuthCard } from "./auth-card";
import { useChat, type ChatMessage } from "./use-chat";
import { FileUploadControl } from "./file-upload";
import { SendRow, TextInput } from "./composers/primitives";
import { QuestionAffordance } from "./question-affordance";
import { Confetti } from "./confetti";
import { cn } from "@/lib/utils";
import { API_ORIGIN } from "@/lib/api/mutator";


export function ChatClient({
  config,
  hiddenFields,
  existingSession,
  previewMode,
}: {
  config: PublicFormConfig;
  hiddenFields?: Record<string, string>;
  existingSession?: { sessionId: string; token: string; eventsUrl: string } | null;
  previewMode?: boolean;
}) {
  const chat = useChat({
    slug: config.slug,
    apiOrigin: API_ORIGIN,
    hiddenFields,
    existingSession,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  // Auto-scroll. There was none at all before, so any conversation longer than
  // the viewport required manual scrolling after every single turn. We stop
  // following as soon as the respondent scrolls up, and offer a way back.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      setPinned(distance < 80);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!pinned) return;
    const el = scrollRef.current;
    if (!el) return;
    // Drive the container directly. scrollIntoView targeted the window and put
    // the anchor behind the sticky composer.
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chat.messages, chat.thinking, chat.question, chat.ending, chat.auth, chat.review, pinned]);

  // Honour the ending's redirect, which was parsed and then ignored.
  useEffect(() => {
    const target = chat.ending?.redirectUrl;
    if (!target || previewMode) return;
    const delay = (chat.ending?.redirectDelaySec ?? 5) * 1000;
    const t = setTimeout(() => window.location.assign(target), delay);
    return () => clearTimeout(t);
  }, [chat.ending, previewMode]);

  const themeVars = useMemo(() => chatThemeVars(config.theme), [config.theme]);

  if (chat.submitted) {
    return (
      <div
        className={cn(
          "chat-surface flex items-center justify-center",
          previewMode ? "h-full min-h-0" : "h-svh",
        )}
        style={themeVars}
      >
        <AlreadySubmittedCard
          submitted={chat.submitted}
          theme={config.theme}
          title={config.agentName || config.title}
          // A form that fingerprints respondents is not expecting a second answer.
          allowRepeat={config.duplicates === "none"}
          onResubmit={() => void chat.startOver()}
        />
      </div>
    );
  }
  // The builder can name the interviewer; fall back to the form title.
  const agentName = config.agentName || config.title;
  // Review and the ending both mean every question is answered; without this
  // the bar dropped to zero at the last step because there is no current
  // question to read progress from.
  const pct = chat.review || chat.ending ? 100 : (chat.question?.progress.pct ?? 0);

  return (
    <div
      // h-svh, not min-h-svh: with a minimum the container grew past the
      // viewport and the WINDOW scrolled, so the inner div never scrolled and
      // auto-scroll silently did nothing.
      className={cn("chat-surface flex flex-col", previewMode ? "h-full min-h-0" : "h-svh")}
      style={themeVars}
    >
      <ChatHeader
        title={agentName}
        brandName={config.theme.brandName}
        logoUrl={config.theme.logoUrl}
        pct={pct}
        mode={config.progressBar}
        answered={chat.question?.progress.answered ?? 0}
        total={chat.question?.progress.totalEstimate ?? 0}
        status={chat.status}
        // Always offered once anything has been said, rather than only in a
        // "welcome back" banner that appeared once and then vanished.
        onStartOver={chat.messages.length > 0 && !chat.ending ? () => void chat.startOver() : undefined}
      />

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-3 px-4 py-6">
          {/* Screen readers announce new agent messages without stealing focus. */}
          <div className="sr-only" aria-live="polite" aria-atomic="false">
            {chat.messages.filter((m) => m.role === "assistant" && !m.streaming).at(-1)?.text}
          </div>

          {chat.messages.map((m) => (
            <Bubble
              key={m.id}
              message={m}
              // A user message can be edited when we know which question it
              // answered and the form is still open.
              onEdit={
                m.role === "user" && !m.optimistic && m.answeredRef && !chat.ending
                  ? () => void chat.editAnswer(m.answeredRef!)
                  : undefined
              }
            />
          ))}

          {chat.thinking && <TypingDots />}

          {/* The current question's controls live here, under the agent's
              message — not in place of the composer. */}
          {!chat.ending && chat.question && (
            <div className="animate-message-in pt-0.5 pl-1">
              <QuestionAffordance
                block={chat.question.block}
                disabled={chat.status === "error"}
                uploadBase={chat.getUploadBase()}
                respondentToken={chat.getRespondentToken()}
                onStructured={(value, display) =>
                  void chat.sendStructured(chat.question!.block.ref, value, display)
                }
                onSkip={() => void chat.sendAction("skip")}
              />
            </div>
          )}

          {/* Sign-in sits in the thread, under the agent's message asking for
              it — not as an interstitial the respondent has to get past. */}
          {chat.auth && (
            <AuthCard
              auth={chat.auth}
              onGoogle={(t) => void chat.signInWithGoogle(t)}
              onRequestCode={(phone, hint) => void chat.requestPhoneCode(phone, hint)}
              onVerifyCode={(code) => void chat.verifyPhoneCode(code)}
              onChangeNumber={chat.changePhoneNumber}
            />
          )}

          {chat.review && (
            <ReviewCard
              review={chat.review}
              onEdit={(ref) => void chat.editAnswer(ref)}
              onSubmit={() => void chat.sendAction("submit")}
              busy={chat.thinking}
            />
          )}

          {chat.ending && <EndingCard ending={chat.ending} theme={config.theme} />}

          <div ref={bottomRef} />
        </div>

        {!pinned && (
          <button
            type="button"
            onClick={() => {
              setPinned(true);
              scrollRef.current?.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: "smooth",
              });
            }}
            className="sticky bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-[var(--cf-chip-border)] bg-[var(--cf-chip-bg)] px-3 py-1.5 text-xs shadow-md"
          >
            <ArrowDown className="size-3" />
            Jump to latest
          </button>
        )}
      </div>

      {chat.error && (
        <div className="mx-auto w-full max-w-2xl px-4 pb-2">
          <div className="text-destructive flex items-center gap-2 rounded-xl border border-current/20 px-3 py-2 text-sm">
            <TriangleAlert className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">{chat.error}</span>
            {/* Reconnects the stream rather than reloading the whole page. */}
            <button type="button" onClick={chat.retry} className="shrink-0 font-medium underline">
              Retry
            </button>
          </div>
        </div>
      )}

      {chat.rateLimited && (
        <div className="mx-auto w-full max-w-2xl px-4 pb-2">
          <p className="rounded-xl bg-[var(--cf-chip-bg)] px-3 py-2 text-sm opacity-70">
            {chat.rateLimited}
          </p>
        </div>
      )}

      {!chat.ending && !chat.review && !chat.auth && (
        <footer className="sticky bottom-0 bg-[var(--cf-bg)]/95 backdrop-blur">
          <div className="mx-auto w-full max-w-2xl px-4 py-3">
            <Composer chat={chat} config={config} />
          </div>
          {!config.brandingHidden && (
            <p className="pb-2 text-center text-[0.6875rem] opacity-40">
              Powered by{" "}
              <a href="https://chatform.dev" target="_blank" rel="noreferrer" className="underline">
                chatform
              </a>
            </p>
          )}
        </footer>
      )}
    </div>
  );
}

function ChatHeader({
  title,
  brandName,
  logoUrl,
  pct,
  mode,
  answered,
  total,
  status,
  onStartOver,
}: {
  title: string;
  brandName?: string;
  logoUrl?: string | null;
  pct: number;
  mode: PublicFormConfig["progressBar"];
  answered: number;
  total: number;
  status: string;
  onStartOver?: () => void;
}) {
  return (
    <header className="sticky top-0 z-10 bg-[var(--cf-bg)]/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
        {/* The brand logo takes the avatar slot when there is one; otherwise
            the form's initial, so an unbranded form still looks deliberate. */}
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={brandName ?? title}
            className="size-8 shrink-0 rounded-xl object-contain"
          />
        ) : (
          <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-[var(--cf-accent)] text-sm font-semibold text-[var(--cf-accent-text)]">
            {title.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {title}
            {brandName && <span className="ml-1.5 font-normal opacity-50">· {brandName}</span>}
          </p>
          {status === "reconnecting" ? (
            <p className="text-xs opacity-60">Reconnecting…</p>
          ) : (
            mode !== "none" && (
              <p className="text-xs opacity-60">
                {mode === "steps" && total > 0 ? `Question ${answered + 1} of ${total}` : `${pct}% complete`}
              </p>
            )
          )}
        </div>

        {onStartOver && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Form options"
              className="shrink-0 rounded-full p-1.5 opacity-50 transition-opacity hover:opacity-100"
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onSelect={onStartOver}>
                <RotateCcw className="size-3.5" />
                Start over
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* An actual bar. `progressBar` supported percent/steps/none and only the
          percent *text* was implemented — no bar existed anywhere. */}
      {mode !== "none" && (
        <div className="h-0.5 bg-[var(--cf-chip-border)]/40">
          <div
            className="h-full bg-[var(--cf-accent)] transition-[width] duration-[var(--duration-standard)] ease-[var(--ease-out)]"
            style={{ width: `${Math.max(2, pct)}%` }}
          />
        </div>
      )}
    </header>
  );
}

function Bubble({ message, onEdit }: { message: ChatMessage; onEdit?: () => void }) {
  // A note about the conversation, not a turn in it: quiet, unbubbled, and
  // left in place in the thread.
  if (message.role === "system") {
    return (
      <p className="animate-message-in flex items-center gap-1.5 pl-1 text-[0.6875rem] opacity-45">
        <Check className="size-3" />
        {message.text}
      </p>
    );
  }

  const isUser = message.role === "user";
  return (
    <div className={cn("group flex animate-message-in items-center gap-1.5", isUser ? "justify-end" : "justify-start")}>
      {/* Change-your-mind affordance, revealed on hover so it never competes
          with the conversation itself. */}
      {isUser && onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label="Change this answer"
          title="Change this answer"
          className="order-first shrink-0 rounded-full p-1.5 opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100 focus-visible:opacity-100"
        >
          <Pencil className="size-3.5" />
        </button>
      )}
      <div
        className={cn(
          "max-w-[85%] px-4 py-2.5 text-[0.9375rem] leading-relaxed",
          isUser ? "bubble-user" : "bubble-bot border",
          message.optimistic && "opacity-70",
        )}
        style={
          isUser
            ? { background: "var(--cf-user-bubble)", color: "var(--cf-user-bubble-text)", borderColor: "transparent" }
            : {
                background: "var(--cf-bot-bubble)",
                color: "var(--cf-bot-bubble-text)",
                borderColor: "var(--cf-bot-bubble-border)",
              }
        }
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.text}</p>
        ) : (
          <div className="chat-prose">
            <Markdown remarkPlugins={[remarkGfm]} allowedElements={SAFE_ELEMENTS} unwrapDisallowed>
              {message.text}
            </Markdown>
            {message.streaming && <span className="animate-caret ml-0.5 inline-block">▍</span>}
          </div>
        )}
      </div>
    </div>
  );
}

/** Markdown from a model is untrusted input: no raw HTML, no images, no scripts. */
const SAFE_ELEMENTS = [
  "p", "br", "strong", "em", "del", "code", "pre", "blockquote",
  "ul", "ol", "li", "a", "h1", "h2", "h3", "h4", "hr",
  "table", "thead", "tbody", "tr", "th", "td",
];

function TypingDots() {
  return (
    <div className="flex justify-start">
      <div
        className="bubble-bot flex items-center gap-1 border px-4 py-3"
        style={{ background: "var(--cf-bot-bubble)", borderColor: "var(--cf-bot-bubble-border)" }}
        aria-label="Typing"
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 rounded-full bg-current opacity-40"
            style={{ animation: "cf-typing-dot 900ms ease-in-out infinite", animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * What a respondent sees on returning to a form they already completed.
 *
 * Silently starting a blank conversation made it look like the first response
 * had been lost. This says plainly that it landed, shows what was sent, and
 * only offers a repeat when the form actually accepts one.
 */
function AlreadySubmittedCard({
  submitted,
  theme,
  title,
  allowRepeat,
  onResubmit,
}: {
  submitted: NonNullable<ReturnType<typeof useChat>["submitted"]>;
  theme: PublicFormConfig["theme"];
  title: string;
  allowRepeat: boolean;
  onResubmit: () => void;
}) {
  const [showAnswers, setShowAnswers] = useState(false);

  return (
    <div className="animate-message-in w-full max-w-md px-6 py-10 text-center">
      {theme.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={theme.logoUrl} alt="" className="mx-auto mb-5 h-10 object-contain" />
      ) : (
        <div
          className="mx-auto mb-5 grid size-14 place-items-center rounded-full"
          style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)" }}
        >
          <CheckCheck className="size-7" strokeWidth={1.75} />
        </div>
      )}

      <h2 className="text-xl font-semibold" style={{ fontFamily: "var(--cf-font-heading)" }}>
        You&apos;ve already answered this
      </h2>
      <p className="mt-1 text-sm opacity-60">
        {title} · {relativeDay(submitted.at)}
      </p>

      {showAnswers && submitted.answers.length > 0 && (
        <ul className="mt-5 space-y-2 rounded-2xl bg-[var(--cf-chip-bg)] p-4 text-left text-sm">
          {submitted.answers.map((a) => (
            <li key={a.ref}>
              <span className="block text-xs opacity-55">{a.title}</span>
              <span className="block break-words">{a.display || "—"}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex flex-col items-center gap-2">
        {submitted.answers.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAnswers((v) => !v)}
            className="text-sm underline opacity-60 transition-opacity hover:opacity-100"
          >
            {showAnswers ? "Hide my answers" : "View my answers"}
          </button>
        )}

        {allowRepeat && (
          <button
            type="button"
            onClick={onResubmit}
            className="h-11 w-full rounded-full text-sm font-medium transition-transform active:scale-[0.98] motion-reduce:active:scale-100"
            style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)" }}
          >
            Resubmit
          </button>
        )}
      </div>
    </div>
  );
}

function relativeDay(ts: number): string {
  if (!ts) return "earlier";
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * The review step: everything answered, nothing submitted yet.
 *
 * Answers have been saved all along, so this is not about durability — it is
 * the moment a respondent sees the whole of what they said, can fix one line,
 * and finishes deliberately instead of the form ending out from under them.
 * It is also the natural home for "re-answer question 3", which is awkward to
 * hunt for by scrolling the transcript.
 */
function ReviewCard({
  review,
  onEdit,
  onSubmit,
  busy,
}: {
  review: NonNullable<ReturnType<typeof useChat>["review"]>;
  onEdit: (ref: string) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  return (
    <div className="animate-message-in space-y-3 rounded-2xl bg-[var(--cf-chip-bg)] p-4">
      <p className="text-sm font-medium">That&apos;s everything — have a look before you send it.</p>

      <ul className="space-y-1.5">
        {review.answers.map((a) => (
          <li key={a.ref} className="group flex items-start gap-2 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block text-xs opacity-55">{a.title}</span>
              <span className="block break-words">{a.display || "—"}</span>
            </span>
            <button
              type="button"
              onClick={() => onEdit(a.ref)}
              aria-label={`Change your answer to ${a.title}`}
              className="mt-3.5 shrink-0 rounded-full p-1 opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100 focus-visible:opacity-100"
            >
              <Pencil className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={busy}
        onClick={onSubmit}
        className="h-11 w-full rounded-full text-sm font-medium transition-transform active:scale-[0.98] motion-reduce:active:scale-100 disabled:opacity-60"
        style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)" }}
      >
        {busy ? "Submitting…" : "Submit form"}
      </button>
    </div>
  );
}

/**
 * The completion screen.
 *
 * Finishing a form is the one moment the respondent has actually given you
 * something, and it used to be a small grey card. Now it lands: a burst of
 * confetti in the form's own colours, a big thank-you, and the CTA if there is
 * one. Confetti is skipped under reduced-motion.
 */
function EndingCard({
  ending,
  theme,
}: {
  ending: NonNullable<ReturnType<typeof useChat>["ending"]>;
  theme: PublicFormConfig["theme"];
}) {
  return (
    <>
      <Confetti colors={[theme.accent, theme.userBubble, "#ffffff", theme.text]} />

      <div className="animate-message-in flex flex-col items-center px-6 py-10 text-center">
        {theme.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={theme.logoUrl} alt={theme.brandName ?? ""} className="mb-5 h-12 object-contain" />
        ) : (
          <div
            className="mb-5 grid size-16 place-items-center rounded-full"
            style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)" }}
          >
            <PartyPopper className="size-8" strokeWidth={1.75} />
          </div>
        )}

        <h2
          className="text-2xl font-semibold text-balance sm:text-3xl"
          style={{ fontFamily: "var(--cf-font-heading)" }}
        >
          {ending.title}
        </h2>

        {ending.bodyMd && (
          <div className="chat-prose mt-2 max-w-sm text-[0.9375rem] opacity-75">
            <Markdown remarkPlugins={[remarkGfm]} allowedElements={SAFE_ELEMENTS} unwrapDisallowed>
              {ending.bodyMd}
            </Markdown>
          </div>
        )}

        {ending.ctaLabel && ending.ctaUrl && (
          <a
            href={ending.ctaUrl}
            className="mt-6 inline-flex h-11 items-center rounded-full px-6 text-sm font-medium transition-transform active:scale-[0.98] motion-reduce:active:scale-100"
            style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)" }}
          >
            {ending.ctaLabel}
          </a>
        )}

        {ending.redirectUrl && (
          <p className="mt-4 text-xs opacity-50">
            Taking you to the next step in {ending.redirectDelaySec ?? 5}s…
          </p>
        )}
      </div>
    </>
  );
}

/**
 * The composer is now only ever a text box.
 *
 * Whatever the current question is, the respondent can type — "weekly I guess",
 * "4 stars", "next Friday". The agent reads it. Widgets still exist, but they
 * sit in the thread as an offer (see `QuestionAffordance`), not as a
 * replacement for the ability to speak.
 */
function Composer({ chat, config }: { chat: ReturnType<typeof useChat>; config: PublicFormConfig }) {
  const [text, setText] = useState("");
  const block = chat.question?.block;

  useEffect(() => {
    setText("");
  }, [block?.ref]);

  // Number keys still pick an option, for anyone who prefers the keyboard.
  useEffect(() => {
    const options = block?.options;
    const ref = block?.ref;
    if (!options || !ref || block?.type === "multi_select") return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1) return;
      const opt = options![n - 1];
      if (opt) void chat.sendStructured(ref!, opt.id, opt.label);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [block, chat]);

  if (!block) {
    return (
      <p className="text-center text-sm opacity-50">
        {chat.status === "connecting" ? "Connecting…" : " "}
      </p>
    );
  }

  const disabled = chat.status === "error";
  const canSkip = config.allowSkip && !block.required;

  function submit() {
    const value = text.trim();
    if (!value) return;
    setText("");
    void chat.send(value);
  }

  return (
    <div className="space-y-2">
      {chat.validationHint && <p className="px-1 text-sm opacity-70">{chat.validationHint}</p>}

      <SendRow onSend={submit} disabled={disabled || !text.trim()}>
        <TextInput
          value={text}
          onChange={setText}
          onSubmit={submit}
          autoFocus
          multiline={block.type === "long_text"}
          placeholder={block.placeholder || placeholderFor(block.type)}
          type={block.type === "email" ? "email" : "text"}
          inputMode={
            block.type === "email"
              ? "email"
              : block.type === "phone"
                ? "tel"
                : block.type === "url"
                  ? "url"
                  : block.type === "number"
                    ? "decimal"
                    : "text"
          }
        />
      </SendRow>

      {canSkip && (
        <button
          type="button"
          onClick={() => void chat.sendAction("skip")}
          className="flex items-center gap-1 px-1 text-xs opacity-50 transition-opacity hover:opacity-100"
        >
          <SkipForward className="size-3" />
          Skip this one
        </button>
      )}
    </div>
  );
}

/** Nudges people that typing is allowed even when chips are on offer. */
function placeholderFor(type: PublicBlock["type"]): string {
  switch (type) {
    case "single_select":
    case "multi_select":
    case "dropdown":
    case "picture_choice":
    case "yes_no":
      return "Pick one above, or just tell me…";
    case "rating":
    case "nps":
    case "opinion_scale":
      return "Tap a number, or type it…";
    case "date":
      return "Pick a date, or type one…";
    case "file_upload":
    case "signature":
      return "Use the box above, or say something…";
    default:
      return "Type your answer…";
  }
}
