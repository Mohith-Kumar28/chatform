"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ArrowDown,
  CheckCheck,
  PartyPopper,
  Pencil,
  RotateCcw,
  ShieldAlert,
  SkipForward,
  TriangleAlert,
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PublicBlock, PublicFormConfig } from "@repo/form-schema";
import { chatThemeVars } from "@/lib/chat-theme";
import { LogoMark } from "@/components/brand/logo";
import { AuthCard } from "./auth-card";
import { useChat, type ChatMessage } from "./use-chat";
import { SendRow, TextInput } from "./composers/primitives";
import { QuestionAffordance } from "./question-affordance";
import { QuestionMedia } from "./question-media";
import { ChatBoot } from "./chat-boot";
import { Confetti } from "./confetti";
import { cn } from "@/lib/utils";
import { API_ORIGIN } from "@/lib/api/mutator";


export function ChatClient({
  config,
  hiddenFields,
  existingSession,
  previewMode,
  onRestart,
}: {
  config: PublicFormConfig;
  hiddenFields?: Record<string, string>;
  existingSession?: { sessionId: string; token: string; eventsUrl: string } | null;
  previewMode?: boolean;
  /** Preview only: mint a fresh session, since a draft has no public slug. */
  onRestart?: () => void;
}) {
  const chat = useChat({
    slug: config.slug,
    apiOrigin: API_ORIGIN,
    hiddenFields,
    existingSession,
    onRestart,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  /** Read from the resize observer, which must not be rebuilt on every scroll. */
  const pinnedRef = useRef(true);
  useEffect(() => {
    pinnedRef.current = pinned;
  }, [pinned]);

  /**
   * Auto-scroll. We stop following as soon as the respondent scrolls up, and
   * offer a way back.
   *
   * `chat.resolving` is in the dependency list because the first committed
   * render is the boot screen, which returns before the thread exists — so this
   * ran once against a null ref and, with no dependencies, never ran again. The
   * scroll listener was never attached at all: "Jump to latest" could not
   * appear, and `pinned` was stuck true no matter where the respondent had
   * scrolled to.
   */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      setPinned(distance < 80);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [chat.resolving, chat.submitted]);

  /**
   * Follow a new turn arriving.
   *
   * Keyed on how many messages there are, not on the array itself. Every
   * streamed token replaces the array, so depending on it started a fresh
   * *smooth* scroll dozens of times a second — each one cancelling the last
   * before it arrived, while the resize observer below drove the same element
   * instantly for the same growth. Two animations fighting over one scroll
   * position is the jitter, and it is worst exactly where it can least be
   * afforded: a cheap phone, mid-answer. Growth from tokens is a resize, and
   * the observer already owns it; this owns the arrival of a new bubble.
   */
  const turnCount = chat.messages.length;
  useEffect(() => {
    if (!pinned) return;
    const el = scrollRef.current;
    if (!el) return;
    // Drive the container directly. scrollIntoView targeted the window and put
    // the anchor behind the sticky composer.
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turnCount, chat.thinking, chat.question, chat.ending, chat.auth, chat.review, pinned]);

  /**
   * Follow the thread when it grows *without* a new message.
   *
   * Several controls get taller as they are used — a ranking list fills up, a
   * multi-select reveals its Continue button, a calendar opens its times — and
   * none of that is a state this effect list can see. The button that finishes
   * the question would slide under the sticky composer and stay there, and the
   * respondent had to know to scroll to find it. A resize observer is the only
   * thing that catches all of them.
   */
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (!pinnedRef.current) return;
      // Instant, not smooth. A control growing under the cursor is the same
      // content reflowing rather than a new turn arriving, and a smooth scroll
      // that is restarted by the next resize tick lands short — which left the
      // button that finishes the question a few pixels under the composer.
      el.scrollTop = el.scrollHeight;
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, [chat.resolving, chat.submitted]);

  // Honour the ending's redirect, which was parsed and then ignored.
  useEffect(() => {
    const target = chat.ending?.redirectUrl;
    if (!target || previewMode) return;
    const delay = (chat.ending?.redirectDelaySec ?? 5) * 1000;
    const t = setTimeout(() => window.location.assign(target), delay);
    return () => clearTimeout(t);
  }, [chat.ending, previewMode]);

  const themeVars = useMemo(() => chatThemeVars(config.theme), [config.theme]);

  /*
    Stable handlers for the question controls.
   
    Inline arrows here gave the (memoised) affordance a new prop on every
    streamed token, which defeats the memo entirely — the one place it matters
    most, since that subtree holds the respondent's half-made selection.
  */
  const currentRef = chat.question?.block.ref;
  const { sendStructured, sendAction } = chat;
  const onStructured = useCallback(
    (value: unknown, display: string) => {
      if (currentRef) void sendStructured(currentRef, value, display);
    },
    [currentRef, sendStructured],
  );
  const onSkip = useCallback(() => void sendAction("skip"), [sendAction]);

  /**
   * The image, clip or file the current question carries — and the agent
   * message it belongs above.
   *
   * It used to render inside `QuestionAffordance`, which sits *under* the
   * agent's message with the chips. So the builder's preview showed the media
   * above the question and the live form showed it below, and the preview was
   * the one that was right: you look at the picture, then read what is being
   * asked about it.
   *
   * Anchored to the last settled agent message rather than carried on the
   * message itself, because a message does not record which block it asked
   * about. While the next question is still streaming there is no settled
   * bubble to sit above, so the previous question's media clears instead of
   * hopping down onto the new one.
   */
  const media = chat.question?.block.media;
  const imageKey = chat.question?.block.imageKey;
  const mediaMessageId = useMemo(
    () =>
      media || imageKey
        ? chat.messages.filter((m) => m.role === "assistant" && !m.streaming).at(-1)?.id
        : undefined,
    [media, imageKey, chat.messages],
  );
  const uploadBase = chat.getUploadBase();
  const respondentToken = chat.getRespondentToken();

  /**
   * Hold the frame until we know which screen this is.
   *
   * `resolving` covers the round trip that decides between a fresh
   * conversation, a resumed one, and "you've already answered this". Rendering
   * the chat during it and swapping afterwards threw a whole viewport away in
   * front of the respondent.
   */
  if (chat.resolving) {
    return (
      <div
        className={cn("chat-surface flex flex-col", previewMode ? "h-full min-h-0" : "h-svh")}
        style={themeVars}
      >
        <ChatBoot title={config.agentName || config.title} logoUrl={config.theme.logoUrl} />
      </div>
    );
  }

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
        <div ref={contentRef} className="mx-auto w-full max-w-2xl space-y-3 px-4 pt-6 pb-10">
          {/* Screen readers announce new agent messages without stealing focus.
              Memoised: this walked the whole thread on every render, and a
              render happens on every streamed token. */}
          <LiveRegion messages={chat.messages} />

          {chat.messages.map((m) => (
            <div key={m.id}>
              {m.id === mediaMessageId && !chat.ending && !chat.auth && (
                <div className="mb-2">
                  <QuestionMedia media={media} imageKey={imageKey} />
                </div>
              )}
              <Bubble
                message={m}
                // A user message can be edited when we know which question it
                // answered and the form is still open. A boolean plus the
                // stable `editAnswer`, rather than a fresh arrow per render —
                // an inline closure here would give every bubble a new prop on
                // every streamed token and defeat the memo entirely.
                canEdit={!m.optimistic && !!m.answeredRef && !chat.ending}
                onEdit={chat.editAnswer}
              />
            </div>
          ))}

          {chat.thinking && <TypingDots />}

          {/* The current question's controls live here, under the agent's
              message — not in place of the composer. */}
          {/*
              Disabled while an answer is in flight, not unmounted.
              A respondent who tapped "iOS (iPhone)" must not be able to tap
              again — the second tap was read as a correction, "Sure, let's redo
              that one" — but taking the chips out of the tree to achieve that
              made them flash: `thinking` flips on every send and on every
              branch jump, so the row vanished and then faded back in through
              `animate-message-in` each time. Disabling stops the second tap
              and keeps the row still.
          */}
          {/* Not while a sign-in gate is up: the server refuses every turn until
              it is cleared, so chips there are a control that cannot work — and
              their number keys would fire under the card. */}
          {!chat.ending && !chat.auth && chat.question && (
            <div key={chat.question.block.ref} className="animate-message-in pt-0.5 pl-1">
              <QuestionAffordance
                block={chat.question.block}
                // `answering`, not `thinking`. The comment above says these are
                // disabled rather than unmounted, and `!chat.thinking` in the
                // condition quietly made that untrue: any flag that raised the
                // typing dots — a branch jump, a sign-in round trip — took the
                // chips off the screen with it, and a flag that got stuck took
                // them away for good. That is how a respondent ended up staring
                // at a question whose three options had been delivered, were on
                // the page a reload away, and could not be seen or tapped.
                disabled={chat.status === "error" || chat.answering}
                uploadBase={uploadBase}
                respondentToken={respondentToken}
                onStructured={onStructured}
                onSkip={onSkip}
                followUpEnabled={config.followUpEnabled}
                onDeclineFollowUps={chat.declineFollowUps}
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
              onPhoneToken={(t) => void chat.signInWithPhoneToken(t)}
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

          {chat.ending && (
            <EndingCard
              ending={chat.ending}
              theme={config.theme}
              allowRepeat={config.duplicates === "none"}
              onRestart={() => void chat.startOver()}
            />
          )}

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
            {/*
              Keyed on the question, so moving to the next one gives the
              composer a fresh instance with an empty box. It used to clear
              itself from an effect after rendering the new question with the
              previous answer still in it — one frame of the wrong text, and a
              cascading render to remove it.
            */}
            {/*
              No `key` here. It used to be the current question's ref, so React
              would remount the composer to clear the draft — but the fallback
              made the key `"composer"` whenever `question` was briefly null,
              which remounts mid-conversation: the text someone had typed was
              thrown away and `autoFocus` fired again, taking the caret and, on
              a phone, bouncing the keyboard. The draft is cleared on a real
              question change inside the component instead.
            */}
            <Composer
              block={chat.question?.block}
              status={chat.status}
              validationHint={chat.validationHint}
              send={chat.send}
              sendAction={chat.sendAction}
              config={config}
            />
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
            the chatform mark, so an unbranded form still looks deliberate. */}
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={brandName ?? title}
            className="size-8 shrink-0 rounded-xl object-contain"
          />
        ) : (
          <div
            className="grid size-8 shrink-0 place-items-center rounded-xl bg-[var(--cf-surface)] ring-1 ring-black/5"
            role="img"
            aria-label={title}
          >
            <LogoMark className="size-5" />
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

        {onStartOver && <StartOverButton onConfirm={onStartOver} />}
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

/**
 * One turn in the thread.
 *
 * Memoised, and that is not a micro-optimisation. Every streamed token calls
 * `setMessages`, which re-rendered the whole thread — and every settled bubble
 * re-parsed its own markdown through react-markdown on each one. Ten messages
 * on screen meant ten markdown parses per token, which is what made typing feel
 * like it was fighting the page. `setMessages` maps and only replaces the
 * object for the message that changed, so identity comparison is enough to
 * leave every other bubble alone.
 */
const Bubble = memo(function Bubble({
  message,
  canEdit,
  onEdit,
}: {
  message: ChatMessage;
  canEdit: boolean;
  /** Stable across renders — see `editAnswer` in `useChat`. */
  onEdit: (ref: string) => void;
}) {
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
      {/* Change-your-mind affordance. Revealed on hover where there is a
          pointer to hover with, and always visible where there is not — see
          `.chat-edit-affordance`. */}
      {isUser && canEdit && message.answeredRef && (
        <button
          type="button"
          onClick={() => onEdit(message.answeredRef!)}
          aria-label="Change this answer"
          title="Change this answer"
          className="chat-edit-affordance order-first shrink-0 rounded-full p-1.5"
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
        ) : message.streaming ? (
          /*
            Half-written markdown is not markdown.
 
            Parsing on every token meant the bubble rendered a literal `**`
            that then vanished into bold, a `|` that reflowed into a table row,
            and a heading that jumped a font size — a visible twitch per token,
            on top of re-parsing the whole message dozens of times a second.
            Plain text while it streams, parsed once when it lands, is both
            steadier and far cheaper. The caret sits inside the same block so
            it trails the last word instead of dropping to a line of its own.
          */
          <p className="whitespace-pre-wrap">
            {message.text}
            <span className="animate-caret ml-0.5 inline-block align-baseline">▍</span>
          </p>
        ) : (
          <div className="chat-prose">
            <Markdown remarkPlugins={[remarkGfm]} allowedElements={SAFE_ELEMENTS} unwrapDisallowed>
              {message.text}
            </Markdown>
          </div>
        )}
      </div>
    </div>
  );
});

/**
 * The finished agent message, announced once it has settled.
 *
 * Its own component so the scan is memoised against the message list, and so a
 * render caused by a streamed token does not re-run it. Streaming messages are
 * skipped deliberately: a live region that changed on every token would read
 * the sentence aloud a word at a time.
 */
const LiveRegion = memo(function LiveRegion({ messages }: { messages: ChatMessage[] }) {
  const latest = useMemo(
    () => messages.filter((m) => m.role === "assistant" && !m.streaming).at(-1)?.text,
    [messages],
  );
  return (
    <div className="sr-only" aria-live="polite" aria-atomic="false">
      {latest}
    </div>
  );
});

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

      {/*
        The emphasis was backwards. Someone who lands here has already
        answered, so the thing they came to do is look at what they said —
        while "Resubmit" throws that away and starts again. Filling the width
        in the accent colour made destroying the answer the obvious action and
        reading it the afterthought.
      */}
      <div className="mt-6 flex flex-col items-center gap-3">
        {submitted.answers.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAnswers((v) => !v)}
            className="h-11 w-full rounded-full text-sm font-medium transition-transform active:scale-[0.98] motion-reduce:active:scale-100"
            style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)" }}
          >
            {showAnswers ? "Hide my answers" : "View my answers"}
          </button>
        )}

        {allowRepeat && (
          <button
            type="button"
            onClick={onResubmit}
            className="text-sm underline opacity-60 transition-opacity hover:opacity-100"
          >
            Submit another response
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
  // ⌘↵ / Ctrl+↵ submits from anywhere on this screen, including from inside the
  // composer — which is where the caret still is when the review appears.
  useEffect(() => {
    if (busy) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      onSubmit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onSubmit]);

  return (
    <div className="animate-message-in space-y-3 rounded-2xl bg-[var(--cf-chip-bg)] p-4">
      {/*
        The instruction is the point.
        This said "have a look before you send it" above a list whose edit
        controls were invisible until hovered — so on a phone, where nothing
        hovers, there was no way to change an answer at all and no hint that
        there should be. Saying what to tap costs one word and is the only part
        of this card a hurried respondent reads.
      */}
      <p className="text-sm font-medium">
        That&apos;s everything — tap any answer to change it before you send.
      </p>

      <ul className="space-y-0.5">
        {review.answers.map((a) => (
          <li key={a.ref}>
            {/*
              The whole row is the target, not a 14px pencil.
              A hover-revealed icon is a desktop-only affordance wearing a
              mobile-sized hit area; a full-width button is reachable with a
              thumb and still reads as a list.
            */}
            <button
              type="button"
              onClick={() => onEdit(a.ref)}
              aria-label={`Change your answer to ${a.title}`}
              className="group -mx-2 flex w-[calc(100%+1rem)] items-start gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition-colors hover:bg-[var(--cf-chip-border)]/25 focus-visible:bg-[var(--cf-chip-border)]/25"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-xs opacity-55">{a.title}</span>
                <span className="block break-words">{a.display || "—"}</span>
              </span>
              {/* Always visible, never hover-gated — it is the thing that says
                  this row can be changed. */}
              <Pencil className="mt-3.5 size-3.5 shrink-0 opacity-35 transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80" />
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={busy}
        onClick={onSubmit}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-medium transition-transform active:scale-[0.98] motion-reduce:active:scale-100 disabled:opacity-60"
        style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)" }}
      >
        {busy ? "Submitting…" : "Submit form"}
        {/* Shown, not just bound. A shortcut nobody can see is a shortcut
            nobody uses — and it is the one key press that ends the form, so it
            is worth teaching at the moment it applies. */}
        {!busy && <Kbd>{modKeyLabel()}↵</Kbd>}
      </button>
    </div>
  );
}

/** The platform's own name for the modifier, so the hint matches the keyboard. */
function modKeyLabel(): string {
  if (typeof navigator === "undefined") return "⌘";
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl+";
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="rounded px-1.5 py-0.5 font-sans text-[0.6875rem] leading-none opacity-70"
      style={{ background: "color-mix(in oklch, var(--cf-accent-text) 22%, transparent)" }}
    >
      {children}
    </kbd>
  );
}

/**
 * "Start over", in the header rather than behind a menu.
 *
 * It used to be the only item in a `…` dropdown, which is two clicks and a
 * guess to reach a control that is genuinely useful mid-form: somebody who
 * mistyped three answers ago wants to restart, and hunting for it in an
 * overflow menu is how they instead abandon the form. A menu holding exactly
 * one thing is not a menu.
 *
 * It arms rather than firing, because it throws away every answer and the
 * session with them, and a header button is easy to hit by accident on a
 * phone. Two deliberate taps, no modal — a dialog for this would be heavier
 * than the thing it guards. The armed state disarms itself after a few seconds
 * so it cannot sit there waiting to be triggered by a stray tap much later.
 */
function StartOverButton({ onConfirm }: { onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      type="button"
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
      onBlur={() => setArmed(false)}
      aria-label={armed ? "Confirm starting over — this clears your answers" : "Start over"}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-opacity",
        armed
          ? "text-[var(--destructive)] opacity-100"
          : "opacity-45 hover:opacity-90 focus-visible:opacity-90",
      )}
    >
      <RotateCcw className="size-3.5 shrink-0" />
      {/*
        The label is what makes this discoverable, and discoverability was the
        entire problem with the menu — so it is never dropped, not even on a
        phone. It costs about 66px against a title that truncates anyway, and a
        bare rotate glyph on a phone is only marginally better than the "…" it
        replaced.
      */}
      <span>{armed ? "Tap again to clear" : "Start over"}</span>
    </button>
  );
}

