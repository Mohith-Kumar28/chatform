"use client";

import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import type { FormDoc } from "@repo/form-schema";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveOrg } from "@/hooks/use-active-org";
import { cn } from "@/lib/utils";
import { FollowUpAddressDialog } from "./followup-address-dialog";
import { FollowUpEmailPreview } from "./followup-email-preview";

type FollowUp = FormDoc["settings"]["followUp"];
type Step = FollowUp["steps"][number];

/**
 * Delays as choices, floored at two hours.
 *
 * A free-text box would invite the "send within the hour" advice that vendor
 * blogs repeat and the two randomised trials on the subject both contradict:
 * messages inside the first hour did worse than sending nothing, because they
 * mostly reach people who were coming back anyway.
 */
const DELAY_CHOICES = [
  { hours: 2, label: "2 hours later" },
  { hours: 4, label: "4 hours later" },
  { hours: 8, label: "8 hours later" },
  { hours: 24, label: "1 day later" },
  { hours: 48, label: "2 days later" },
  { hours: 72, label: "3 days later" },
  { hours: 168, label: "1 week later" },
] as const;

/**
 * Default copy by position.
 *
 * The last one says it is the last one, which is not politeness: telling people
 * a sequence is ending measurably reduces unsubscribes, and the third message
 * is the one most likely to earn one.
 */
const DEFAULT_BODIES = [
  "Everything you answered is saved, and picking up where you left off takes about a minute.",
  "Just a nudge in case it slipped. Your answers are still here whenever you're ready.",
  "This is the last one we'll send. Your answers are saved if you'd still like to finish.",
];

const THIRD_STEP: Step = {
  delayHours: 72,
  subject: "Last reminder about {{form.title}}",
  bodyMd: DEFAULT_BODIES[2]!,
};

