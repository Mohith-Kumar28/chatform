"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bug, Check, ChevronRight, ImagePlus, Lightbulb, Loader2, MessageSquareHeart, X } from "lucide-react";
import {
  BUG_SEVERITIES,
  BUILDER_FEEDBACK_AREAS,
  BUILDER_FEEDBACK_IMAGE_TYPES,
  BUILDER_FEEDBACK_MAX_IMAGES,
  BUILDER_FEEDBACK_MAX_IMAGE_BYTES,
  BUILDER_FEEDBACK_TEXT_MAX,
  FEATURE_IMPORTANCE,
  type BuilderFeedbackArea,
  type BuilderFeedbackKind,
} from "@repo/form-schema";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEntitlements } from "@/hooks/use-entitlements";
import { useModLabel } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import { FaceRating } from "./face-rating";
import { browserLabel, collectContext } from "./feedback-context";

/**
 * The panel behind the "?" button: a bug, a feature request, or feedback.
 *
 * Anchored above the button rather than a modal, so the screen they are writing
 * about stays in view while they write. A sheet on a phone.
 *
 * The draft lives in the launcher, not here, so closing the panel to look at
 * something and opening it again keeps what they typed. Switching kinds keeps
 * the main text too: somebody halfway through a bug who realises it is really a
 * missing feature should not have to type it again.
 */

export interface Attachment {
  id: string;
  file: File;
  url: string;
  /** Taken by the panel itself, as opposed to one they added. */
  auto: boolean;
}

export interface FeedbackDraft {
  kind: BuilderFeedbackKind;
  area: BuilderFeedbackArea;
  message: string;
  steps: string;
  expected: string;
  why: string;
  severity: string | null;
  importance: string | null;
  rating: number | null;
  attachments: Attachment[];
}

export const emptyDraft = (kind: BuilderFeedbackKind, area: BuilderFeedbackArea): FeedbackDraft => ({
  kind,
  area,
  message: "",
  steps: "",
  expected: "",
  why: "",
  severity: null,
  importance: null,
  rating: null,
  attachments: [],
});

const KINDS = [
  { value: "bug", label: "Bug", icon: Bug },
  { value: "feature", label: "Feature", icon: Lightbulb },
  { value: "feedback", label: "Feedback", icon: MessageSquareHeart },
] as const;

const COPY: Record<BuilderFeedbackKind, { title: string; lead: string; message: string; placeholder: string }> = {
  bug: {
    title: "Report a bug",
    lead: "Tell us what broke. A screenshot of this page is attached.",
    message: "What went wrong?",
    placeholder: "The export button spins and never downloads anything…",
  },
  feature: {
    title: "Request a feature",
    lead: "What would make chatform work better for you?",
    message: "What would you like?",
    placeholder: "Let me send results to Airtable…",
  },
  feedback: {
    title: "Share feedback",
    lead: "How is chatform working for you?",
    message: "Anything you'd like to tell us?",
    placeholder: "What you like, what gets in the way…",
  },
};

const AREA_GROUPS = ["Builder", "Dashboard", "Other"] as const;

