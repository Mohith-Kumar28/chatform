"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BufferedInput, BufferedTextarea } from "@/components/ui/buffered-input";
import { useBufferedValue } from "@/hooks/use-buffered-value";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_CONFIRMATION_BODY,
  DEFAULT_CONFIRMATION_SUBJECT,
  type FormDoc,
} from "@repo/form-schema";
import { LockedControl } from "@/components/billing/gate";
import { useEntitlements } from "@/hooks/use-entitlements";
import { LinkSettings } from "./link-settings";
import { FollowUpPanel } from "./followup-panel";
import { ShortcutsList } from "@/components/ui/shortcuts-dialog";
import { useBuilderStore } from "@/stores/builder-store";

interface SettingsPanelProps {
  settings: FormDoc["settings"];
  onChange: (next: FormDoc["settings"]) => void;
  formTitle?: string;
  /** Renames the form. The name is a document field, so it saves like the rest. */
  onTitleChange?: (title: string) => void;
  hiddenFields: FormDoc["hiddenFields"];
  onHiddenFieldsChange: (fields: FormDoc["hiddenFields"]) => void;
  variables: FormDoc["variables"];
  onVariablesChange: (variables: FormDoc["variables"]) => void;
  /** For the link preview's URL line. Absent until the form row has loaded. */
  slug?: string | null;
}

