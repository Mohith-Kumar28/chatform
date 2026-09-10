"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Check,
  ArrowDown,
  ArrowUpRight,
  CheckCheck,
  PartyPopper,
  Pencil,
  RotateCcw,
  ShieldAlert,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PublicBlock, PublicFormConfig } from "@repo/form-schema";
import { chatThemeVars } from "@/lib/chat-theme";
import { LogoMark } from "@/components/brand/logo";
import { AuthCard } from "./auth-card";
import { warmGoogleSignIn } from "./google-signin";
import { asEmail } from "./respondent-hint";
import { VerifyCard } from "./verify-card";
import { embedBridgeReady, requestEmbedClose, subscribeEmbedBridge } from "./embed-bridge";
import { useChat, type ChatMessage } from "./use-chat";
import { SendRow, SkipButton, TextInput } from "./composers/primitives";
import { inputSemanticsFor } from "./composers/input-semantics";
import { QuestionAffordance } from "./question-affordance";
import { QuestionMedia } from "./question-media";
import { ChatBoot } from "./chat-boot";
import { ClosingNotice } from "./closing-notice";
import { useViewportLock } from "./use-viewport-lock";
import { Confetti } from "./confetti";
import { cn } from "@/lib/utils";
import { API_ORIGIN } from "@/lib/api/mutator";


