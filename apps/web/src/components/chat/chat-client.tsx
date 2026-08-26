"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, RotateCcw, SkipForward, TriangleAlert } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PublicBlock, PublicFormConfig } from "@repo/form-schema";
import { chatThemeVars } from "@/lib/chat-theme";
import { useChat, type ChatMessage } from "./use-chat";
import { FileUploadControl } from "./file-upload";
import { Chip, ComposerShell, SendRow, TextInput } from "./composers/primitives";
import { RatingComposer, ScaleComposer } from "./composers/rating";
import { DateComposer } from "./composers/date";
import { SignatureComposer } from "./composers/signature";
import { FieldsComposer, MatrixComposer, RankingComposer } from "./composers/structured";
import { cn } from "@/lib/utils";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:8787";

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
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.messages, chat.thinking, chat.question, pinned]);

  // Honour the ending's redirect, which was parsed and then ignored.
  useEffect(() => {
    const target = chat.ending?.redirectUrl;
    if (!target || previewMode) return;
    const delay = (chat.ending?.redirectDelaySec ?? 5) * 1000;
    const t = setTimeout(() => window.location.assign(target), delay);
    return () => clearTimeout(t);
  }, [chat.ending, previewMode]);

  const themeVars = useMemo(() => chatThemeVars(config.theme), [config.theme]);
  // The builder can name the interviewer; fall back to the form title.
  const agentName = config.agentName || config.title;
  const pct = chat.question?.progress.pct ?? (chat.ending ? 100 : 0);

  return (
    <div
      className={cn("chat-surface flex flex-col", previewMode ? "h-full min-h-0" : "min-h-svh")}
      style={themeVars}
    >
      <ChatHeader
        title={agentName}
        pct={pct}
        mode={config.progressBar}
        answered={chat.question?.progress.answered ?? 0}
        total={chat.question?.progress.totalEstimate ?? 0}
        status={chat.status}
      />

      {chat.resumed && (
        <div className="animate-message-in mx-auto mt-3 w-full max-w-2xl px-4">
          <p className="rounded-xl border border-[var(--cf-chip-border)] bg-[var(--cf-chip-bg)] px-3 py-2 text-sm">
            👋 Welcome back — we picked up where you left off.
          </p>
        </div>
      )}

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-3 px-4 py-6">
          {/* Screen readers announce new agent messages without stealing focus. */}
          <div className="sr-only" aria-live="polite" aria-atomic="false">
            {chat.messages.filter((m) => m.role === "assistant" && !m.streaming).at(-1)?.text}
          </div>

          {chat.messages.map((m) => (
            <Bubble key={m.id} message={m} />
          ))}

          {chat.thinking && <TypingDots />}

          {chat.ending && <EndingCard ending={chat.ending} />}

          <div ref={bottomRef} />
        </div>

        {!pinned && (
          <button
            type="button"
            onClick={() => {
              setPinned(true);
              bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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

      {!chat.ending && (
        <footer className="sticky bottom-0 border-t border-[var(--cf-chip-border)] bg-[var(--cf-bg)]/95 backdrop-blur">
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
  pct,
  mode,
  answered,
  total,
  status,
}: {
  title: string;
  pct: number;
  mode: PublicFormConfig["progressBar"];
  answered: number;
  total: number;
  status: string;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-[var(--cf-chip-border)] bg-[var(--cf-bg)]/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-[var(--cf-accent)] text-sm font-semibold text-[var(--cf-accent-text)]">
          {title.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
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

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex animate-message-in", isUser ? "justify-end" : "justify-start")}>
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

function EndingCard({ ending }: { ending: NonNullable<ReturnType<typeof useChat>["ending"]> }) {
  return (
    <div className="animate-message-in rounded-2xl border border-[var(--cf-chip-border)] bg-[var(--cf-chip-bg)] px-5 py-6 text-center">
      <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--cf-font-heading)" }}>
        {ending.title}
      </h2>
      {ending.bodyMd && (
        <div className="chat-prose mt-1.5 text-sm opacity-80">
          <Markdown remarkPlugins={[remarkGfm]} allowedElements={SAFE_ELEMENTS} unwrapDisallowed>
            {ending.bodyMd}
          </Markdown>
        </div>
      )}
      {/* ctaLabel/ctaUrl were parsed by the hook and never rendered. */}
      {ending.ctaLabel && ending.ctaUrl && (
        <a
          href={ending.ctaUrl}
          className="mt-4 inline-flex h-11 items-center rounded-full bg-[var(--cf-accent)] px-5 text-sm font-medium text-[var(--cf-accent-text)]"
        >
          {ending.ctaLabel}
        </a>
      )}
      {ending.redirectUrl && (
        <p className="mt-3 text-xs opacity-50">
          Taking you to the next step in {ending.redirectDelaySec ?? 5}s…
        </p>
      )}
    </div>
  );
}

/** Per-block composer. Every block type now has a real control. */
function Composer({
  chat,
  config,
}: {
  chat: ReturnType<typeof useChat>;
  config: PublicFormConfig;
}) {
  const [text, setText] = useState("");
  const [multi, setMulti] = useState<string[]>([]);
  const block = chat.question?.block;

  // Clear per-question local state when the question changes.
  useEffect(() => {
    setText("");
    setMulti([]);
  }, [block?.ref]);

  // Number keys pick options — a genuine speed-up on long choice lists.
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
        {chat.status === "connecting" ? "Connecting…" : " "}
      </p>
    );
  }

  const disabled = chat.status === "error";
  const uploadBase = chat.getUploadBase();
  const token = chat.getRespondentToken();

  const control = renderControl(block);
  const canSkip = config.allowSkip && !block.required;

  return (
    <div className="space-y-2.5">
      {chat.escalatedRef === block.ref && (
        <p className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--cf-accent)" }}>
          No problem — here&apos;s an easier way to answer.
        </p>
      )}
      {chat.validationHint && <p className="px-1 text-sm opacity-70">{chat.validationHint}</p>}

      {control}

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

  function renderControl(block: PublicBlock) {
    switch (block.type) {
      case "welcome":
      case "statement":
        return (
          <button
            type="button"
            disabled={disabled}
            onClick={() => void chat.sendStructured(block.ref, true, "")}
            className="h-11 w-full rounded-full bg-[var(--cf-accent)] text-sm font-medium text-[var(--cf-accent-text)] transition-transform active:scale-[0.98] motion-reduce:active:scale-100"
          >
            {block.buttonLabel || "Continue"}
          </button>
        );

      case "yes_no":
        return (
          <ComposerShell>
            <Chip shortcut={1} onClick={() => void chat.sendStructured(block.ref, true, (block.yesLabel ?? "Yes"))}>
              {(block.yesLabel ?? "Yes")}
            </Chip>
            <Chip shortcut={2} onClick={() => void chat.sendStructured(block.ref, false, (block.noLabel ?? "No"))}>
              {(block.noLabel ?? "No")}
            </Chip>
          </ComposerShell>
        );

      case "single_select":
      case "dropdown":
      case "picture_choice":
        return (
          <ComposerShell>
            {(block.options ?? []).map((o, i) => (
              <Chip
                key={o.id}
                shortcut={i + 1}
                disabled={disabled}
                onClick={() => void chat.sendStructured(block.ref, o.id, o.label)}
              >
                {o.label}
              </Chip>
            ))}
          </ComposerShell>
        );

      case "multi_select":
        return (
          <div className="space-y-2">
            <ComposerShell>
              {(block.options ?? []).map((o) => (
                <Chip
                  key={o.id}
                  selected={multi.includes(o.id)}
                  disabled={disabled}
                  onClick={() =>
                    setMulti((m) => (m.includes(o.id) ? m.filter((x) => x !== o.id) : [...m, o.id]))
                  }
                >
                  {o.label}
                </Chip>
              ))}
            </ComposerShell>
            <button
              type="button"
              disabled={multi.length === 0}
              onClick={() =>
                void chat.sendStructured(
                  block.ref,
                  multi,
                  multi.map((id) => (block.options ?? []).find((o) => o.id === id)?.label).join(", "),
                )
              }
              className="h-11 w-full rounded-full bg-[var(--cf-accent)] text-sm font-medium text-[var(--cf-accent-text)] transition-transform active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-40"
            >
              Continue{multi.length > 0 ? ` · ${multi.length}` : ""}
            </button>
          </div>
        );

      case "rating":
        return (
          <RatingComposer
            scale={block.scale ?? 5}
            shape={(block.shape as "star" | "heart" | "number") ?? "star"}
            onPick={(v, d) => void chat.sendStructured(block.ref, v, d)}
          />
        );

      case "nps":
        return (
          <ScaleComposer
            min={0}
            max={10}
            labelLow={block.labels?.low}
            labelHigh={block.labels?.high}
            onPick={(v, d) => void chat.sendStructured(block.ref, v, d)}
          />
        );

      case "opinion_scale": {
        const start = block.startAt ?? 1;
        const steps = block.steps ?? 5;
        return (
          <ScaleComposer
            min={start}
            max={start + steps - 1}
            labelLow={block.labels?.low}
            labelHigh={block.labels?.high}
            onPick={(v, d) => void chat.sendStructured(block.ref, v, d)}
          />
        );
      }

      case "date":
        return (
          <DateComposer
            min={block.minDate}
            max={block.maxDate}
            disablePast={block.disablePast}
            onPick={(iso, d) => void chat.sendStructured(block.ref, iso, d)}
          />
        );

      case "ranking":
        return (
          <RankingComposer
            items={block.items ?? []}
            onSubmit={(order, d) => void chat.sendStructured(block.ref, order, d)}
          />
        );

      case "matrix":
        return (
          <MatrixComposer
            rows={block.rows ?? []}
            columns={block.columns ?? []}
            multiple={block.multiplePerRow ?? false}
            onSubmit={(v, d) => void chat.sendStructured(block.ref, v, d)}
          />
        );

      case "contact_info":
      case "address":
        return (
          <FieldsComposer
            fields={block.fields ?? []}
            onSubmit={(v, d) => void chat.sendStructured(block.ref, v, d)}
          />
        );

      case "legal_consent":
        return (
          <div className="space-y-2">
            {block.consentText && (
              <p className="rounded-xl border border-[var(--cf-chip-border)] bg-[var(--cf-chip-bg)] px-3 py-2.5 text-sm">
                {block.consentText}
              </p>
            )}
            <ComposerShell>
              <Chip onClick={() => void chat.sendStructured(block.ref, true, "I agree")}>I agree</Chip>
            </ComposerShell>
          </div>
        );

      case "signature":
        return (
          <SignatureComposer
            requireName={block.drawnNameRequired ?? false}
            onSubmit={(dataUrl, name) =>
              void chat.sendStructured(block.ref, { dataUrl, signedName: name }, name ?? "Signed")
            }
          />
        );

      case "file_upload":
        return uploadBase && token ? (
          <FileUploadControl
            blockRef={block.ref}
            accept={block.accept ?? ["image/png"]}
            maxFiles={block.maxFiles ?? 1}
            maxSizeMB={block.maxSizeMB ?? 10}
            uploadBase={uploadBase}
            respondentToken={token}
            disabled={disabled}
          />
        ) : (
          <p className="text-sm opacity-50">Preparing upload…</p>
        );

      case "scheduling":
        return (
          <div className="space-y-2">
            <a
              href={block.url ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="flex h-11 items-center justify-center rounded-full bg-[var(--cf-accent)] text-sm font-medium text-[var(--cf-accent-text)]"
            >
              Open the calendar
            </a>
            <button
              type="button"
              onClick={() =>
                void chat.sendStructured(
                  block.ref,
                  { provider: "external", url: block.url ?? "", confirmedAt: Date.now() },
                  "Booked",
                )
              }
              className="w-full text-xs opacity-60 transition-opacity hover:opacity-100"
            >
              I&apos;ve booked a time →
            </button>
          </div>
        );

      case "payment":
        // Honest placeholder rather than "Payments are coming soon." presented
        // as if it were the control.
        return (
          <div className="rounded-2xl border border-dashed border-[var(--cf-chip-border)] px-4 py-5 text-center">
            <p className="text-sm">Payment collection isn&apos;t enabled on this form yet.</p>
            <button
              type="button"
              onClick={() => void chat.sendAction("skip")}
              className="mt-2 text-xs underline opacity-60"
            >
              Continue without paying
            </button>
          </div>
        );

      default:
        return (
          <SendRow onSend={submitText} disabled={disabled || !text.trim()}>
            <TextInput
              value={text}
              onChange={setText}
              onSubmit={submitText}
              autoFocus
              multiline={block.type === "long_text"}
              placeholder={block.placeholder || "Type your answer…"}
              type={block.type === "email" ? "email" : block.type === "number" ? "number" : "text"}
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
        );
    }
  }

  function submitText() {
    const value = text.trim();
    if (!value) return;
    setText("");
    void chat.send(value);
  }

}
