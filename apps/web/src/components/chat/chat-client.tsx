"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicBlock, PublicFormConfig } from "@repo/form-schema";
import { useChat } from "./use-chat";
import { chatThemeVars } from "@/lib/chat-theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:8787";

export function ChatClient({
  config,
  embed,
  existingSession,
  previewMode,
}: {
  config: PublicFormConfig;
  embed?: boolean;
  existingSession?: { sessionId: string; token: string; eventsUrl: string } | null;
  /** Embedded in the builder preview — fills the container instead of the viewport. */
  previewMode?: boolean;
}) {
  const { messages, question, ending, status, error, escalatedRef, validationHint, uploadSpec, getUploadBase, getRespondentToken, send, sendStructured, sendAction } = useChat({
    slug: config.slug,
    apiOrigin: API_ORIGIN,
    existingSession,
  });

  return (
    <div
      className={`chat-surface flex flex-col ${previewMode ? "h-full min-h-0" : "min-h-svh"}`}
      style={chatThemeVars(config.theme)}
    >
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div
            className="flex size-8 items-center justify-center rounded-lg text-sm font-bold text-white"
            style={{ background: "var(--cf-accent)" }}
          >
            {config.title.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: config.theme.text }}>
              {config.title}
            </p>
            {config.progressBar === "percent" && (
              <p className="text-muted-foreground text-xs">
                {question ? `${question.progress.pct}% complete` : status === "ended" ? "Complete" : ""}
              </p>
            )}
          </div>
        </div>
        {embed && (
          <button
            onClick={() => window.parent?.postMessage("chatform:close", "*")}
            className="text-muted-foreground hover:text-foreground text-lg leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        )}
      </header>

      <main className="flex-1 space-y-4 overflow-y-auto px-5 pb-6">
        {status === "connecting" && (
          <div className="flex items-center gap-1.5 px-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="size-2 animate-bounce rounded-full bg-neutral-400"
                style={{ animationDelay: `${i * 120}ms` }}
              />
            ))}
          </div>
        )}

        {messages.map((m) => (
          <Bubble key={m.id} role={m.role} streaming={m.streaming} theme={config.theme}>
            {m.text}
          </Bubble>
        ))}

        {ending && (
          <div className="rounded-2xl border p-6 text-center" style={{ borderColor: config.theme.accent }}>
            <p className="font-display text-xl font-semibold" style={{ color: config.theme.text }}>
              {ending.title}
            </p>
            {ending.bodyMd && <p className="text-muted-foreground mt-2 text-sm">{ending.bodyMd}</p>}
          </div>
        )}

        {status === "error" && (
          <div className="text-destructive rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            {error ?? "Something went wrong."}{" "}
            <button className="underline" onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        )}

        <div className="h-2" />
      </main>

      {question && !ending && (
        <footer className="sticky bottom-0 border-t bg-[var(--cf-bg)] px-5 py-4">
          <Composer
            block={question.block}
            disabled={status !== "ready"}
            escalated={escalatedRef === question.block.ref}
            canSkip={(config.allowSkip || escalatedRef === question.block.ref) && !question.block.required}
            validationHint={validationHint}
            uploadBase={getUploadBase()}
            respondentToken={getRespondentToken()}
            onText={send}
            onStructured={sendStructured}
            onSkip={() => sendAction("skip")}
          />
        </footer>
      )}

      {!config.brandingHidden && (
        <div className="pb-3 text-center">
          <a href="/" target="_blank" rel="noreferrer" className="text-muted-foreground text-xs hover:underline">
            Powered by chatform
          </a>
        </div>
      )}
    </div>
  );
}

function Bubble({
  role,
  streaming,
  theme,
  children,
}: {
  role: "assistant" | "user";
  streaming?: boolean;
  theme: PublicFormConfig["theme"];
  children: React.ReactNode;
}) {
  const isUser = role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap",
          streaming && "after:inline-block after:content-['▍']",
        )}
        style={{
          borderRadius: "var(--cf-radius)",
          ...(isUser
            ? { background: "var(--cf-user-bubble)", color: "var(--cf-user-bubble-text)" }
            : { background: "var(--cf-bot-bubble)", color: theme.text, border: `1px solid ${theme.background === "#faf7f2" ? "oklch(0.9 0.012 75)" : "transparent"}` }),
        }}
      >
        {children}
      </div>
    </div>
  );
}

const ESCALATION_HINTS: Partial<Record<PublicBlock["type"], string>> = {
  email: "Try something like you@company.com",
  phone: "Include the country code, e.g. +1 555 000 1234",
  url: "Include https:// at the start",
  number: "Just the digits, e.g. 42",
  date: "Use YYYY-MM-DD",
};

/** Structured blocks that also accept free-typed answers (the agent parses them). */
const structuredTypes = ["yes_no", "single_select", "multi_select", "dropdown", "picture_choice", "rating", "nps", "opinion_scale"];

