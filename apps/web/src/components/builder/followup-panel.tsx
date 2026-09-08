"use client";

import { Mail, MessageCircle, Smartphone } from "lucide-react";
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
import { cn } from "@/lib/utils";

/**
 * The follow-up sequence editor.
 *
 * Its own file because it is the one settings section with real structure — an
 * ordered list of steps, each with a delay and a subject — rather than a column
 * of independent switches.
 */

type FollowUp = FormDoc["settings"]["followUp"];
type Step = FollowUp["steps"][number];

/**
 * The delays, as choices rather than a free number.
 *
 * A minutes-level box would invite the "send it within the hour" advice that
 * every vendor blog repeats and that the two randomised trials on the subject
 * both contradict — messages inside the first hour performed *worse* than
 * sending nothing, because they mostly reach people who were coming back
 * anyway. The floor here is deliberately two hours.
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

const DEFAULT_STEP: Step = {
  delayHours: 72,
  subject: "Last chance to finish {{form.title}}",
  bodyMd: "",
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
  const patch = (p: Partial<FollowUp>) => onChange({ ...settings, followUp: { ...followUp, ...p } });

  const setStep = (i: number, p: Partial<Step>) =>
    patch({ steps: followUp.steps.map((s, j) => (i === j ? { ...s, ...p } : s)) });

  return (
    <div className="space-y-5">
      <div className="divide-border/60 divide-y rounded-xl border">
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium">Follow up on unfinished responses</p>
            <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
              Email people who answered a few questions and left, with a link back to where
              they stopped. Only runs when the form has their address.
            </p>
          </div>
          <Switch
            checked={followUp.enabled}
            onCheckedChange={(enabled) => patch({ enabled })}
          />
        </div>
      </div>

      {followUp.enabled && (
        <>
          <div className="space-y-3">
            <p className="text-muted-foreground text-caption font-medium tracking-wide uppercase">
              The sequence
            </p>
            {followUp.steps.map((step, i) => (
              <div key={i} className="space-y-3 rounded-xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="bg-muted text-muted-foreground flex size-6 items-center justify-center rounded-full text-xs font-medium">
                      {i + 1}
                    </span>
                    <Select
                      value={String(step.delayHours)}
                      onValueChange={(v) => setStep(i, { delayHours: Number(v) })}
                    >
                      <SelectTrigger className="w-44">
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
                  </div>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
                    onClick={() => patch({ steps: followUp.steps.filter((_, j) => j !== i) })}
                  >
                    Remove
                  </button>
                </div>
                <Input
                  value={step.subject}
                  placeholder="Subject line"
                  onChange={(e) => setStep(i, { subject: e.target.value })}
                />
                <Textarea
                  className="min-h-20"
                  value={step.bodyMd}
                  placeholder="Anything to add above the button. Leave blank for just the progress line."
                  onChange={(e) => setStep(i, { bodyMd: e.target.value })}
                />
              </div>
            ))}

            {followUp.steps.length < 3 ? (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground w-full rounded-xl border border-dashed py-2.5 text-sm"
                onClick={() => patch({ steps: [...followUp.steps, DEFAULT_STEP] })}
              >
                Add a follow-up
              </button>
            ) : (
              /**
               * Three is the cap, and the reason belongs here rather than in a
               * disabled button nobody can interrogate.
               */
              <p className="text-muted-foreground text-xs">
                Three is the maximum. Past that, reminders stop earning their place — more
                than five has been measured to <em>lower</em> completion, not raise it.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-muted-foreground text-caption font-medium tracking-wide uppercase">
              Options
            </p>
            <div className="divide-border/60 divide-y rounded-xl border">
              <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Show their progress</p>
                  <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                    Opens with “you answered 3 of 7”. Framing a task as already begun is the
                    one nudge here with solid evidence behind it.
                  </p>
                </div>
                <Switch
                  checked={followUp.showProgress}
                  onCheckedChange={(showProgress) => patch({ showProgress })}
                />
              </div>

              <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Reply-to address</p>
                  <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                    Where replies go. A reminder people cannot reply to is one they report
                    as spam.
                  </p>
                </div>
                <Input
                  className="max-w-xs"
                  value={followUp.replyTo ?? ""}
                  placeholder="you@company.com"
                  onChange={(e) => patch({ replyTo: e.target.value || undefined })}
                />
              </div>

              {hiddenFields.length > 0 && (
                <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Address from a hidden field</p>
                    <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                      For when you already knew their email and put it in the link. Used only
                      if they never typed one.
                    </p>
                  </div>
                  <Select
                    value={followUp.addressField ?? "__none"}
                    onValueChange={(v) => patch({ addressField: v === "__none" ? undefined : v })}
                  >
                    <SelectTrigger className="w-44">
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
                </div>
              )}

              <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Hold back a comparison group</p>
                  <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                    Send nothing to this share of people, so you can tell recovered responses
                    from ones that would have come back anyway.
                  </p>
                </div>
                <Select
                  value={String(followUp.holdoutPercent)}
                  onValueChange={(v) => patch({ holdoutPercent: Number(v) })}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Off</SelectItem>
                    <SelectItem value="5">5%</SelectItem>
                    <SelectItem value="10">10%</SelectItem>
                    <SelectItem value="20">20%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <ChannelRows />

          {/*
            Not fine print, and not hidden behind a tooltip. A reminder to
            somebody who never finished is marketing mail everywhere it lands,
            and the two obligations that follow are ones the author has to
            actually meet — we can enforce the opt-out, but only they can supply
            an address that is really theirs.
          */}
          <div className="bg-muted/40 text-muted-foreground rounded-xl border p-4 text-xs leading-relaxed">
            <p className="text-foreground mb-1.5 font-medium">Before you turn this on</p>
            <p>
              A reminder to someone who did not finish counts as marketing email, not a
              service message — so every one carries an unsubscribe link and your postal
              address, and respondents are offered an opt-out at the moment you ask for
              their email. Use it for forms people fill in to get something from you: a
              quote, a demo, a trial. Not for surveys, applications or feedback.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The channels, including the two that do not exist.
 *
 * Shown rather than omitted because "can it text them?" is the first question
 * anyone asks about this feature, and an empty space answers it worse than a
 * disabled row does. Both are genuinely blocked on approvals outside this
 * product — WhatsApp will not deliver marketing templates to US numbers at all
 * right now, and US SMS needs per-customer 10DLC registration — so neither is
 * a date we can promise.
 */
function ChannelRows() {
  const channels = [
    { icon: Mail, label: "Email", note: "Active", live: true },
    { icon: MessageCircle, label: "WhatsApp", note: "Soon", live: false },
    { icon: Smartphone, label: "SMS", note: "Soon", live: false },
  ];
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-caption font-medium tracking-wide uppercase">
        Channels
      </p>
      <div className="divide-border/60 divide-y rounded-xl border">
        {channels.map((c) => (
          <div
            key={c.label}
            className={cn(
              "flex items-center gap-3 px-4 py-3",
              !c.live && "opacity-55",
            )}
          >
            <c.icon className="text-muted-foreground size-4 shrink-0" />
            <span className="flex-1 text-sm font-medium">{c.label}</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-caption font-medium",
                c.live ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              )}
            >
              {c.note}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
