"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
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

/**
 * The follow-up sequence editor.
 *
 * Deliberately short. An author here has already decided they want reminders;
 * what they need is the schedule and the words, not an explanation of why the
 * feature exists. Everything that is a constraint rather than a choice —
 * the address requirement, the three-step cap — appears only at the moment it
 * actually applies, and everything a first-time author will never change is
 * behind Advanced.
 */

type FollowUp = FormDoc["settings"]["followUp"];
type Step = FollowUp["steps"][number];

/**
 * Delays as choices, floored at two hours.
 *
 * A free-text minutes box would invite the "send it within the hour" advice
 * that vendor blogs repeat and that the two randomised trials on the subject
 * both contradict — messages inside the first hour did worse than sending
 * nothing, because they mostly catch people who were coming back anyway.
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
 * What a third reminder says.
 *
 * Naming it as the last one is not politeness — telling people the sequence is
 * ending measurably reduces unsubscribes, and this is the message most likely
 * to earn one.
 */
const THIRD_STEP: Step = {
  delayHours: 72,
  subject: "Last reminder about {{form.title}}",
  bodyMd:
    "This is the last one we'll send. Your answers are saved if you'd still like to finish.",
};

export function FollowUpPanel({
  settings,
  hiddenFields,
  onChange,
}: {
  settings: FormDoc["settings"];
  hiddenFields: FormDoc["hiddenFields"];
  onChange: (next: FormDoc["settings"]) => void;
}) {
  const followUp = settings.followUp;
  const { org } = useActiveOrg();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const postalAddress = (org as { postalAddress?: string | null } | undefined)?.postalAddress;
  /**
   * Nothing sends without a postal address — the server refuses to schedule.
   * So the switch is blocked rather than the consequence being explained in a
   * paragraph underneath it: a rule enforced on the server and merely described
   * in the UI is a rule authors discover by wondering why nothing happened.
   */
  const addressMissing = !postalAddress?.trim();

  const patch = (p: Partial<FollowUp>) => onChange({ ...settings, followUp: { ...followUp, ...p } });
  const setStep = (i: number, p: Partial<Step>) =>
    patch({ steps: followUp.steps.map((s, j) => (i === j ? { ...s, ...p } : s)) });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border">
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <p className="text-sm font-medium">Send follow-up emails</p>
          <Switch
            checked={followUp.enabled}
            disabled={addressMissing}
            onCheckedChange={(enabled) => patch({ enabled })}
          />
        </div>

        {addressMissing && (
          <div className="border-t px-4 py-3 text-xs leading-relaxed">
            <span className="text-muted-foreground">
              Add your business address first — the law requires one at the bottom of
              reminder emails.
            </span>{" "}
            <Link
              href="/settings/general"
              className="text-foreground font-medium underline underline-offset-4"
            >
              Add it now
            </Link>
          </div>
        )}

        {followUp.enabled && (
          <div className="flex items-center justify-between gap-4 border-t px-4 py-3.5">
            <p className="text-sm font-medium">Send replies to</p>
            <Input
              className="max-w-xs"
              value={followUp.replyTo ?? ""}
              placeholder="you@company.com"
              onChange={(e) => patch({ replyTo: e.target.value || undefined })}
            />
          </div>
        )}
      </div>

      {followUp.enabled && (
        <>
          <div className="space-y-3">
            {followUp.steps.map((step, i) => (
              <div key={i} className="space-y-2.5 rounded-xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <Select
                    value={String(step.delayHours)}
                    onValueChange={(v) => setStep(i, { delayHours: Number(v) })}
                  >
                    <SelectTrigger className="w-40">
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
                  {followUp.steps.length > 1 && (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground text-xs"
                      onClick={() => patch({ steps: followUp.steps.filter((_, j) => j !== i) })}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <Input
                  value={step.subject}
                  placeholder="Subject"
                  onChange={(e) => setStep(i, { subject: e.target.value })}
                />
                <Textarea
                  className="min-h-16"
                  value={step.bodyMd}
                  placeholder="Message"
                  onChange={(e) => setStep(i, { bodyMd: e.target.value })}
                />
              </div>
            ))}

            {followUp.steps.length < 3 && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground w-full rounded-xl border border-dashed py-2.5 text-sm"
                onClick={() => patch({ steps: [...followUp.steps, THIRD_STEP] })}
              >
                Add another
              </button>
            )}
          </div>

          <button
            type="button"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            <ChevronDown
              className={`size-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
            />
            Advanced
          </button>

          {showAdvanced && (
            <div className="divide-border/60 divide-y rounded-xl border">
              <AdvancedRow
                label="Show how far they got"
                hint="“You answered 3 of 7” at the top of the email."
              >
                <Switch
                  checked={followUp.showProgress}
                  onCheckedChange={(showProgress) => patch({ showProgress })}
                />
              </AdvancedRow>

              <AdvancedRow
                label="Skip a few people on purpose"
                hint="Sends nothing to this share, so you can see how many would have come back anyway."
              >
                <Select
                  value={String(followUp.holdoutPercent)}
                  onValueChange={(v) => patch({ holdoutPercent: Number(v) })}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Off</SelectItem>
                    <SelectItem value="5">5%</SelectItem>
                    <SelectItem value="10">10%</SelectItem>
                    <SelectItem value="20">20%</SelectItem>
                  </SelectContent>
                </Select>
              </AdvancedRow>

              {hiddenFields.length > 0 && (
                <AdvancedRow
                  label="Email address from a hidden field"
                  hint="Used only when they never typed one into the form."
                >
                  <Select
                    value={followUp.addressField ?? "__none"}
                    onValueChange={(v) => patch({ addressField: v === "__none" ? undefined : v })}
                  >
                    <SelectTrigger className="w-40">
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
                </AdvancedRow>
              )}
            </div>
          )}

          <p className="text-muted-foreground text-xs">
            Email only for now — WhatsApp and SMS are coming.
          </p>
        </>
      )}
    </div>
  );
}

function AdvancedRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">{hint}</p>
      </div>
      {children}
    </div>
  );
}
