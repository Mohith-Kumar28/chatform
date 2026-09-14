"use client";

import { Flag, Plus, ShieldAlert, X } from "lucide-react";
import type { Block, ConditionGroup, FormDoc, LogicRule } from "@repo/form-schema";
import { ConditionsEditor, type WhenGroup } from "../condition-editor";
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

      <SendThemHereWhen ending={ending} doc={doc} onChange={onChange} />

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

/**
 * Which finished responses land on this ending.
 *
 * The one rule in a form that is genuinely about an answer given earlier, and
 * until now the one with nowhere to live. A generated open mic form wanted
 * "audience members get the audience ending" and had only branches to say it
 * with — so it hung the test on the last question of the form, compared a
 * long-text answer against a sentence nobody would ever type, and sent every
 * attendee to "You're on the list to perform!". Nothing in the builder could
 * have shown the author that, because a branch row cannot say which question it
 * reads: it is always the question the branch hangs off.
 *
 * `doc.endingRules` is where the engine has always looked — `resolveEnding`
 * runs them against the whole answer set once the flow falls off the end — and
 * nothing had ever written one. They are safe in a way a hand-written branch is
 * not: `repairFlow` only ever rewrites `doc.logic`, so a rule here survives
 * adding, deleting, duplicating and reordering questions.
 *
 * Rules are read top to bottom and the first match wins, across every ending,
 * which is why the order is shown.
 *
 * Shown only when there is a rule to read, or when the linter says this ending
 * cannot be reached without one. Every ending carried this section for a
 * version — header, explanation, an "Add rule" button and the sentence
 * "Everyone who matches no other ending's rule" — on the ordinary ending that
 * needs none, which is most endings on most forms. That is a control panel for
 * the normal case: it made a form that was working look like a form with
 * something left to configure. The rule an author actually needs to see is the
 * one that exists, and the message they actually need is that an ending is
 * stranded, which `ending_unreachable` says on the node itself.
 */
function SendThemHereWhen({
  ending,
  doc,
  onChange,
}: {
  ending: FormDoc["endings"][number];
  doc: FormDoc;
  onChange: (d: FormDoc) => void;
}) {
  const isGoto = (r: LogicRule): r is Extract<LogicRule, { action_kind: "goto" }> => r.action_kind === "goto";
  const mine = doc.endingRules.filter((r) => isGoto(r) && r.target === ending.ref);
  /** Every question that could be tested, in the order they are asked. */
  const questions = doc.blocks.filter((b) => b.type !== "welcome" && b.type !== "statement") as Block[];

  /** This ending's place in the run-off, counting rules for every ending. */
  const orderOf = (id: string) => doc.endingRules.findIndex((r) => r.id === id) + 1;

  const setRules = (next: FormDoc["endingRules"]) => onChange({ ...doc, endingRules: next });

  const addRule = () =>
    setRules([
      ...doc.endingRules,
      {
        id: uid("rl"),
        action_kind: "goto",
        /*
         * No `from`. `applyLogicRules` only fires an unscoped goto when it is
         * resolving the ending, which is exactly when this should be read; a
         * `from` would scope it to one question and it would never run.
         */
        when: {
          op: "and",
          conditions: [{ left: { kind: "ref", ref: questions[0]?.ref ?? "" }, op: "eq" }],
          groups: [],
        } as ConditionGroup,
        target: ending.ref,
        targetKind: "ending",
      } as LogicRule,
    ]);

  const patchRule = (id: string, when: WhenGroup) =>
    setRules(doc.endingRules.map((r) => (r.id === id ? { ...r, when: when as ConditionGroup } : r)));

  /**
   * Nothing points at this ending, so a rule here is the way to fix it.
   *
   * The same test `ending_unreachable` runs, asked locally rather than read off
   * the lint pass, so the panel does not need the canvas's problem map to know
   * whether it has a job to do.
   */
  const isDefault = (doc.endings.find((e) => e.kind !== "screen_out") ?? doc.endings[0])?.ref === ending.ref;
  const pointedAt =
    isDefault ||
    [...doc.logic, ...doc.endingRules].some(
      (r) => r.action_kind === "goto" && (r.targetKind ?? "block") === "ending" && r.target === ending.ref,
    );

  // Nothing to read and nothing to fix: an ending that works needs no panel.
  if (mine.length === 0 && pointedAt) return null;

  return (
    <Field
      label="Send people here when"
      help={
        <InfoHint label="About ending rules">
          <p>
            Checked once every question is answered, so a rule here can read any
            answer in the form — not just the last one.
          </p>
          <p className="mt-2">Rules across all endings are read in order and the first match wins.</p>
        </InfoHint>
      }
    >
      <div className="space-y-2">
        {mine.length === 0 && (
          <p className="text-muted-foreground text-xs">
            Nothing sends anybody here yet, so no respondent will see this ending.
          </p>
        )}

        {mine.map((rule) => (
          <div key={rule.id} className="bg-muted/40 space-y-2 rounded-xl p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-medium tracking-wide uppercase">
                <span className="bg-background text-muted-foreground tabular flex size-4 items-center justify-center rounded text-[9px] font-semibold">
                  {orderOf(rule.id)}
                </span>
                If
              </span>
              <button
                type="button"
                onClick={() => setRules(doc.endingRules.filter((r) => r.id !== rule.id))}
                aria-label="Remove this rule"
                className="text-muted-foreground hover:text-destructive shrink-0"
              >
                <X className="size-3" />
              </button>
            </div>
            <ConditionsEditor
              compact
              sourceBlock={null}
              questions={questions}
              when={{ op: rule.when?.op ?? "and", conditions: rule.when?.conditions ?? [], groups: [] }}
              onChange={(next) => patchRule(rule.id, next)}
            />
          </div>
        ))}

        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground -ml-2 justify-start"
          onClick={addRule}
          disabled={questions.length === 0}
        >
          <Plus className="size-3.5" /> Add rule
        </Button>
      </div>
    </Field>
  );
}