export function FollowUpPanel({
  settings,
  hiddenFields,
  formTitle,
  onChange,
}: {
  settings: FormDoc["settings"];
  hiddenFields: FormDoc["hiddenFields"];
  /** Resolves `{{form.title}}` in the preview, so it reads as a sentence. */
  formTitle: string;
  onChange: (next: FormDoc["settings"]) => void;
}) {
  const followUp = settings.followUp;
  const { org } = useActiveOrg();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [askAddress, setAskAddress] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  /** Set the moment the dialog saves, so the switch flips without a refetch. */
  const [justSaved, setJustSaved] = useState<string | null>(null);

  const stored = (org as { postalAddress?: string | null } | undefined)?.postalAddress;
  const hasAddress = Boolean((justSaved ?? stored)?.trim());

  const patch = (p: Partial<FollowUp>) => onChange({ ...settings, followUp: { ...followUp, ...p } });

  /**
   * Reminders are kept in the order they go out.
   *
   * Position is not cosmetic here — the scheduler numbers each step by its
   * index, so "step 2" means the second message a respondent receives. Letting
   * a one-week reminder sit above a two-hour one would make the list disagree
   * with what actually happens, and the author would be reading the sequence
   * backwards while editing it.
   *
   * `sort` is stable, so two steps sharing a delay keep the order they were
   * added in rather than swapping under the cursor.
   */
  const sortByDelay = (steps: Step[]) => [...steps].sort((a, b) => a.delayHours - b.delayHours);

  function setStep(i: number, p: Partial<Step>) {
    const next = followUp.steps.map((s, j) => (i === j ? { ...s, ...p } : s));
    if (p.delayHours === undefined) return patch({ steps: next });

    // Re-sorting moves the row being edited, so the open message panel has to
    // move with it — otherwise changing a delay silently expands a different
    // reminder.
    const edited = next[i]!;
    const sorted = sortByDelay(next);
    if (expanded === i) setExpanded(sorted.indexOf(edited));
    patch({ steps: sorted });
  }

  /**
   * Turning it on, with the address requirement in the way.
   *
   * The switch does not move until there is an address — asking afterwards
   * would leave a form that looks armed and sends nothing, which is the exact
   * failure the server-side check produces and the reason it needs a
   * counterpart here.
   *
   * Steps written before this feature had default copy are filled in on the way
   * through. They were empty, so nothing is overwritten.
   */
  function enable() {
    patch({
      enabled: true,
      steps: sortByDelay(followUp.steps).map((s, i) =>
        s.bodyMd ? s : { ...s, bodyMd: DEFAULT_BODIES[i] ?? "" },
      ),
    });
  }

  function onToggle(next: boolean) {
    if (!next) return patch({ enabled: false });
    if (!hasAddress) return setAskAddress(true);
    enable();
  }

  // A form switched on before the address was required would otherwise sit here
  // looking armed while the server quietly refuses to schedule anything.
  const stalled = followUp.enabled && !hasAddress;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border">
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium">Send follow-up emails</p>
            {stalled && (
              <button
                type="button"
                className="text-primary mt-0.5 text-xs underline underline-offset-4"
                onClick={() => setAskAddress(true)}
              >
                Add your business address to start sending
              </button>
            )}
          </div>
          {/*
            `checked` follows the saved setting, not whether it can actually
            send. A form switched on before the address was required must still
            look switched on — otherwise the only way to turn it off is to first
            satisfy a requirement you are trying to walk away from.
          */}
          <Switch checked={followUp.enabled} onCheckedChange={onToggle} />
        </div>

        {followUp.enabled && hasAddress && (
          <div className="flex items-center justify-between gap-4 border-t px-4 py-3">
            <p className="text-sm">Send replies to</p>
            <Input
              className="h-8 max-w-56"
              value={followUp.replyTo ?? ""}
              placeholder="you@company.com"
              onChange={(e) => patch({ replyTo: e.target.value || undefined })}
            />
          </div>
        )}
      </div>

      {followUp.enabled && hasAddress && (
        <>
          <div className="rounded-xl border">
            {followUp.steps.map((step, i) => (
              <div key={i}>
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <Select
                    value={String(step.delayHours)}
                    onValueChange={(v) => setStep(i, { delayHours: Number(v) })}
                  >
                    <SelectTrigger className="h-8 w-36 shrink-0 border-0 bg-transparent px-2 text-xs shadow-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DELAY_CHOICES.map((d) => (
                        <SelectItem key={d.hours} value={String(d.hours)}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-8 flex-1 border-0 bg-transparent px-2 text-sm shadow-none"
                    value={step.subject}
                    placeholder="Subject"
                    onChange={(e) => setStep(i, { subject: e.target.value })}
                  />
                  <button
                    type="button"
                    aria-label={expanded === i ? "Hide message" : "Edit message"}
                    className="text-muted-foreground hover:text-foreground shrink-0 p-1"
                    onClick={() => setExpanded(expanded === i ? null : i)}
                  >
                    <ChevronDown
                      className={cn("size-4 transition-transform", expanded === i && "rotate-180")}
                    />
                  </button>
                  {followUp.steps.length > 1 && (
                    <button
                      type="button"
                      aria-label="Remove"
                      className="text-muted-foreground hover:text-foreground shrink-0 p-1"
                      onClick={() => {
                        patch({ steps: followUp.steps.filter((_, j) => j !== i) });
                        setExpanded(null);
                      }}
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
                {expanded === i && (
                  <div className="space-y-2 px-3 pb-3 sm:pl-[10.25rem]">
                    <Textarea
                      className="min-h-16 text-sm"
                      value={step.bodyMd}
                      placeholder="Message"
                      onChange={(e) => setStep(i, { bodyMd: e.target.value })}
                    />
                    <FollowUpEmailPreview
                      subject={step.subject}
                      body={step.bodyMd}
                      formTitle={formTitle}
                      showProgress={followUp.showProgress}
                      postalAddress={stored}
                    />
                  </div>
                )}
              </div>
            ))}

            {followUp.steps.length < 3 && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground w-full px-3 py-2.5 text-left text-sm"
                onClick={() => patch({ steps: sortByDelay([...followUp.steps, THIRD_STEP]) })}
              >
                + Add another
              </button>
            )}
          </div>

          <button
            type="button"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            <ChevronDown
              className={cn("size-3.5 transition-transform", showAdvanced && "rotate-180")}
            />
            Advanced
          </button>

          {showAdvanced && (
            <div className="divide-border/60 divide-y rounded-xl border">
              <Row label="Show how far they got" hint="“You answered 3 of 7” at the top.">
                <Switch
                  checked={followUp.showProgress}
                  onCheckedChange={(showProgress) => patch({ showProgress })}
                />
              </Row>
              <Row
                label="Skip a few people on purpose"
                hint="See how many would have come back anyway."
              >
                <Select
                  value={String(followUp.holdoutPercent)}
                  onValueChange={(v) => patch({ holdoutPercent: Number(v) })}
                >
                  <SelectTrigger className="h-8 w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Off</SelectItem>
                    <SelectItem value="5">5%</SelectItem>
                    <SelectItem value="10">10%</SelectItem>
                    <SelectItem value="20">20%</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
              {hiddenFields.length > 0 && (
                <Row label="Address from a hidden field" hint="Only if they never typed one.">
                  <Select
                    value={followUp.addressField ?? "__none"}
                    onValueChange={(v) => patch({ addressField: v === "__none" ? undefined : v })}
                  >
                    <SelectTrigger className="h-8 w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">None</SelectItem>
                      {hiddenFields.map((f) => (
                        <SelectItem key={f.name} value={f.name}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Row>
              )}
            </div>
          )}
        </>
      )}

      {org?.id && (
        <FollowUpAddressDialog
          open={askAddress}
          onOpenChange={setAskAddress}
          organizationId={org.id}
          onSaved={(address) => {
            setJustSaved(address);
            enable();
          }}
        />
      )}
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>
      </div>
      {children}
    </div>
  );
}