export function ChatClient({
  config,
  hiddenFields,
  resumeToken,
  followUpId,
  existingSession,
  previewMode,
  onRestart,
}: {
  config: PublicFormConfig;
  hiddenFields?: Record<string, string>;
  /** From `?resume=` — a follow-up email's link back to a half-finished response. */
  resumeToken?: string;
  /** From `?fu=` — which message in the sequence that link came from. */
  followUpId?: string;
  existingSession?: { sessionId: string; token: string; eventsUrl: string } | null;
  previewMode?: boolean;
  /** Preview only: mint a fresh session, since a draft has no public slug. */
  onRestart?: () => void;
}) {
  const chat = useChat({
    slug: config.slug,
    apiOrigin: API_ORIGIN,
    hiddenFields,
    ...(resumeToken ? { resumeToken } : {}),
    ...(followUpId ? { followUpId } : {}),
    existingSession,
    onRestart,
  });

  /**
   * Fetch Google's sign-in script while the boot screen is still up.
   *
   * The card that needs it does not mount until `auth_required` arrives, which
   * is itself behind opening the session and streaming the greeting. Leaving
   * the script fetch inside the card therefore made the two round trips strictly
   * serial, and a returning respondent — the one case where sign-in could be a
   * single silent step — waited out both before Google was so much as asked.
   *
   * Everything needed to start is already here at first paint: the public
   * config says the form is gated and names the method, and the hint is a
   * synchronous read from local storage. Only `prompt()` stays behind the card,
   * because it is the only part with a face; see `google-signin.ts`.
   *
   * Deliberately not run for a phone-gated or ungated form, which would be
   * fetching a script for a door they do not open.
   */
  const googleGated = config.requireAuth?.method === "google";
  const googleHintEmail =
    googleGated && chat.respondentHint?.provider === "google"
      ? asEmail(chat.respondentHint.label)
      : undefined;
  useEffect(() => {
    if (!googleGated) return;
    warmGoogleSignIn(googleHintEmail);
  }, [googleGated, googleHintEmail]);

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

  /**
   * Keep the newest turn above the keyboard.
   *
   * The shell shrinks the instant the keyboard opens, and the bottom of the
   * thread — the question being answered — is what goes under the fold. This
   * runs on the same measurement that resized the shell, so the two happen in
   * one frame.
   */
  const onViewportChange = useCallback(() => {
    if (!pinnedRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);
  useViewportLock(!previewMode, onViewportChange);

  /**
   * Honour the ending's redirect — in a new tab, leaving this one where it is.
   *
   * It used to be `location.assign`, which threw the finished form away. What
   * a redirect points at is almost always somewhere to go *next* (a WhatsApp
   * group, a payment page, a schedule), and the respondent still wants what is
   * on this screen when they come back from it: the confirmation, the link
   * spelled out in the body, the "you already answered this" record.
   *
   * A pop-up opened five seconds after the last tap has no user gesture behind
   * it, and Safari in particular will refuse it. That is not a failure worth
   * hiding — `blocked` puts a real button on the ending, and a tap on that is a
   * gesture no browser argues with.
   */
  const [redirectBlocked, setRedirectBlocked] = useState(false);
  useEffect(() => {
    const target = chat.ending?.redirectUrl;
    if (!target || previewMode) return;
    const delay = (chat.ending?.redirectDelaySec ?? 5) * 1000;
    const t = setTimeout(() => {
      /*
       * `noopener` goes on the handle, not in the feature string. Passing it
       * as a feature makes `window.open` return null *by specification* — no
       * reference is the whole point — which is indistinguishable from being
       * blocked, and would show the fallback button every single time.
       */
      const opened = window.open(target, "_blank");
      if (opened) opened.opener = null;
      else setRedirectBlocked(true);
    }, delay);
    return () => clearTimeout(t);
  }, [chat.ending, previewMode]);

  const themeVars = useMemo(() => chatThemeVars(config.theme), [config.theme]);

  /**
   * A framed form gets its own way out.
   *
   * The launcher that opened the panel is the only close a host page offers,
   * and it is the wrong control for the job: in side-tab it sits underneath the
   * sheet, and under 520px the panel goes edge-to-edge and covers it outright,
   * so the button that would close the form is behind the form. The one place
   * guaranteed to be reachable and to collide with nothing is this header,
   * which is already laid out and already has a slot beside "Start over".
   *
   * Gated on the handshake rather than on `?embed=1`: a parent that failed the
   * origin allowlist gets no messages from us, and a close button that posts
   * into a void is worse than no close button.
   */
  const canClose = useSyncExternalStore(subscribeEmbedBridge, embedBridgeReady, () => false);

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
  /* Stable for the same reason as the handlers above: it rides on every bubble. */
  const { switchAccount } = chat;
  const onSwitchAccount = useCallback(() => void switchAccount(), [switchAccount]);

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
        className={cn(
          "chat-surface flex flex-col",
          previewMode ? "h-full min-h-0" : "cf-chat-viewport",
        )}
        style={themeVars}
      >
        <ChatBoot title={config.agentName || config.title} logoUrl={config.theme.logoUrl} />
      </div>
    );
  }

  // The builder can name the interviewer; fall back to the form title.
  const agentName = config.agentName || config.title;
  // Review and the ending both mean every question is answered; without this
  // the bar dropped to zero at the last step because there is no current
  // question to read progress from.
  // `submitted` joins these now that it renders in the thread rather than
  // replacing the screen: the header is on show for the first time in that
  // state, and a finished response reading "0% complete" is the bar contradicting
  // the sentence underneath it. All three mean every question is answered.
  const pct =
    chat.review || chat.ending || chat.submitted ? 100 : (chat.question?.progress.pct ?? 0);

  return (
    <div
      // A fixed shell, not `h-svh`: with a viewport unit the container was the
      // wrong height whenever the address bar collapsed or the keyboard came
      // up, and the document behind it stayed scrollable — so the first swipe
      // of every gesture went into the browser's chrome instead of the thread.
      // `use-viewport-lock` measures what is really visible; this is that.
      className={cn(
        "chat-surface flex flex-col",
        previewMode ? "h-full min-h-0" : "cf-chat-viewport",
      )}
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
        /*
          Always offered once anything has been said, rather than only in a
          "welcome back" banner that appeared once and then vanished.

          Withdrawn on a response the *server* has refused by identity. Start
          over does exactly what it says — a new session, a blank thread — and
          the new session then signs in, is recognised as the same person and
          is refused again, landing on the identical screen. A control whose
          only possible outcome is the screen you are already looking at is
          worse than no control: it reads as the page being broken, which is
          precisely how it was reported.
        */
        onStartOver={
          chat.messages.length > 0 && !chat.ending && chat.submitted?.canRepeat !== false
            ? () => void chat.startOver()
            : undefined
        }
        onClose={canClose ? () => void requestEmbedClose() : undefined}
      />

      {/*
        `overflow-x-hidden` is a floor, not the fix.

        A non-visible `overflow-y` forces the computed `overflow-x` from
        `visible` to `auto` — so `overflow-y-auto` alone quietly made this a
        horizontal scroller too, and one unbreakable string anywhere in the
        thread was enough to give a respondent a sideways-sliding page. That
        cause is fixed where it belongs (`overflow-wrap` on `.chat-prose`), and
        this is the guard for the next one: an author can put arbitrary text in
        a question title, an ending body or a chip label, and a respondent is
        the last person who should discover it.

        It clips nothing that wants to scroll: `pre` and `table` carry their own
        `overflow-x: auto` inside the prose, so wide code and wide tables still
        scroll within themselves. `overscroll-contain` beside it governs chaining
        on both axes and never the overflow itself, which is why it was no help
        here.
      */}
      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
      >
        <div ref={contentRef} className="mx-auto w-full max-w-2xl space-y-3 px-4 pt-6 pb-10">
          {/*
            The closing time, before the first question rather than after the
            last one.

            Withdrawn once the conversation has an ending: a countdown over a
            finished response is counting down to nothing that concerns the
            person reading it.

            `started` is read from the thread having anything in it, because a
            greeting means the server accepted a session — and a session that
            opened before the deadline can still be finished after it, which is
            the difference between "you have closed" and "you can still submit
            this". Nothing else here distinguishes those two.
          */}
          {!chat.ending && !chat.submitted && (
            <ClosingNotice
              closeAt={config.closeAt}
              capacity={config.capacity}
              started={chat.messages.length > 0}
            />
          )}

          {/* Screen readers announce new agent messages without stealing focus.
              Memoised: this walked the whole thread on every render, and a
              render happens on every streamed token. */}
          <LiveRegion messages={chat.messages} />

          {chat.messages.map((m) => (
            <div key={m.id}>
              {m.id === mediaMessageId && !chat.ending && !chat.auth && !chat.verify && (
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
                /*
                  Offered only while the form still wants an answer, and only
                  where signing in was asked for in the first place. On a
                  finished conversation it would be a way to throw the response
                  away, which is not what the words say.
                */
                onSwitchAccount={
                  config.requireAuth && !chat.ending && !chat.submitted
                    ? onSwitchAccount
                    : undefined
                }
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
          {/* Not while a code is outstanding either: the question has been
              answered, and answering it again is what "Use a different number"
              is for. */}
          {!chat.ending && !chat.auth && !chat.verify && chat.question && (
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
              />
            </div>
          )}

          {/* Sign-in sits in the thread, under the agent's message asking for
              it — not as an interstitial the respondent has to get past. */}
          {chat.auth && (
            <AuthCard
              auth={chat.auth}
              hint={chat.respondentHint}
              onForgetHint={chat.forgetRespondentHint}
              onGoogle={(t) => void chat.signInWithGoogle(t)}
              onPhoneToken={(t) => void chat.signInWithPhoneToken(t)}
            />
          )}

          {/* One answer proving itself, in the thread under the question that
              asked for it — the conversation above it stays exactly where it
              was, which is the whole difference between this and the gate. */}
          {chat.verify && (
            <VerifyCard
              verify={chat.verify}
              hint={chat.validationHint}
              onSubmitCode={(code) => void chat.submitVerifyCode(code)}
              onPhoneToken={(t) => void chat.submitVerifyPhoneToken(t)}
              onResend={() => void chat.resendVerifyCode()}
              onChange={() => void chat.changeVerifyAnswer()}
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
              allowRepeat={config.allowResubmissions}
              onRestart={() => void chat.startOver()}
              /*
                Not offered in the preview, which has no server session to
                reopen — its "session" is owned by the builder around it.
              */
              onUndoScreenOut={previewMode ? undefined : () => void chat.undoScreenOut()}
              redirectBlocked={redirectBlocked}
            />
          )}

          {/* Coming back to a form you already answered, in the thread — like
              every other state in here. This used to be an early return that
              replaced the whole screen with a centred card, which threw away
              the conversation and left a bare list of answers where the chat
              had been. The sign-in gate, the code step, the review and the
              ending all sit in the thread for the same reason: the respondent
              should see what they said, not an interstitial about it. */}
          {chat.submitted && (
            <AlreadySubmittedCard
              submitted={chat.submitted}
              title={agentName}
              theme={config.theme}
              /*
                A form with resubmissions switched off is not expecting a second
                answer. `canRepeat` overrides it when the *server* refused this
                particular person — `onePerIdentity` can be on while
                resubmissions are allowed, and offering a button that the next
                sign-in will turn down again is worse than not offering one.
              */
              allowRepeat={chat.submitted.canRepeat ?? config.allowResubmissions}
              onResubmit={() => void chat.startOver()}
              /*
                Whether this session still holds the conversation.

                Measured in *user* messages, not messages. It does hold it when
                they answered several questions here and only then hit a
                deferred sign-in gate that refused them — replaying on top of
                that would print everything twice, which is what this guard is
                for. It does not hold it when they came back later and the
                server recognised them at the door: that session has said
                exactly one thing, "could you verify who you are?", and counting
                messages called that a transcript. So the replay was suppressed
                by the greeting, and a respondent returning to eleven answers
                got a blank page with a grey line on it.
              */
              hasTranscript={chat.messages.some((m) => m.role === "user")}
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

      {!chat.ending && !chat.review && !chat.auth && !chat.verify && (
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
  onClose,
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
  /** Embedded only: collapse the panel back to the host page's launcher. */
  onClose?: () => void;
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

        {/*
          Unlabelled, unlike "Start over" beside it. An X in the corner of a
          panel is the most over-learned control on the web and needs no word,
          and the header is the one row here with no space to spare — the title
          truncates already.
        */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the form"
            className="grid size-7 shrink-0 place-items-center rounded-full opacity-45 transition-opacity hover:opacity-90 focus-visible:opacity-90"
          >
            <X className="size-4" />
          </button>
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
  onSwitchAccount,
}: {
  message: ChatMessage;
  canEdit: boolean;
  /** Stable across renders — see `editAnswer` in `useChat`. */
  onEdit: (ref: string) => void;
  /** Present only beside the "verified as" note, and only on a gated form. */
  onSwitchAccount?: (() => void) | undefined;
}) {
  // A note about the conversation, not a turn in it: quiet, unbubbled, and
  // left in place in the thread.
  if (message.role === "system") {
    return (
      <p className="animate-message-in flex flex-wrap items-center gap-x-2 gap-y-1 pl-1 text-[0.6875rem] opacity-45">
        <span className="flex items-center gap-1.5">
          <Check className="size-3" />
          {message.text}
        </span>
        {/*
          The way out of the wrong account, where the wrong account is written.
          A respondent who signed in on a shared machine, or tapped the one-tap
          suggestion without reading it, could otherwise only escape by finding
          "Start over" — which reads like discarding the form, not like
          correcting who they are.
        */}
        {onSwitchAccount && (
          <button
            type="button"
            onClick={onSwitchAccount}
            className="underline underline-offset-2 transition-opacity hover:opacity-100"
          >
            Switch account
          </button>
        )}
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
 * What a respondent sees on returning to a form they have already been through.
 *
 * Silently starting a blank conversation made it look like the first response
 * had been lost. This says plainly what happened to it, shows what was sent,
 * and only offers a repeat when the form actually accepts one.
 *
 * "What happened to it" has two answers and this used to give only one. A form
 * that screens people out sends the refused ones back here too, and they were
 * met with "you already answered this today" — which is false twice over:
 * nothing was submitted, and the thing they actually want to know is which
 * rule they missed. So a screen-out gets its own ending card, rebuilt from the
 * one the server recorded, above the same replayed transcript.
 */
function AlreadySubmittedCard({
  submitted,
  title,
  theme,
  allowRepeat,
  onResubmit,
  hasTranscript,
}: {
  submitted: NonNullable<ReturnType<typeof useChat>["submitted"]>;
  title: string;
  /** Only for the screen-out branch, which renders a full `EndingCard`. */
  theme: PublicFormConfig["theme"];
  allowRepeat: boolean;
  onResubmit: () => void;
  hasTranscript: boolean;
}) {
  const answers = submitted.answers;
  const screenedOut = submitted.outcome === "screened_out";

  return (
    <>
      {/*
        The conversation, replayed from what was stored.

        A respondent who comes back days later gets a fresh session, so there
        are no messages to show — the server recognised them at the door and
        the client holds only the answer summary. Rendering that summary as a
        list was the old behaviour and it read as a receipt: the questions in
        small grey type, the answers under them, nothing like the thing they
        had actually used. These are the same two bubbles the live thread
        draws, so what they come back to is the conversation they had.

        Skipped when the session still has the real messages — replaying on top
        of them would print everything twice.
      */}
      {!hasTranscript &&
        answers.map((a) => (
          <div key={a.ref} className="space-y-3">
            <div className="animate-message-in flex justify-start">
              <div
                className="bubble-bot max-w-[85%] border px-4 py-2.5 text-[0.9375rem] leading-relaxed"
                style={{
                  background: "var(--cf-bot-bubble)",
                  color: "var(--cf-bot-bubble-text)",
                  borderColor: "var(--cf-bot-bubble-border)",
                }}
              >
                <p className="whitespace-pre-wrap">{a.title}</p>
              </div>
            </div>
            <div className="animate-message-in flex justify-end">
              <div
                className="bubble-user max-w-[85%] px-4 py-2.5 text-[0.9375rem] leading-relaxed"
                style={{
                  background: "var(--cf-user-bubble)",
                  color: "var(--cf-user-bubble-text)",
                  borderColor: "transparent",
                }}
              >
                <p className="whitespace-pre-wrap">{a.display || "\u2014"}</p>
              </div>
            </div>
          </div>
        ))}

      {/*
        The ending they reached, replayed under the transcript.

        Both outcomes get one, and both used to get the same grey footnote
        instead. A refusal needs it because the reason is the whole content of
        the screen — "at least two female members per team" is what they came
        back to check. A completion needs it because a form that ended with
        "Registration submitted — here is the group to join" and then greets
        the same person with one line of grey text looks like it lost the
        response, and the link they came back for is in that card.

        `allowRepeat` is false: the restart link belongs to a live
        conversation, and this is a return visit to a decision.
      */}
      {submitted.ending && (
        <EndingCard
          ending={submitted.ending}
          theme={theme}
          allowRepeat={false}
          onRestart={() => {}}
          replay
        />
      )}

      {/*
        And the status under it — a receipt, not a footnote.

        Why it exists at all: this screen is a *return visit*. Somebody who has
        already answered opened the link again, and without this line the page
        is indistinguishable from having just submitted — so the natural reading
        is that they submitted a second time. It is the one piece of information
        on this screen that the ending card above cannot carry.

        It used to be a line of 60%-opacity grey with a tick floating beside two
        centred lines of ragged text, which is how you make the one sentence
        that answers "did this go through?" look like small print. It is a
        chip now, in outcome colour, with the tick on the first line and the
        form and the day under it — left-aligned inside a centred chip, because
        centred text that wraps has no edge for the eye to come back to.

        There is no "view my answers" button any more: the answers are the
        thread above, so a control to reveal them would be a control to reveal
        what is already on screen. What is left is the one thing they might
        actually want, which is to go again.
      */}
      <div className="animate-message-in flex flex-col items-center gap-4 px-5 pt-6 pb-2 sm:px-6">
        <div
          className="flex max-w-full min-w-0 items-start gap-2.5 rounded-2xl border px-4 py-3 text-left"
          style={{
            // Mixed against `transparent` rather than against the page, so one
            // pair of values works on a white theme and a black one.
            color: `var(--cf-${screenedOut ? "warning" : "success"})`,
            background: `color-mix(in srgb, var(--cf-${screenedOut ? "warning" : "success"}) 11%, transparent)`,
            borderColor: `color-mix(in srgb, var(--cf-${screenedOut ? "warning" : "success"}) 26%, transparent)`,
          }}
        >
          {screenedOut ? (
            <ShieldAlert className="mt-px size-4 shrink-0" strokeWidth={2} />
          ) : (
            <CheckCheck className="mt-px size-4 shrink-0" strokeWidth={2} />
          )}
          <div className="min-w-0">
            <p className="text-sm leading-snug font-medium">
              {/*
                Deliberately not "you already answered" on a refusal. They did
                not — the form stopped them — and the sentence has to leave them
                in no doubt that the answers above are still on file.
              */}
              {screenedOut ? "This wasn't accepted" : "You've already answered this"}
            </p>
            <p className="mt-0.5 text-xs leading-snug break-words opacity-80">
              {title} · {relativeDay(submitted.at)}
              {screenedOut && " · your answers are saved"}
            </p>
          </div>
        </div>

        {allowRepeat && (
          <button
            type="button"
            onClick={onResubmit}
            className="h-11 rounded-full px-6 text-sm font-medium transition-transform active:scale-[0.98] motion-reduce:active:scale-100"
            style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)" }}
          >
            Submit another response
          </button>
        )}
      </div>
    </>
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
  onUndoScreenOut,
  replay,
  redirectBlocked = false,
}: {
  ending: NonNullable<ReturnType<typeof useChat>["ending"]>;
  theme: PublicFormConfig["theme"];
  allowRepeat: boolean;
  onRestart: () => void;
  /**
   * Take back a screen-out and reopen the answer that caused it.
   *
   * Omitted where there is nothing live to reopen — the replay on a return
   * visit, and the builder preview.
   */
  onUndoScreenOut?: (() => void) | undefined;
  /**
   * This is a return visit to an ending, not the moment it happened.
   *
   * Two things have to go. The confetti, because it celebrates an event that
   * happened yesterday — a burst every time somebody opens the link to check
   * what they sent is a party for nothing. And the "taking you to the next
   * step in 5s" line, because nothing is: the redirect is fired from the live
   * `ending` state, which a replay does not set, so the sentence would be a
   * countdown to an event that never comes. The CTA link stays — a return
   * visit is exactly when somebody is looking for it again.
   */
  replay?: boolean;
  /** The new tab was refused, so the respondent has to open it themselves. */
  redirectBlocked?: boolean;
}) {
  const screenedOut = ending.kind === "screen_out";
  const requirements = ending.requirements ?? [];
  return (
    <>
      {!screenedOut && !replay && <Confetti colors={[theme.accent, theme.userBubble, "#ffffff", theme.text]} />}

      {/*
        `min-w-0` and `max-w-full`: this card is a flex child, and a flex child's
        floor is its content's min-content width unless it is told otherwise. One
        long word — see `.chat-prose` — is enough to push it past the viewport
        and give the whole page a horizontal scrollbar, taking the side padding
        off screen with it. The two together make the viewport the ceiling.
      */}
      <div className="animate-message-in flex w-full max-w-full min-w-0 flex-col items-center px-5 py-10 text-center sm:px-6">
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
          <div className="chat-prose mt-2 w-full max-w-sm min-w-0 text-[0.9375rem] opacity-75">
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

        {/*
          The way out of a wrong answer, and the most important control on
          this screen.

          A screen-out is a rule failing, and the overwhelmingly common way to
          fail one is to tap the wrong chip on a yes/no. Until now that cost
          the respondent everything: the card said what was wrong and offered
          nothing to do about it, and reloading only brought the same card
          back — so somebody eleven answers into a registration lost all of it
          to one mis-tap. This reopens exactly that question and keeps every
          other answer.

          A button rather than the quiet underline "Start over" beside it,
          because they are not the same offer: this one costs nothing, and
          starting over costs the whole form.
        */}
        {screenedOut && onUndoScreenOut && (
          <>
            <button
              type="button"
              onClick={onUndoScreenOut}
              className="mt-6 inline-flex h-11 items-center gap-2 rounded-full px-6 text-sm font-medium transition-transform active:scale-[0.98] motion-reduce:active:scale-100"
              style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)" }}
            >
              <Undo2 className="size-4" strokeWidth={2} />
              I answered that by mistake
            </button>
            <p className="mt-2 max-w-xs text-xs opacity-50">
              Takes you back to that one question. Everything else you have answered is kept.
            </p>
          </>
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

        {ending.redirectUrl &&
          !replay &&
          (redirectBlocked ? (
            /*
              The browser refused the new tab. Saying so is pointless — "pop-up
              blocked" is our problem, not theirs — so this is just the next
              step, offered as the button it should have been.
            */
            <a
              href={ending.redirectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex h-11 items-center gap-2 rounded-full px-6 text-sm font-medium transition-transform active:scale-[0.98] motion-reduce:active:scale-100"
              style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)" }}
            >
              Continue to the next step
              <ArrowUpRight className="size-4" strokeWidth={2} />
            </a>
          ) : (
            <p className="mt-4 text-xs opacity-50">
              Opening the next step in a new tab in {ending.redirectDelaySec ?? 5}s…
            </p>
          ))}

        {/*
          Only the "you've already answered this" screen offered this, which is
          the screen you reach by coming BACK. Someone who has just finished and
          wants to file a second response — the same person entering a colleague,
          a second device, another idea — had to reload and hope. Gated on the
          form's own resubmission setting, so a form that only wants one answer
          per person still does not invite a second one.

          It used to be gated on there being no redirect as well, on the
          reasoning that a page about to navigate away has no business offering
          anything. That was the wrong call even then, and it is plainly wrong
          now the redirect opens in a new tab and leaves this one standing: a
          form with a completion redirect — which is most forms that have
          somewhere to send people — silently lost the only control that lets a
          respondent file a second response. One registration per person is a
          setting, and it was being applied to forms that had not asked for it.
        */}
        {allowRepeat && (
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

  const canSkip = Boolean(block) && config.allowSkip && !block?.required;

  /**
   * Escape skips, wherever the focus happens to be.
   *
   * Above the early return because hooks cannot be conditional, and bound to
   * the window rather than to the input because the affordance takes focus the
   * moment somebody touches a chip or a calendar — a listener on the text box
   * would stop working exactly when the question has something else to click.
   *
   * Escape and not a letter: the composer autofocuses on every question, so
   * `s` would swallow the first character of "sometimes". Digits are already
   * spoken for by `useChoiceKeys`.
   */
  useEffect(() => {
    if (!canSkip) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      e.preventDefault();
      void sendAction("skip");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canSkip, sendAction]);

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

  function submit() {
    const value = text.trim();
    if (!value) return;
    setText("");
    void send(value);
  }

  return (
    <div className="space-y-2">
      {validationHint && <p className="px-1 text-sm opacity-70">{validationHint}</p>}

      {/*
        Said before they type, not after. A question that is going to send a
        code needs a reachable number or address, and the moment to know that
        is while choosing which one to give — not in the reply that arrives
        once they have already committed to one.
      */}
      {block.verify && (
        <p className="px-1 text-xs opacity-50">
          {block.type === "phone"
            ? "We'll text a 6-digit code to confirm this number."
            : "We'll email a 6-digit code to confirm this address."}
        </p>
      )}

      {canSkip && <SkipButton onSkip={() => void sendAction("skip")} />}

      <SendRow onSend={submit} disabled={disabled || !text.trim()}>
        <TextInput
          value={text}
          onChange={setText}
          onSubmit={submit}
          autoFocus
          multiline={block.type === "long_text"}
          placeholder={block.placeholder || placeholderFor(block.type)}
          /*
            The box declares what the question is asking for — keyboard,
            capitalisation, and the autofill token that lets a browser offer the
            address or number it already holds. One input serving thirty block
            types used to declare "text" for all of them, so the one thing a
            chat form asks for most was the one thing nothing could fill in.
          */
          semantics={inputSemanticsFor(block)}
        />
      </SendRow>

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