export function FeedbackPanel({
  draft,
  onChange,
  capturing,
  onClose,
  onSubmit,
  onSent,
}: {
  draft: FeedbackDraft;
  onChange: (next: Partial<FeedbackDraft>) => void;
  /** The screenshot is still being taken. */
  capturing: boolean;
  onClose: () => void;
  onSubmit: () => Promise<{ ok: true } | { ok: false; error: string }>;
  /** After the receipt has been shown. */
  onSent: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const kmod = useModLabel();
  const { data: plan } = useEntitlements();
  const copy = COPY[draft.kind];

  // The panel takes focus itself: autofocusing a field would pop a tooltip or open the keyboard on a phone.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const canSend =
    !sending && !capturing && draft.message.trim().length > 0 && (draft.kind !== "feedback" || draft.rating !== null);

  const submit = useCallback(async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    const result = await onSubmit();
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSent(true);
  }, [canSend, onSubmit]);

  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(onSent, 2200);
    return () => clearTimeout(t);
  }, [sent, onSent]);

  const addFiles = useCallback(
    (files: File[]) => {
      const room = BUILDER_FEEDBACK_MAX_IMAGES - draft.attachments.length;
      const images = files.filter((f) => (BUILDER_FEEDBACK_IMAGE_TYPES as readonly string[]).includes(f.type));
      if (images.length === 0) {
        if (files.length) setError("Only images can be attached: PNG, JPEG, WebP or GIF.");
        return;
      }
      if (images.some((f) => f.size > BUILDER_FEEDBACK_MAX_IMAGE_BYTES)) {
        setError("Each image has to be under 5 MB.");
        return;
      }
      if (room <= 0) {
        setError(`Up to ${BUILDER_FEEDBACK_MAX_IMAGES} images.`);
        return;
      }
      setError(null);
      onChange({
        attachments: [
          ...draft.attachments,
          ...images.slice(0, room).map((file) => ({
            id: crypto.randomUUID(),
            file,
            url: URL.createObjectURL(file),
            auto: false,
          })),
        ],
      });
    },
    [draft.attachments, onChange],
  );

  const remove = (id: string) => {
    const gone = draft.attachments.find((a) => a.id === id);
    if (gone) URL.revokeObjectURL(gone.url);
    onChange({ attachments: draft.attachments.filter((a) => a.id !== id) });
  };

  const context = typeof window === "undefined" ? null : collectContext();

  return (
    <div
      ref={panelRef}
      data-feedback-ignore=""
      role="dialog"
      aria-label={copy.title}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          // Only when nothing inside (an open select) has claimed it first.
          if (e.defaultPrevented) return;
          e.preventDefault();
          e.stopPropagation();
          onClose();
        } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          e.stopPropagation();
          void submit();
        }
      }}
      onPaste={(e) => {
        const files = Array.from(e.clipboardData.files);
        if (files.length) {
          e.preventDefault();
          addFiles(files);
        }
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        addFiles(Array.from(e.dataTransfer.files));
      }}
      className={cn(
        "bg-popover text-popover-foreground fixed z-[var(--z-fab)] flex flex-col outline-none",
        "border-border border shadow-2xl",
        "animate-in fade-in-0 slide-in-from-bottom-2 duration-200 motion-reduce:animate-none",
        // A sheet on a phone, a card above the button everywhere else.
        "inset-x-0 bottom-0 max-h-[90svh] rounded-t-2xl",
        "sm:inset-x-auto sm:right-4 sm:bottom-[4.25rem] sm:max-h-[min(44rem,calc(100svh-6rem))] sm:w-[26rem] sm:rounded-2xl",
        dragging && "ring-brand-violet ring-2",
      )}
    >
      {sent ? (
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <div className="bg-primary text-primary-foreground grid size-12 place-items-center rounded-full">
            <Check className="size-6" strokeWidth={2.5} />
          </div>
          <p className="text-base font-medium">Thanks, this went straight to the team.</p>
          <p className="text-muted-foreground max-w-xs text-sm">
            A real person reads every one. If we need more, we&rsquo;ll reply by email.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3 px-5 pt-4">
            <div className="min-w-0">
              <h2 className="text-base font-semibold">{copy.title}</h2>
              <p className="text-muted-foreground mt-0.5 text-sm">{copy.lead}</p>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close" className="-mr-2 shrink-0">
              <X className="size-4" />
            </Button>
          </div>

          <div className="px-5 pt-3">
            <SegmentedControl
              size="sm"
              className="w-full"
              value={draft.kind}
              onChange={(kind) => onChange({ kind })}
              options={KINDS.map((k) => ({ value: k.value, label: k.label, icon: k.icon }))}
              ariaLabel="What kind of feedback"
            />
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pt-4 pb-4">
            {draft.kind === "feedback" && (
              <FaceRating value={draft.rating} onChange={(rating) => onChange({ rating })} />
            )}

            <Field label={copy.message} required>
              <Textarea
                value={draft.message}
                onChange={(e) => onChange({ message: e.target.value })}
                rows={draft.kind === "feedback" ? 3 : 4}
                maxLength={BUILDER_FEEDBACK_TEXT_MAX}
                placeholder={copy.placeholder}
                className="resize-none"
              />
            </Field>

            {draft.kind === "bug" && (
              <>
                <Field label="Steps to reproduce" hint="Optional">
                  <Textarea
                    value={draft.steps}
                    onChange={(e) => onChange({ steps: e.target.value })}
                    rows={3}
                    maxLength={BUILDER_FEEDBACK_TEXT_MAX}
                    placeholder={"1. Open Results\n2. Click Export"}
                    className="resize-none"
                  />
                </Field>
                <Field label="What did you expect?" hint="Optional">
                  <Textarea
                    value={draft.expected}
                    onChange={(e) => onChange({ expected: e.target.value })}
                    rows={2}
                    maxLength={BUILDER_FEEDBACK_TEXT_MAX}
                    className="resize-none"
                  />
                </Field>
                <Field label="How much is this getting in the way?">
                  <Chips
                    options={BUG_SEVERITIES}
                    value={draft.severity}
                    onChange={(severity) => onChange({ severity })}
                  />
                </Field>
              </>
            )}

            {draft.kind === "feature" && (
              <>
                <Field label="What problem would it solve?" hint="Optional">
                  <Textarea
                    value={draft.why}
                    onChange={(e) => onChange({ why: e.target.value })}
                    rows={3}
                    maxLength={BUILDER_FEEDBACK_TEXT_MAX}
                    placeholder="What you're trying to do, and what you do today instead"
                    className="resize-none"
                  />
                </Field>
                <Field label="How important is it to you?">
                  <Chips
                    options={FEATURE_IMPORTANCE}
                    value={draft.importance}
                    onChange={(importance) => onChange({ importance })}
                  />
                </Field>
              </>
            )}

            <Field label="Which part of chatform?">
              <Select value={draft.area} onValueChange={(area) => onChange({ area: area as BuilderFeedbackArea })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                {/* Above the panel: the select opens from inside it. */}
                <SelectContent data-feedback-ignore="">
                  {AREA_GROUPS.map((group) => (
                    <SelectGroup key={group}>
                      <SelectLabel>{group}</SelectLabel>
                      {Object.entries(BUILDER_FEEDBACK_AREAS)
                        .filter(([, a]) => a.group === group)
                        .map(([key, a]) => (
                          <SelectItem key={key} value={key}>
                            {a.label}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Screenshots" hint={`${draft.attachments.length} of ${BUILDER_FEEDBACK_MAX_IMAGES}`}>
              <div className="flex flex-wrap gap-2">
                {capturing && (
                  <div className="bg-muted text-muted-foreground flex h-16 w-24 items-center justify-center gap-1.5 rounded-lg text-xs">
                    <Loader2 className="size-3.5 animate-spin" />
                    Capturing
                  </div>
                )}
                {draft.attachments.map((a) => (
                  <div key={a.id} className="group border-border relative h-16 w-24 overflow-hidden rounded-lg border">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, nothing to optimise */}
                    <img src={a.url} alt={a.auto ? "Screenshot of this page" : a.file.name} className="size-full object-cover object-top" />
                    {a.auto && (
                      <span className="bg-background/85 absolute inset-x-0 bottom-0 truncate px-1 py-0.5 text-[10px] font-medium">
                        This page
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => remove(a.id)}
                      aria-label={a.auto ? "Remove the screenshot of this page" : `Remove ${a.file.name}`}
                      className="bg-background/90 text-foreground absolute top-1 right-1 grid size-5 place-items-center rounded-full shadow-sm"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
                {draft.attachments.length < BUILDER_FEEDBACK_MAX_IMAGES && (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className={cn(
                      "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 flex h-16 w-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs",
                      "transition-colors duration-[var(--duration-micro)]",
                    )}
                  >
                    <ImagePlus className="size-4" />
                    Add image
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept={BUILDER_FEEDBACK_IMAGE_TYPES.join(",")}
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addFiles(Array.from(e.target.files ?? []));
                    e.target.value = "";
                  }}
                />
              </div>
              <p className="text-muted-foreground mt-1.5 text-xs">You can also paste or drop images here.</p>
            </Field>

            {context && (
              <details className="group text-sm">
                <summary className="text-muted-foreground hover:text-foreground flex cursor-pointer list-none items-center gap-1 text-xs [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
                  Included with your report
                </summary>
                <dl className="text-muted-foreground mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt>Page</dt>
                  <dd className="text-foreground truncate">{context.page}</dd>
                  <dt>Browser</dt>
                  <dd className="text-foreground">{browserLabel()}</dd>
                  <dt>Window</dt>
                  <dd className="text-foreground">{context.viewport}</dd>
                  <dt>Plan</dt>
                  <dd className="text-foreground">{plan?.planName ?? "Loading"}</dd>
                  <dt>Your account</dt>
                  <dd className="text-foreground">Name, email and role, so we can reply</dd>
                  <dt>Recent errors</dt>
                  <dd className="text-foreground">{context.errors.length || "None"}</dd>
                </dl>
              </details>
            )}

            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>

          <div className="border-border flex items-center justify-end gap-2 border-t px-5 py-3">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={!canSend}>
              {sending ? <Loader2 className="size-4 animate-spin" /> : null}
              {sending ? "Sending" : "Send"}
              {!sending && (
                <Kbd tone="inverse" className="kbd-hint ml-1 hidden sm:inline-flex">{`${kmod}↵`}</Kbd>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">
          {label}
          {required && <span className="sr-only"> (required)</span>}
        </span>
        {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/** One choice from a short list, as chips; tapping the picked one clears it. */
function Chips({
  options,
  value,
  onChange,
}: {
  options: Record<string, string>;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      {Object.entries(options).map(([key, label]) => {
        const on = value === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(on ? null : key)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors duration-[var(--duration-micro)]",
              on
                ? "bg-brand-violet-soft text-brand-violet-soft-foreground border-transparent font-medium"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