function Composer({
  block,
  disabled,
  escalated,
  canSkip,
  validationHint,
  uploadBase,
  respondentToken,
  onText,
  onStructured,
  onSkip,
}: {
  block: PublicBlock;
  disabled: boolean;
  escalated: boolean;
  canSkip: boolean;
  validationHint: string | null;
  uploadBase: string | null;
  respondentToken: string | null;
  onText: (t: string) => void;
  onStructured: (ref: string, value: unknown, display?: string) => void;
  onSkip: () => void;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [block.ref]);

  const submitText = () => {
    const t = text.trim();
    if (!t) return;
    onText(t);
    setText("");
  };

  // structured renderers
  let control: React.ReactNode;
  if (["single_select", "multi_select", "dropdown", "picture_choice"].includes(block.type) && block.options) {
    const multi = block.type === "multi_select";
    control = <OptionGrid block={block} disabled={disabled} multi={multi} onStructured={onStructured} />;
  } else if (block.type === "yes_no") {
    control = (
      <div className="flex gap-2">
        <Chip disabled={disabled} onClick={() => onStructured(block.ref, true, block.yesLabel ?? "Yes")}>
          {block.yesLabel ?? "Yes"}
        </Chip>
        <Chip disabled={disabled} onClick={() => onStructured(block.ref, false, block.noLabel ?? "No")}>
          {block.noLabel ?? "No"}
        </Chip>
      </div>
    );
  } else if (block.type === "rating" && block.scale) {
    control = (
      <div className="flex gap-1.5">
        {Array.from({ length: block.scale }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            disabled={disabled}
            onClick={() => onStructured(block.ref, n, `${n}/${block.scale}`)}
            className="text-2xl transition-transform hover:scale-125 disabled:opacity-50"
            aria-label={`Rate ${n}`}
          >
            {block.shape === "heart" ? "🧡" : "⭐"}
          </button>
        ))}
      </div>
    );
  } else if (block.type === "nps" || block.type === "opinion_scale") {
    const start = block.type === "nps" ? 0 : (block.startAt ?? 1);
    const end = block.type === "nps" ? 10 : start + (block.steps ?? 10) - 1;
    control = (
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: end - start + 1 }, (_, i) => start + i).map((n) => (
          <Chip key={n} disabled={disabled} onClick={() => onStructured(block.ref, n, String(n))}>
            {n}
          </Chip>
        ))}
      </div>
    );
  } else if (block.type === "long_text") {
    control = (
      <div className="space-y-2">
        <Textarea
          disabled={disabled}
          placeholder={block.placeholder ?? "Type your answer…"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitText();
          }}
          rows={3}
        />
        <Button disabled={disabled || !text.trim()} onClick={submitText} className="rounded-full">
          Send
        </Button>
      </div>
    );
  } else if (block.type === "file_upload" || block.type === "signature") {
    control = uploadBase && respondentToken ? (
      <FileUploadControl
        block={block}
        disabled={disabled}
        uploadBase={uploadBase}
        respondentToken={respondentToken}
        onSubmit={() => {
          /* the confirm endpoint records the answer server-side; SSE drives the UI */
        }}
      />
    ) : (
      <p className="text-muted-foreground text-sm">Connecting…</p>
    );
  } else if (block.type === "payment") {
    control = <p className="text-muted-foreground text-sm">Payments are coming soon.</p>;
  } else {
    // default: text input
    const isEmail = block.type === "email";
    const isNumber = block.type === "number";
    control = (
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submitText();
        }}
      >
        <Input
          ref={inputRef}
          disabled={disabled}
          type={isEmail ? "email" : isNumber ? "number" : "text"}
          inputMode={isNumber ? "decimal" : undefined}
          placeholder={block.placeholder ?? "Type your answer…"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="rounded-full"
          autoFocus
        />
        <Button type="submit" disabled={disabled || !text.trim()} className="rounded-full px-5">
          Send
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-2.5">
      {escalated && (
        <div className="flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm" style={{ borderColor: "var(--cf-accent)", background: "var(--cf-bot-bubble)", color: "var(--cf-accent)" }}>
          <span aria-hidden>💡</span>
          <span>
            No worries — here&apos;s an easier way to answer.
            {ESCALATION_HINTS[block.type] && (
              <span className="text-muted-foreground"> {ESCALATION_HINTS[block.type]}</span>
            )}
          </span>
        </div>
      )}
      {control}
      {structuredTypes.includes(block.type) && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submitText();
          }}
        >
          <Input
            ref={inputRef}
            disabled={disabled}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="…or just type your answer"
            className="rounded-full"
          />
          <Button type="submit" disabled={disabled || !text.trim()} className="rounded-full px-4" size="sm">
            Send
          </Button>
        </form>
      )}
      {validationHint && !escalated && (
        <p className="text-xs" style={{ color: "var(--cf-accent)" }}>{validationHint}</p>
      )}
      {canSkip && (
        <button
          disabled={disabled}
          onClick={onSkip}
          className="text-muted-foreground text-xs hover:underline disabled:opacity-50"
        >
          Skip this question →
        </button>
      )}
    </div>
  );
}