/**
 * The completion screen.
 *
 * Finishing a form is the one moment the respondent has actually given you
 * something, and it used to be a small grey card. Now it lands: a burst of
 * confetti in the form's own colours, a big thank-you, and the CTA if there is
 * one. Confetti is skipped under reduced-motion.
 *
 * A `screen_out` ending is the same screen with everything celebratory taken
 * out. It has to be the same component: the alternative is a second card that
 * drifts — one of them gets the redirect handling, the other keeps the logo —
 * and the two screens are structurally identical anyway. What differs is that
 * there is no confetti, no party icon, no "submit another response", and a list
 * of what they did not meet where a thank-you would have been.
 */
function EndingCard({
  ending,
  theme,
  allowRepeat,
  onRestart,
}: {
  ending: NonNullable<ReturnType<typeof useChat>["ending"]>;
  theme: PublicFormConfig["theme"];
  allowRepeat: boolean;
  onRestart: () => void;
}) {
  const screenedOut = ending.kind === "screen_out";
  const requirements = ending.requirements ?? [];
  return (
    <>
      {!screenedOut && <Confetti colors={[theme.accent, theme.userBubble, "#ffffff", theme.text]} />}

      <div className="animate-message-in flex flex-col items-center px-6 py-10 text-center">
        {/*
          The brand mark stays on a refusal — being turned away by an unbranded
          grey page reads as an error, and this is not an error. Only the icon
          that stands in for it changes, because a party popper over "you can't
          submit this" is the tonal failure this whole ending kind exists to fix.
        */}
        {theme.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={theme.logoUrl} alt={theme.brandName ?? ""} className="mb-5 h-12 object-contain" />
        ) : screenedOut ? (
          <div className="mb-5 grid size-16 place-items-center rounded-full border border-current/15 bg-current/8 opacity-70">
            <ShieldAlert className="size-8" strokeWidth={1.75} />
          </div>
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

        {/*
          What they did not meet.
          Left-aligned inside a centred card on purpose: this is the one part of
          the screen somebody actually reads item by item, and centred list items
          with ragged left edges are the standard way to make a short list hard
          to scan. Already narrowed server-side to the requirements that apply to
          this response.
        */}
        {screenedOut && requirements.length > 0 && (
          <div className="mt-6 w-full max-w-sm rounded-2xl border border-[var(--cf-chip-border)] bg-[var(--cf-chip-bg)] px-4 py-3.5 text-left">
            {/* Not "so far": this screen is the end of the road, not a step in it. */}
            <p className="text-xs font-semibold tracking-wide uppercase opacity-55">What&apos;s missing</p>
            <ul className="mt-2 space-y-1.5">
              {requirements.map((r) => (
                <li key={r} className="flex gap-2.5 text-[0.9375rem] leading-snug">
                  <TriangleAlert className="mt-[0.2rem] size-3.5 shrink-0 opacity-50" strokeWidth={2} />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
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

        {/*
          Only the "you've already answered this" screen offered this, which is
          the screen you reach by coming BACK. Someone who has just finished and
          wants to file a second response — the same person entering a colleague,
          a second device, another idea — had to reload and hope. Gated on the
          form's own duplicate policy, so a form that fingerprints respondents
          still does not invite a second answer.
        */}
        {allowRepeat && !ending.redirectUrl && (
          <button
            type="button"
            onClick={onRestart}
            className="mt-6 text-sm underline opacity-55 transition-opacity hover:opacity-100"
          >
            {/*
              "Submit another response" is wrong on a refusal in both halves:
              nothing was submitted, and the offer sounds like an invitation to
              file a duplicate. Someone screened out is usually here because of
              one answer, sometimes a mis-tap, so starting over is exactly the
              right escape hatch — it just has to be named honestly.
            */}
            {screenedOut ? "Start over" : "Submit another response"}
          </button>
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
/**
 * The message box.
 *
 * Given the four values it reads rather than the whole `useChat` result, and
 * memoised on them. The hook returns a fresh object on every render, and a
 * render happens on every streamed token, so passing it whole re-rendered the
 * text field — including its controlled value and its autofocus — dozens of
 * times a second while the agent was talking. On a slow phone that is felt in
 * the keyboard, which is the one place in a form that has to stay perfectly
 * still.
 */
const Composer = memo(function Composer({
  block,
  status,
  validationHint,
  send,
  sendAction,
  config,
}: {
  block: PublicBlock | undefined;
  status: string;
  validationHint: string | null;
  send: (text: string) => Promise<void>;
  sendAction: (action: "skip" | "restart" | "stop" | "submit") => Promise<void>;
  config: PublicFormConfig;
}) {
  const [text, setText] = useState("");

  /**
   * The draft belongs to one question, so it is cleared when the question
   * changes — and only then.
   *
   * Compared during render rather than in an effect: an effect would paint the
   * old text against the new question for a frame, which is the blink this is
   * here to remove. A transient null question is ignored on purpose; that is
   * the round trip between two questions, not a new one.
   */
  const [draftFor, setDraftFor] = useState(block?.ref);
  if (block?.ref && block.ref !== draftFor) {
    setDraftFor(block.ref);
    if (text !== "") setText("");
  }

  /*
    Number keys used to be handled here, from a list built off `block.options`.
    That list did not match what the chips actually advertise — a `yes_no`
    block has no options, so its "1"/"2" hints did nothing but type a digit
    into this box — and it could not reach a multi-select's selection state at
    all. `QuestionAffordance` owns both the hints and the keys now, from one
    list, so what is shown and what responds cannot drift apart again.
  */

  if (!block) {
    return (
      <p className="text-center text-sm opacity-50">
        {status === "connecting" ? "Connecting…" : " "}
      </p>
    );
  }

  const disabled = status === "error";
  const canSkip = config.allowSkip && !block.required;

  function submit() {
    const value = text.trim();
    if (!value) return;
    setText("");
    void send(value);
  }

  return (
    <div className="space-y-2">
      {validationHint && <p className="px-1 text-sm opacity-70">{validationHint}</p>}

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
          onClick={() => void sendAction("skip")}
          className="flex items-center gap-1 px-1 text-xs opacity-50 transition-opacity hover:opacity-100"
        >
          <SkipForward className="size-3" />
          Skip this one
        </button>
      )}
    </div>
  );
});

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