// "Access" and "Access & closing" were two sections covering one concern —
// who can respond and until when. Merged. The AI Interviewer settings moved to
// the dedicated Agent tab.
const SECTIONS = [
  { id: "general", label: "General" },
  { id: "access", label: "Access & closing" },
  { id: "hidden", label: "Hidden fields & variables" },
  { id: "link", label: "Link & social" },
  { id: "completion", label: "On completion" },
  { id: "followup", label: "Follow-ups" },
  { id: "shortcuts", label: "Keyboard shortcuts" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function SettingsPanel({
  settings,
  onChange,
  formTitle,
  onTitleChange,
  hiddenFields,
  onHiddenFieldsChange,
  variables,
  onVariablesChange,
  slug,
}: SettingsPanelProps) {
  const params = useParams<{ id: string; section?: string[] }>();
  /*
    Read rather than gated on: the switch itself is `duplicate_prevention`,
    and this only decides which sentence sits under it. `LockedControl`
    handles the padlock.
  */
  const canVerifiedIdentity = useEntitlements().can("one_response_per_identity");

  /**
   * The section is the URL, not component state.
   *
   * The route has always been `/settings/[[...section]]` and the segment was
   * always thrown away, so every section was the same address: Share could not
   * link to link settings, the back button could not leave one, and reloading
   * put you back in General. It reads the segment now and the sub-nav is real
   * links — the builder layout persists, so it costs nothing.
   */
  const requested = params.section?.[0];
  const section: SectionId = SECTIONS.some((s) => s.id === requested)
    ? (requested as SectionId)
    : "general";
  const patch = (p: Partial<FormDoc["settings"]>) => onChange({ ...settings, ...p });
  const shortcuts = useBuilderStore((s) => s.shortcuts);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <h1 className="font-display mb-6 text-xl font-semibold">
        Settings{formTitle ? <span className="text-muted-foreground font-normal"> for {formTitle}</span> : null}
      </h1>
      <div className="bg-card flex gap-0 overflow-hidden rounded-2xl">
        {/* sub-nav */}
        <nav className="bg-muted/30 w-56 shrink-0 space-y-0.5 p-3">
          {SECTIONS.map((s) => (
            <Link
              key={s.id}
              href={`/forms/${params.id}/settings/${s.id}`}
              scroll={false}
              aria-current={section === s.id ? "page" : undefined}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                section === s.id ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/50"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </nav>

        {/* content */}
        <div className="min-w-0 flex-1 space-y-3 overflow-y-auto p-6" style={{ maxHeight: "calc(100svh - 220px)" }}>
          {section === "general" && (
            <>
            {onTitleChange && (
              <SettingSection title="Form">
                <SettingGroup>
                  <SettingRow
                    label="Form name"
                    description="Shown at the top of the chat, and in your dashboard. Renaming does not change the form's link."
                  >
                    <FormNameField title={formTitle ?? ""} onChange={onTitleChange} />
                  </SettingRow>
                </SettingGroup>
              </SettingSection>
            )}
            <SettingSection title="Display">
              <SettingGroup>
              <SettingRow
                label="Progress bar"
                description="Show respondents how far they are."
              >
                <Select value={settings.progressBar} onValueChange={(v) => patch({ progressBar: v as "percent" | "steps" | "none" })}>
                  <SelectTrigger className="w-auto min-w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percent</SelectItem>
                    <SelectItem value="steps">Steps</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
              <SettingRow
                label="Allow skipping optional questions"
                description="Respondents can skip anything not marked required."
                checked={settings.navigation.allowSkip}
                onCheckedChange={(v) => patch({ navigation: { ...settings.navigation, allowSkip: v } })}
              />
              {/*
                Visible and locked, never hidden. The toggle sits exactly where it would
                if it worked, switched off, with a chip naming the plan — a feature nobody
                can see is a feature nobody will want. The server ignores the flag on an
                unentitled plan regardless of what the document says.
              */}
              <LockedControl feature="remove_branding">
                <SettingRow
                  label='Hide "Powered by chatform"'
                  description="Remove the chatform badge from the chat."
                  checked={settings.branding.hidePoweredBy}
                  onCheckedChange={(v) => patch({ branding: { ...settings.branding, hidePoweredBy: v } })}
                />
              </LockedControl>
              </SettingGroup>
            </SettingSection>
            </>
          )}

          {/* The AI Interviewer settings moved to the Agent tab, which has room
              for the persona, goal, knowledge base and guardrails. */}
          {section === "access" && (
            <SettingSection title="Access & closing">
              <SettingGroup label="Who can respond">
              <LockedControl feature="respondent_auth_google">
                <SettingRow
                  label="Require sign-in"
                  description="Respondents verify who they are before they can finish."
                  checked={settings.requireAuth.enabled}
                  onCheckedChange={(v) => patch({ requireAuth: { ...settings.requireAuth, enabled: v } })}
                />
              </LockedControl>
              {settings.requireAuth.enabled && (
                <>
                  {/*
                    One method, chosen — not a pair of toggles that could both
                    be on. Offering two doors produces two identities for the
                    same person, so "one response per person" below could be
                    walked around by coming back through the other one.
                  */}
                  <SettingRow
                    label="Verify with"
                    description="How a respondent proves who they are. Pick one."
                  >
                    <div role="radiogroup" aria-label="Sign-in method" className="flex gap-1.5">
                      {(["google", "phone"] as const).map((m) => {
                        const on = settings.requireAuth.method === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => patch({ requireAuth: { ...settings.requireAuth, method: m } })}
                            className={cn(
                              "h-8 rounded-full border px-3 text-xs font-medium transition-colors",
                              on
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:bg-muted",
                            )}
                          >
                            {m === "google" ? "Google" : "Phone (SMS)"}
                          </button>
                        );
                      })}
                    </div>
                  </SettingRow>
                  {/*
                    Where the gate sits, not whether there is one. Zero is the
                    old behaviour and stays the default; above zero the
                    respondent answers that many questions first, and what they
                    already said is kept either way.
                  */}
                  <SettingRow
                    label="Ask after"
                    description="Questions to answer before signing in. 0 asks before the first one."
                  >
                    <BufferedInput
                      type="number"
                      min={0}
                      max={20}
                      className="w-32"
                      value={String(settings.requireAuth.afterBlocks)}
                      onCommit={(v) =>
                        patch({
                          requireAuth: {
                            ...settings.requireAuth,
                            afterBlocks: Math.max(0, Math.min(20, Number(v) || 0)),
                          },
                        })
                      }
                    />
                  </SettingRow>
                  <SettingRow
                    label="What the agent says"
                    description="The sentence shown above the sign-in buttons."
                    stacked
                  >
                    <BufferedTextarea
                      rows={2}
                      value={settings.requireAuth.message}
                      onCommit={(v) => patch({ requireAuth: { ...settings.requireAuth, message: v } })}
                    />
                  </SettingRow>
                </>
              )}
              {/*
                One question, asked once.

                This used to be two switches. "Allow resubmissions" sat in
                General → Display, and "One response per person" sat here,
                inside the sign-in block — opposite polarity, two sections
                apart, and both answering "may one person answer twice?". All
                that differed was which key they enforced on: the browser, or
                the verified identity.

                Which key to use is not a decision an author can make well,
                because it is not a decision at all — it follows from whether
                the form asks people to sign in. So the switch states the rule
                and the description states the consequence, and the author is
                never asked to pick a mechanism.

                It lives here rather than under Display because it is a rule
                about who may respond, alongside sign-in, the password, the
                captcha and the closing date. Display is the progress bar and
                the branding.
              */}
              <LockedControl feature="duplicate_prevention">
                <SettingRow
                  label="One response per person"
                  description={onePerPersonBlurb(settings.requireAuth.enabled, canVerifiedIdentity)}
                  checked={!settings.allowResubmissions}
                  onCheckedChange={(v) => patch({ allowResubmissions: !v })}
                />
              </LockedControl>
              <SettingRow
                label="Require password"
                description="Only people with the password can respond."
                checked={settings.password.enabled}
                onCheckedChange={(v) => patch({ password: { ...settings.password, enabled: v, value: settings.password.value || "letmein" } })}
              />
              {settings.password.enabled && (
                <SettingRow label="Password">
                  <BufferedInput
                    className="max-w-xs"
                    value={settings.password.value}
                    onCommit={(v) => patch({ password: { ...settings.password, value: v } })}
                  />
                </SettingRow>
              )}
              <SettingRow
                label="Captcha (Turnstile)"
                description="Verify respondents with Cloudflare Turnstile."
                checked={settings.captcha.enabled}
                onCheckedChange={(v) => patch({ captcha: { ...settings.captcha, enabled: v } })}
              />
              </SettingGroup>

              <SettingGroup label="Closing">
              <SettingRow label="Close automatically at" description="Stop accepting responses after this date.">
                <Input
                  type="datetime-local"
                  value={toLocalInput(settings.closeRules.closeAt)}
                  onChange={(e) =>
                    patch({
                      closeRules: {
                        ...settings.closeRules,
                        closeAt: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                      },
                    })
                  }
                />
              </SettingRow>
              {/*
                Both of these appear only once the thing they qualify is set. A
                switch for a countdown on a form with no closing date is a
                control with nothing to control, and it would sit here on every
                form in the product to be useful on the few that have one.
              */}
              {settings.closeRules.closeAt && (
                <SettingRow
                  label="Show a countdown"
                  description="Respondents see how long they have left, at the top of the conversation. Also puts the date on the link preview."
                  checked={settings.closeRules.showCountdown}
                  onCheckedChange={(v) => patch({ closeRules: { ...settings.closeRules, showCountdown: v } })}
                />
              )}
              <SettingRow label="Close after N submissions" description="Cap the total number of responses.">
                <BufferedInput
                  type="number"
                  min={1}
                  className="w-32"
                  placeholder="No limit"
                  value={settings.closeRules.maxSubmissions === undefined ? "" : String(settings.closeRules.maxSubmissions)}
                  onCommit={(v) =>
                    patch({
                      closeRules: {
                        ...settings.closeRules,
                        maxSubmissions: v ? Number(v) : undefined,
                      },
                    })
                  }
                />
              </SettingRow>
              {settings.closeRules.maxSubmissions !== undefined && (
                <SettingRow
                  label="Show spots left"
                  /*
                    Says what it publishes, not just what it does. A remaining
                    count lets anyone holding the link work out how many people
                    have responded — which is the point on a workshop signup and
                    a leak on a hiring form, and the author is the only one who
                    knows which of those this is.
                  */
                  description="Respondents see how many places remain — which also tells anyone with the link how many people have answered. Best for a genuinely limited intake."
                  checked={settings.closeRules.showRemaining}
                  onCheckedChange={(v) => patch({ closeRules: { ...settings.closeRules, showRemaining: v } })}
                />
              )}
              <SettingRow label="Closed message" description="Shown when the form is closed." stacked>
                <BufferedTextarea
                  rows={2}
                  value={settings.closeRules.closedMessageMd}
                  onCommit={(v) => patch({ closeRules: { ...settings.closeRules, closedMessageMd: v } })}
                />
              </SettingRow>
              </SettingGroup>
            </SettingSection>
          )}

          {section === "hidden" && (
            <SettingSection title="Hidden fields & variables">
              <HiddenFieldsEditor fields={hiddenFields} onChange={onHiddenFieldsChange} />
              <VariablesEditor variables={variables} onChange={onVariablesChange} />
            </SettingSection>
          )}

          {section === "link" && (
            <SettingSection title="Link & social">
              {/* One line, not three: the panel below shows the card, which
                  explains itself better than a list of the platforms it
                  appears on. */}
              <p className="text-muted-foreground -mt-1 text-sm">
                How your link looks when someone shares it.
              </p>
              <LinkSettings
                settings={settings}
                formTitle={formTitle ?? ""}
                slug={slug ?? null}
                onChange={onChange}
              />
            </SettingSection>
          )}

          {section === "completion" && (
            <SettingSection title="On completion">
              <SettingGroup>
              <SettingRow
                label="Notification emails"
                description="Get an email for every completed response."
                issuePath="settings.onComplete.notificationEmails"
              >
                <BufferedInput
                  className="max-w-md"
                  value={settings.onComplete.notificationEmails.join(", ")}
                  placeholder="you@company.com"
                  onCommit={(v) =>
                    patch({
                      onComplete: {
                        ...settings.onComplete,
                        notificationEmails: v
                          .split(",")
                          .map((x) => x.trim())
                          .filter(Boolean),
                      },
                    })
                  }
                />
              </SettingRow>
              <LockedControl feature="completion_redirect">
              <SettingRow
                label="Redirect after completion"
                description="Opens your own page in a new tab when they finish. The confirmation stays open behind it."
                issuePath="settings.onComplete.redirectUrl"
              >
                <BufferedInput
                  className="max-w-md"
                  value={settings.onComplete.redirectUrl ?? ""}
                  placeholder="https://yoursite.com/thanks"
                  onCommit={(v) =>
                    patch({
                      onComplete: {
                        ...settings.onComplete,
                        redirectUrl: v || undefined,
                      },
                    })
                  }
                />
              </SettingRow>
              </LockedControl>
              </SettingGroup>

              <ConfirmationEmailSettings settings={settings} onChange={onChange} />
            </SettingSection>
          )}

          {section === "shortcuts" && (
            <SettingSection title="Keyboard shortcuts">
              <p className="text-muted-foreground -mt-1 text-sm">
                These work whenever you are not typing in a field.
              </p>
              <ShortcutsList shortcuts={shortcuts} />
            </SettingSection>
          )}

          {section === "followup" && (
            <SettingSection title="Follow-ups">
              <p className="text-muted-foreground -mt-1 text-sm">
                Email people who started your form and left, with a link back to where they
                stopped.
              </p>
              <LockedControl feature="followup_email">
                <FollowUpPanel
                  settings={settings}
                  hiddenFields={hiddenFields}
                  formTitle={formTitle ?? "your form"}
                  onChange={onChange}
                />
              </LockedControl>
            </SettingSection>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The form's name, in the place people go looking for a setting.
 *
 * The header has an inline rename, which is where it will usually be done. This
 * is the other half of the same habit: the answer to "where do I change the
 * name" should be Settings even when there is a faster way, because that is the
 * first place anyone looks.
 *
 * Local while it is being typed, so an empty field is a moment in the edit
 * rather than an invalid document — the schema requires at least one character,
 * and a rejected autosave in the middle of a rename would be indistinguishable
 * from a broken form.
 */
function FormNameField({ title, onChange }: { title: string; onChange: (title: string) => void }) {
  /*
    Buffered, and it still refuses to commit an empty name.

    Two guards, because they answer different halves of the same problem.
    `FormDoc.title` is `z.string().min(1)`, so selecting the whole name in order
    to retype it passes through a state the document cannot hold: the buffer
    keeps the letters in between off the wire, and the emptiness check covers the
    one intermediate state that is still invalid after it has settled.

    Adopting an upstream change while this box is not the one writing — undo, the
    header's own name field, an AI edit — is handled by the hook rather than by a
    `focused` flag and a write during render.
  */
  const buffered = useBufferedValue(title, (next) => {
    const trimmed = next.trim();
    if (trimmed) onChange(trimmed);
  });

  return (
    <Input
      value={buffered.value}
      maxLength={200}
      aria-label="Form name"
      placeholder="Untitled form"
      className="w-72"
      onChange={(e) => buffered.onChange(e.target.value)}
      onBlur={(e) => {
        // Put the old name back rather than leaving an empty box, which reads as
        // a form that has been successfully renamed to nothing.
        if (!e.target.value.trim()) buffered.onChange(title);
        buffered.onBlur();
      }}
    />
  );
}

// ── building blocks ──────────────────────────────────────────────────

/**
 * The receipt the respondent gets, and the switch for it.
 *
 * A group of its own rather than two more rows in "On completion", because the
 * rows above it are about the *owner* — where their notification goes, where
 * their respondent lands — and this one is the only thing on the page that
 * sends mail to the person who filled the form in. Reading them as one list
 * made the notification address look like it might be the recipient of this
 * too.
 *
 * The copy fields are behind the paywall and the switch is not: everybody sends
 * the receipt, Pro writes its words. They stay visible while locked so the
 * author can see what they would be buying, which is the whole reason
 * `LockedControl` renders its children rather than hiding them.
 */
function ConfirmationEmailSettings({
  settings,
  onChange,
}: {
  settings: FormDoc["settings"];
  onChange: (next: FormDoc["settings"]) => void;
}) {
  const onComplete = settings.onComplete;
  const confirmation = onComplete.autoReplyEmail;
  const patch = (p: Partial<typeof confirmation>) =>
    onChange({
      ...settings,
      onComplete: { ...onComplete, autoReplyEmail: { ...confirmation, ...p } },
    });

  return (
    <SettingGroup label="To the respondent">
      <SettingRow
        label="Confirmation email"
        description="Thank people for answering, at the email address they gave you. Nothing is sent if the form never asks for one."
        checked={confirmation.enabled}
        onCheckedChange={(enabled) => patch({ enabled })}
      />
      {confirmation.enabled && (
        <>
          <SettingRow
            label="Include their answers"
            description="Send a copy of what they filled in. Turn this off for anything they would not want sitting in an inbox."
            checked={confirmation.includeAnswers}
            onCheckedChange={(includeAnswers) => patch({ includeAnswers })}
          />
          <LockedControl feature="auto_reply_email">
            <SettingRow label="Subject" description="Leave it as it is, or write your own.">
              <BufferedInput
                className="max-w-md"
                value={confirmation.subject}
                placeholder={DEFAULT_CONFIRMATION_SUBJECT}
                onCommit={(v) => patch({ subject: v })}
              />
            </SettingRow>
            <SettingRow
              label="Message"
              description="Use {{form.title}} or any question's ref to write their own answers back to them."
              stacked
            >
              <BufferedTextarea
                rows={3}
                value={confirmation.bodyMd}
                placeholder={DEFAULT_CONFIRMATION_BODY}
                onCommit={(v) => patch({ bodyMd: v })}
              />
            </SettingRow>
          </LockedControl>
        </>
      )}
    </SettingGroup>
  );
}

/**
 * What "one response per person" actually buys, given this form and this plan.
 *
 * The author picks the rule; the key is a consequence, and the consequence is
 * worth stating because the three cases differ by a lot. Saying "one response
 * per person" over a browser fingerprint without saying so is the kind of
 * promise that gets discovered at the wrong moment — a duplicate in the
 * results, or a respondent locked out of a form they never filled in.
 */
function onePerPersonBlurb(signInRequired: boolean, canVerifiedIdentity: boolean): string {
  if (signInRequired && canVerifiedIdentity) {
    return "Keyed to the identity they sign in with, so another browser or device does not get them a second response.";
  }
  if (signInRequired) {
    return "We recognise the respondent's browser — it survives a cleared cache and a private window, but not a different device. Business keys this to the identity they sign in with instead.";
  }
  return "We recognise the respondent's browser. It survives a cleared cache and a private window, but not a different device — turn on Require sign-in for a per-person guarantee.";
}

function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <div className="space-y-5">{children}</div>
    </>
  );
}

/**
 * Related settings, in one card.
 *
 * Every row used to carry its own border, so a section read as a stack of
 * unrelated tiles — "Require sign-in", then a separate box for the methods that
 * only exist because of it, then a third for the sentence it shows. Rows that
 * belong to one decision now sit inside one frame, separated by a rule, and the
 * frame is what says they belong together.
 */
function SettingGroup({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      {label && (
        <p className="text-muted-foreground text-caption font-medium tracking-wide uppercase">
          {label}
        </p>
      )}
      <div className="divide-border/60 divide-y rounded-xl border">{children}</div>
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
  checked,
  onCheckedChange,
  /**
   * Put the control under the label instead of beside it, at full width.
   *
   * A sentence the agent will say was being typed into a 20rem input squeezed
   * against the right edge of the row, showing about four words of it.
   */
  stacked = false,
  issuePath,
}: {
  label: string;
  description?: string;
  children?: React.ReactNode;
  checked?: boolean;
  onCheckedChange?: (v: boolean) => void;
  stacked?: boolean;
  /**
   * The document path this row edits, so a schema refusal lands under it.
   *
   * Matched as a prefix: `settings.onComplete.notificationEmails` catches the
   * `…​.0` the server actually complains about, which is an index into a list
   * this row edits as one comma-separated string.
   */
  issuePath?: string;
}) {
  const issue = useBuilderStore((s) =>
    issuePath ? (s.docIssues.find((i) => i.path === issuePath || i.path.startsWith(`${issuePath}.`)) ?? null) : null,
  );

  const control =
    checked !== undefined && onCheckedChange ? (
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    ) : (
      children
    );

  /*
    Under the control, not in a toast in the corner.

    The message used to arrive as `settings.onComplete.notificationEmails.0:
    Invalid email address` in a notification two feet from the box it was about,
    and vanish a few seconds later while the problem stayed.
  */
  const withIssue = issue ? (
    <div className="space-y-1">
      {control}
      <p className="text-destructive text-xs">{issue.message.replace(/^[^:]*: /, "")}</p>
    </div>
  ) : (
    control
  );

  if (stacked) {
    return (
      <div className="space-y-2 px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          {description && <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>}
        </div>
        {withIssue}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">{description}</p>}
      </div>
      <div className="shrink-0">{withIssue}</div>
    </div>
  );
}

function toLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function HiddenFieldsEditor({
  fields,
  onChange,
}: {
  fields: FormDoc["hiddenFields"];
  onChange: (fields: FormDoc["hiddenFields"]) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="rounded-xl border px-4 py-3.5">
      <Label>Hidden fields</Label>
      <p className="text-muted-foreground mt-0.5 mb-2 text-xs">Capture UTM / URL params invisibly with every response.</p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {fields.map((f) => (
          <span key={f.name} className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs">
            {f.name}
            <button onClick={() => onChange(fields.filter((x) => x.name !== f.name))} className="text-muted-foreground hover:text-destructive">✕</button>
          </span>
        ))}
      </div>
      <Input
        value={draft}
        placeholder="utm_source, referral… (press Enter)"
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            e.preventDefault();
            if (!fields.some((f) => f.name === draft.trim())) {
              onChange([...fields, { name: draft.trim() }]);
            }
            setDraft("");
          }
        }}
        onChange={(e) => setDraft(e.target.value)}
      />
    </div>
  );
}

function VariablesEditor({
  variables,
  onChange,
}: {
  variables: FormDoc["variables"];
  onChange: (variables: FormDoc["variables"]) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"number" | "text">("number");
  return (
    <div className="rounded-xl border px-4 py-3.5">
      <Label>Variables</Label>
      <p className="text-muted-foreground mt-0.5 mb-2 text-xs">Scores, prices or tags computed during the conversation.</p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {variables.map((v) => (
          <span key={v.name} className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs">
            {v.name} ({v.type})
            <button onClick={() => onChange(variables.filter((x) => x.name !== v.name))} className="text-muted-foreground hover:text-destructive">✕</button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <Input value={name} placeholder="score" onChange={(e) => setName(e.target.value)} />
        <Select value={type} onValueChange={(v) => setType(v as "number" | "text")}>
          <SelectTrigger size="sm" aria-label="Variable type" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="number">number</SelectItem>
            <SelectItem value="text">text</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (name.trim() && !variables.some((v) => v.name === name.trim())) {
              onChange([...variables, { name: name.trim(), type, initial: type === "number" ? 0 : "" }]);
            }
            setName("");
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