function OptionGrid({
  block,
  disabled,
  multi,
  onStructured,
}: {
  block: PublicBlock;
  disabled: boolean;
  multi: boolean;
  onStructured: (ref: string, value: unknown, display?: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const options: { id: string; label: string; description?: string; imageKey?: string | null }[] = block.options ?? [];

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : multi ? [...prev, id] : [id]));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = selected.includes(o.id);
          return (
            <button
              key={o.id}
              disabled={disabled}
              onClick={() => (multi ? toggle(o.id) : onStructured(block.ref, o.id, o.label))}
              className={cn(
                "rounded-full border px-4 py-2.5 text-sm font-medium transition-all disabled:opacity-50",
                active ? "text-white" : "bg-[var(--cf-bot-bubble)] hover:border-[var(--cf-accent)]",
              )}
              style={active ? { background: "var(--cf-accent)", borderColor: "var(--cf-accent)" } : undefined}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {multi && (
        <Button
          disabled={disabled || selected.length === 0}
          onClick={() => {
            const labels = options.filter((o) => selected.includes(o.id)).map((o) => o.label);
            onStructured(block.ref, selected, labels.join(", "));
            setSelected([]);
          }}
          className="rounded-full"
          size="sm"
        >
          Continue
        </Button>
      )}
    </div>
  );
}

function Chip({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick?: () => void }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="bg-[var(--cf-bot-bubble)] hover:border-[var(--cf-accent)] rounded-full border px-5 py-2.5 text-sm font-medium transition-all disabled:opacity-50"
    >
      {children}
    </button>
  );
}


function FileUploadControl({
  block,
  disabled,
  uploadBase,
  respondentToken,
  onSubmit,
}: {
  block: PublicBlock;
  disabled: boolean;
  uploadBase: string;
  respondentToken: string;
  onSubmit: (files: { fileId: string; filename: string; mime: string; size: number; r2Key: string }[]) => void;
}) {
  const [files, setFiles] = useState<{ fileId: string; filename: string; mime: string; size: number; r2Key: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const maxFiles = block.maxFiles ?? 1;

  const pick = async (input: HTMLInputElement) => {
    setError(null);
    setUploading(true);
    try {
      for (const f of Array.from(input.files ?? [])) {
        if (files.length >= maxFiles) break;
        const intent = await fetch(`${uploadBase}/intent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-respondent-token": respondentToken },
          body: JSON.stringify({ ref: block.ref, filename: f.name, mime: f.type || "application/octet-stream", size: f.size }),
        });
        const body = (await intent.json()) as { fileId?: string; uploadUrl?: string; error?: { message: string } };
        if (!intent.ok || !body.fileId) throw new Error(body.error?.message ?? "Upload rejected");
        const put = await fetch(`${API_ORIGIN}${body.uploadUrl}`, { method: "PUT", headers: { "content-type": f.type || "application/octet-stream", "x-respondent-token": respondentToken }, body: f });
        if (!put.ok) throw new Error("Upload failed");
        const confirm = await fetch(`${API_ORIGIN}${body.uploadUrl}/confirm`, { method: "POST", headers: { "x-respondent-token": respondentToken } });
        const confirmed = (await confirm.json()) as { ok?: boolean; file?: { r2Key: string } };
        if (!confirm.ok || !confirmed.ok) throw new Error("Upload confirmation failed");
        setFiles((prev) => [...prev, { fileId: body.fileId!, filename: f.name, mime: f.type, size: f.size, r2Key: confirmed.file!.r2Key }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      input.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <label className={cn(
        "flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border border-dashed px-4 py-6 text-sm transition-colors hover:border-[var(--cf-accent)]",
        disabled && "pointer-events-none opacity-50",
      )}>
        <span className="text-lg">📎</span>
        <span>{uploading ? "Uploading…" : `Choose file${maxFiles > 1 ? "s" : ""} (max ${block.maxSizeMB ?? 10}MB)`}</span>
        <input
          type="file"
          className="hidden"
          accept={(block.accept ?? []).join(",")}
          multiple={(block.maxFiles ?? 1) > 1}
          disabled={disabled || uploading}
          onChange={(e) => void pick(e.target)}
        />
      </label>
      {error && <p className="text-destructive text-xs">{error}</p>}
      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((f) => (
            <div key={f.fileId} className="flex items-center justify-between rounded-lg border px-3 py-1.5 text-xs">
              <span className="truncate">{f.filename}</span>
              <span className="text-muted-foreground">{Math.round(f.size / 1024)}KB</span>
            </div>
          ))}
          <Button
            disabled={disabled || uploading}
            onClick={() => {
              onSubmit(files);
              setFiles([]);
            }}
            className="rounded-full"
            size="sm"
          >
            Send {files.length > 1 ? `${files.length} files` : "file"}
          </Button>
        </div>
      )}
    </div>
  );
}
