"use client";

import { Flag, Plus, ShieldAlert, X } from "lucide-react";
import type { FormDoc } from "@repo/form-schema";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/ui/info-hint";
import { Input } from "@/components/ui/input";
import { BufferedInput } from "@/components/ui/buffered-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { LockedControl } from "@/components/billing/gate";
import { Field, fieldInputClass } from "./fields";
import { RichDescription } from "./rich-description";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;

/**
 * The ending's settings, wherever you selected it from.
 *
 * This used to live inside `workflow-client`, which meant it only existed on
 * the canvas: clicking an ending in the Questions list selected it in the store
 * and the Build inspector — which only ever asked for the selected *block* —
 * drew "Nothing selected" beside it. One document, one selection, one panel, so
 * the panel is shared the way `BlockInspector` already is.
 */
export function EndingInspector({
  ending,
  doc,
  onChange,
}: {
  ending: FormDoc["endings"][number];
  doc: FormDoc;
  onChange: (d: FormDoc) => void;
}) {
  const screenOut = ending.kind === "screen_out";
  const patch = (fields: Partial<FormDoc["endings"][number]>) =>
    onChange({
      ...doc,
      endings: doc.endings.map((x) => (x.ref === ending.ref ? { ...x, ...fields } : x)),
    });

  /**
   * The last success ending cannot become a screen-out.
   *
   * `lintFormDoc` catches it and blocks publishing, but discovering that from
   * the publish button — two panels away from the toggle that caused it —
   * leaves the author looking for the mistake. A form where every outcome
   * refuses is never what somebody meant, so the control that would do it is
   * simply not available.
   */
  const otherSuccess = doc.endings.some((x) => x.ref !== ending.ref && x.kind !== "screen_out");

  const requirements = ending.requirements;
  const setRequirements = (next: FormDoc["endings"][number]["requirements"]) => patch({ requirements: next });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        {/* The same green/red the node and the list use, so the panel and the
            thing it is describing agree about which outcome this is. */}
        <div
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-lg",
            screenOut ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success",
          )}
        >
          {screenOut ? <ShieldAlert className="size-3.5" /> : <Flag className="size-3.5" />}
        </div>
        <p className="text-sm font-semibold">Ending</p>
      </div>

      <Field label="Outcome">
        <Select
          value={ending.kind}
          onValueChange={(v) => {
            const kind = v as FormDoc["endings"][number]["kind"];
            patch({
              kind,
              // Turning a refusal back into a thank-you leaves its requirement
              // list behind rather than deleting it, so flipping the picker by
              // accident is not destructive; it simply stops rendering.
              ...(kind === "screen_out" && ending.title === "Thank you!"
                ? { title: "You can't submit this form" }
                : {}),
            });
          }}
        >
          <SelectTrigger className={cn("w-full", fieldInputClass)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="success">Accept response</SelectItem>
            <SelectItem value="screen_out" disabled={!otherSuccess}>
              Turn them away
            </SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field label="Title">
        <BufferedInput
          value={ending.title}
          onCommit={(v) => patch({ title: v })}
          className={fieldInputClass}
        />
      </Field>

      <Field label="Message">
        <RichDescription key={ending.ref} value={ending.bodyMd} onChange={(v) => patch({ bodyMd: v })} ariaLabel="Message" />
      </Field>

      {screenOut && (
        <Field label="Requirements">
          <div className="space-y-1.5">
            {requirements.map((r, i) => (
              <div key={r.id} className="group flex items-center gap-1">
                <Input
                  className={cn("h-9 min-w-0 flex-1", fieldInputClass)}
                  value={r.label}
                  placeholder="A team of 2 to 5 people"
                  onChange={(e) =>
                    setRequirements(requirements.map((x) => (x.id === r.id ? { ...x, label: e.target.value } : x)))
                  }
                />
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove requirement ${i + 1}`}
                  onClick={() => setRequirements(requirements.filter((x) => x.id !== r.id))}
                  className="text-muted-foreground hover:text-destructive shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground -ml-2 justify-start"
              onClick={() =>
                setRequirements([...requirements, { id: uid("req"), label: "", when: null }])
              }
            >
              <Plus className="size-3.5" /> Add requirement
            </Button>
          </div>
        </Field>
      )}

      {/*
        Per ending, because that is how authors describe it: accepted teams go
        to the WhatsApp group, everyone else back to the site. The form-level
        setting in Settings stays as the default beneath every success ending —
        `toPublicEnding` prefers this one — so a form that wants a single
        destination still sets it once.

        Offered on a screen-out too, and deliberately: a refusal that sends
        somebody to the eligibility rules is a real thing to want. It just is
        not inherited from the completion setting, which is about finishing.
      */}
      <LockedControl feature="completion_redirect">
        <Field
          label="Redirect to"
          help={
            <InfoHint label="About this redirect">
              <p>
                Where someone goes once they reach this ending, so different
                outcomes can send people to different places.
              </p>
              <p className="mt-2">
                {screenOut
                  ? "Leave it empty to show this screen and stay put — a screen-out never inherits the form's completion redirect."
                  : "Leave it empty to fall back to the form's completion redirect in Settings, if it has one."}
              </p>
            </InfoHint>
          }
        >
          <BufferedInput
            value={ending.redirectUrl ?? ""}
            placeholder="https://example.com/welcome"
            onCommit={(v) => patch({ redirectUrl: v.trim() || undefined })}
            className={fieldInputClass}
          />
        </Field>
      </LockedControl>

      {ending.redirectUrl && (
        <Field label="Wait before redirecting (seconds)">
          <BufferedInput
            value={String(ending.redirectDelaySec)}
            inputMode="numeric"
            onCommit={(v) => {
              // Clamped to the schema's own range rather than trusted: the box
              // is free text, and a NaN here would fail the whole save.
              const n = Number.parseInt(v, 10);
              patch({ redirectDelaySec: Number.isFinite(n) ? Math.min(Math.max(n, 0), 120) : 5 });
            }}
            className={fieldInputClass}
          />
        </Field>
      )}
    </div>
  );
}
