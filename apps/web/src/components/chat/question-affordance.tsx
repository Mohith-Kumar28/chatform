"use client";

import { useState } from "react";
import type { PublicBlock } from "@repo/form-schema";
import { Chip } from "./composers/primitives";
import { RatingComposer, ScaleComposer } from "./composers/rating";
import { DateComposer } from "./composers/date";
import { SignatureComposer } from "./composers/signature";
import { FieldsComposer, MatrixComposer, RankingComposer } from "./composers/structured";
import { FileUploadControl } from "./file-upload";

/**
 * The controls that belong to the current question, rendered **in the thread**
 * under the agent's message rather than replacing the composer.
 *
 * Replacing the input with chips said "you may only click" — but a person in a
 * chat expects to be able to type. Now the text box is always there, the
 * choices sit below the message as an offer, and either route works: tap a
 * chip, or write "weekly I guess" and let the agent read it.
 */
export function QuestionAffordance({
  block,
  disabled,
  uploadBase,
  respondentToken,
  onStructured,
  onSkip,
}: {
  block: PublicBlock;
  disabled?: boolean;
  uploadBase: string | null;
  respondentToken: string | null;
  onStructured: (value: unknown, display: string) => void;
  onSkip: () => void;
}) {
  const [multi, setMulti] = useState<string[]>([]);
  const options = block.options ?? [];

  switch (block.type) {
    case "welcome":
    case "statement":
      return (
        <Affordance>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onStructured(true, "")}
            className="h-10 rounded-full bg-[var(--cf-accent)] px-5 text-sm font-medium text-[var(--cf-accent-text)] transition-transform active:scale-[0.98] motion-reduce:active:scale-100"
          >
            {block.buttonLabel || "Continue"}
          </button>
        </Affordance>
      );

    case "yes_no":
      return (
        <Affordance>
          <Chip shortcut={1} onClick={() => onStructured(true, block.yesLabel ?? "Yes")}>
            {block.yesLabel ?? "Yes"}
          </Chip>
          <Chip shortcut={2} onClick={() => onStructured(false, block.noLabel ?? "No")}>
            {block.noLabel ?? "No"}
          </Chip>
        </Affordance>
      );

    case "single_select":
    case "dropdown":
    case "picture_choice":
      return (
        <Affordance>
          {options.map((o, i) => (
            <Chip key={o.id} shortcut={i + 1} disabled={disabled} onClick={() => onStructured(o.id, o.label)}>
              {o.label}
            </Chip>
          ))}
        </Affordance>
      );

    case "multi_select":
      return (
        <div className="space-y-2">
          <Affordance>
            {options.map((o) => (
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
          </Affordance>
          {multi.length > 0 && (
            <button
              type="button"
              onClick={() => {
                onStructured(multi, multi.map((id) => options.find((o) => o.id === id)?.label).join(", "));
                setMulti([]);
              }}
              className="h-9 rounded-full bg-[var(--cf-accent)] px-4 text-sm font-medium text-[var(--cf-accent-text)]"
            >
              Continue · {multi.length}
            </button>
          )}
        </div>
      );

    case "rating":
      return (
        <RatingComposer
          scale={block.scale ?? 5}
          shape={(block.shape as "star" | "heart" | "number") ?? "star"}
          onPick={onStructured}
        />
      );

    case "nps":
      return (
        <ScaleComposer
          min={0}
          max={10}
          labelLow={block.labels?.low}
          labelHigh={block.labels?.high}
          onPick={onStructured}
        />
      );

    case "opinion_scale": {
      const start = block.startAt ?? 1;
      return (
        <ScaleComposer
          min={start}
          max={start + (block.steps ?? 5) - 1}
          labelLow={block.labels?.low}
          labelHigh={block.labels?.high}
          onPick={onStructured}
        />
      );
    }

    case "date":
      return (
        <DateComposer
          min={block.minDate}
          max={block.maxDate}
          disablePast={block.disablePast}
          onPick={onStructured}
        />
      );

    case "ranking":
      return <RankingComposer items={block.items ?? []} onSubmit={onStructured} />;

    case "matrix":
      return (
        <MatrixComposer
          rows={block.rows ?? []}
          columns={block.columns ?? []}
          multiple={block.multiplePerRow ?? false}
          onSubmit={onStructured}
        />
      );

    case "contact_info":
    case "address":
      return <FieldsComposer fields={block.fields ?? []} onSubmit={onStructured} />;

    case "legal_consent":
      return (
        <div className="space-y-2">
          {block.consentText && (
            <p className="rounded-xl border border-[var(--cf-chip-border)] bg-[var(--cf-chip-bg)] px-3 py-2.5 text-sm">
              {block.consentText}
            </p>
          )}
          <Affordance>
            <Chip onClick={() => onStructured(true, "I agree")}>I agree</Chip>
          </Affordance>
        </div>
      );

    case "signature":
      return (
        <SignatureComposer
          requireName={block.drawnNameRequired ?? false}
          onSubmit={(dataUrl, name) => onStructured({ dataUrl, signedName: name }, name ?? "Signed")}
        />
      );

    case "file_upload":
      return uploadBase && respondentToken ? (
        <FileUploadControl
          blockRef={block.ref}
          accept={block.accept ?? ["image/png"]}
          maxFiles={block.maxFiles ?? 1}
          maxSizeMB={block.maxSizeMB ?? 10}
          uploadBase={uploadBase}
          respondentToken={respondentToken}
          disabled={disabled}
        />
      ) : null;

    case "scheduling":
      return (
        <Affordance>
          <a
            href={block.url ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="flex h-10 items-center rounded-full bg-[var(--cf-accent)] px-5 text-sm font-medium text-[var(--cf-accent-text)]"
          >
            Open the calendar
          </a>
          <Chip
            onClick={() =>
              onStructured(
                { provider: "external", url: block.url ?? "", confirmedAt: Date.now() },
                "Booked",
              )
            }
          >
            I&apos;ve booked
          </Chip>
        </Affordance>
      );

    case "payment":
      return (
        <div className="rounded-2xl border border-dashed border-[var(--cf-chip-border)] px-4 py-4 text-center text-sm">
          <p>Payment collection isn&apos;t enabled on this form yet.</p>
          <button type="button" onClick={onSkip} className="mt-1.5 text-xs underline opacity-60">
            Continue without paying
          </button>
        </div>
      );

    // short_text, long_text, email, phone, url, number — the composer is the
    // whole affordance; nothing extra belongs in the thread.
    default:
      return null;
  }
}

function Affordance({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}
