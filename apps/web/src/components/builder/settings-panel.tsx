"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bot, CircleX, Plus } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
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
  MAX_NOTIFICATION_EMAILS,
  emailQuestions,
  type FormDoc,
} from "@repo/form-schema";
import { LockedControl } from "@/components/billing/gate";
import { useEntitlements } from "@/hooks/use-entitlements";
import { LinkSettings } from "./link-settings";
import { LanguageSettings } from "./language-settings";
import { FollowUpPanel } from "./followup-panel";
import { AgentSettings } from "./agent-settings";
import { ShortcutsList } from "@/components/ui/shortcuts-dialog";
import { useBuilderStore } from "@/stores/builder-store";
import { SettingsShell } from "@/components/settings/settings-shell";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { BlockedUntilOn } from "@/components/ui/blocked-until-on";

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
// who can respond and until when. Merged. Agent was a tab of its own; it is the
// last section here now, drawn apart in the nav so it is not lost in the list.
const SECTIONS = [
  { id: "general", label: "General" },
  { id: "completion", label: "Email notifications" },
  { id: "access", label: "Access & closing" },
  { id: "hidden", label: "Hidden fields & variables" },
  { id: "link", label: "Link & social" },
  { id: "followup", label: "Follow-ups" },
  { id: "language", label: "Language" },
  { id: "shortcuts", label: "Keyboard shortcuts" },
  { id: "agent", label: "Agent" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

/**
 * Every input that sits beside its label is this wide, so the right-hand edge of
 * a section lines up. They were 8rem, 20rem and 28rem depending on who wrote the
 * row, which left a number box looking cramped next to a URL field. Full width
 * on a phone, where the row stacks.
 */
const CONTROL_WIDTH = "w-full sm:w-80";

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
    <SettingsShell
      /*
        The frame, the fixed height and the mobile stacking are shared with
        `/settings/*`. This used to cap the pane at `calc(100svh - 220px)` — a
        number that had to be re-derived by hand whenever the heading above it
        changed — and cap nothing else, so the card still grew past the window
        on "Keyboard shortcuts" and shrank to a strip on "Hidden fields".
      */
      header={
        <h1 className="font-display mb-6 text-xl font-semibold">
          Settings{formTitle ? <span className="text-muted-foreground font-normal"> for {formTitle}</span> : null}
        </h1>
      }
      paneClassName="space-y-3"
      nav={
        /*
          A rail at `md`, a scrolling strip below it — the same two shapes
          `SettingsNav` takes, from one list, so the order and the labels cannot
          disagree between viewports. This used to hold a 14rem rail at every
          width, which at 375px left the pane about 100px of usable room.
        */
        <nav
          aria-label="Form settings"
          className={cn(
            "-mx-4 flex shrink-0 snap-x gap-1 overflow-x-auto px-4 pb-3",
            "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            "md:bg-muted/30 md:mx-0 md:block md:w-56 md:space-y-0.5 md:overflow-visible md:p-3 md:pb-3",
          )}
        >
          {SECTIONS.map((s) => s.id === "agent" ? (
            <Link
              key={s.id}
              href={`/forms/${params.id}/settings/${s.id}`}
              scroll={false}
              aria-current={section === s.id ? "page" : undefined}
              className={cn(
                "text-primary flex shrink-0 snap-start items-center gap-2 rounded-full border border-dashed border-primary/60 px-3 py-1.5 text-sm font-medium whitespace-nowrap",
                "transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)]",
                "md:mt-3 md:w-full md:rounded-lg md:px-3 md:py-2",
                section === s.id ? "bg-primary-soft border-primary" : "hover:bg-primary-soft/60",
              )}
            >
              <Bot className="size-4 shrink-0" strokeWidth={1.75} />
              <span className="flex-1">{s.label}</span>
              <ArrowRight className="size-3.5 shrink-0" strokeWidth={2} />
            </Link>
          ) : (
            <Link
              key={s.id}
              href={`/forms/${params.id}/settings/${s.id}`}
              scroll={false}
              aria-current={section === s.id ? "page" : undefined}
              className={cn(
                "shrink-0 snap-start rounded-full px-3 py-1.5 text-sm whitespace-nowrap",
                "transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)]",
                "md:block md:w-full md:rounded-lg md:px-3 md:py-2 md:text-left",
                section === s.id
                  ? "bg-accent font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {s.label}
            </Link>
          ))}
        </nav>
      }
    >
      {section === "general" && (
        <>
        {onTitleChange && (
          <SettingSection title="Form">
            <SettingGroup>
              <SettingRow
                setting="title" label="Form name"
                description="Renaming keeps the same link."
              >
                <FormNameField title={formTitle ?? ""} onChange={onTitleChange} />
              </SettingRow>
            </SettingGroup>
          </SettingSection>
        )}
        <SettingSection title="Display">
          <SettingGroup>
          <SettingRow setting="settings.progressBar" label="Progress bar">
            <Select value={settings.progressBar} onValueChange={(v) => patch({ progressBar: v as "percent" | "steps" | "none" })}>
              <SelectTrigger className={CONTROL_WIDTH}>
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
            setting="settings.navigation.allowSkip" label="Allow skipping optional questions"
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
              setting="settings.branding.hidePoweredBy" label='Hide "Powered by chatform"'
              checked={settings.branding.hidePoweredBy}
              onCheckedChange={(v) => patch({ branding: { ...settings.branding, hidePoweredBy: v } })}
            />
          </LockedControl>
          </SettingGroup>
        </SettingSection>
        </>
      )}

      {section === "language" && (
        <SettingSection title="Language settings">
          <LanguageSettings formId={params.id} settings={settings} onChange={onChange} />
        </SettingSection>
      )}

      {section === "access" && (
        <SettingSection title="Access & closing">
          <SettingGroup label="Who can respond">
          <LockedControl feature="respondent_auth_google">
            <SettingRow
              setting="settings.requireAuth.enabled" label="Require sign-in"
              description="People verify who they are first."
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
              <SettingRow setting="settings.requireAuth.method" label="Verify with">
                <div role="radiogroup" aria-label="Sign-in method" className="flex gap-1.5">
                  {(["google", "email", "phone"] as const).map((m) => {
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
                        {m === "google" ? "Google" : m === "email" ? "Email code" : "Phone (SMS)"}
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
                setting="settings.requireAuth.afterBlocks" label="Ask after"
                description="Questions before sign-in. 0 means right away."
              >
                <BufferedInput
                  type="number"
                  min={0}
                  max={20}
                  className={CONTROL_WIDTH}
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
                setting="settings.requireAuth.message" label="What the agent says"
                description="Shown above the sign-in buttons."
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
            {/*
              Named for what it allows, the way every other switch here reads.
              "One response per person", on meaning off, was the one row where
              a switch had to be read twice.
            */}
            <SettingRow
              setting="settings.allowResubmissions" label="Allow multiple responses"
              description={
                settings.allowResubmissions
                  ? "People can answer more than once."
                  : settings.requireAuth.enabled && canVerifiedIdentity
                    ? "One response per signed-in person."
                    : "One response per browser."
              }
              checked={settings.allowResubmissions}
              onCheckedChange={(v) => patch({ allowResubmissions: v })}
            />
          </LockedControl>
          <SettingRow
            label="Require password"
            checked={settings.password.enabled}
            onCheckedChange={(v) => patch({ password: { ...settings.password, enabled: v, value: settings.password.value || "letmein" } })}
          />
          {settings.password.enabled && (
            <SettingRow label="Password">
              <BufferedInput
                className={CONTROL_WIDTH}
                value={settings.password.value}
                onCommit={(v) => patch({ password: { ...settings.password, value: v } })}
              />
            </SettingRow>
          )}
          <SettingRow
            setting="settings.captcha.enabled" label="Captcha"
            description="Blocks bots."
            checked={settings.captcha.enabled}
            onCheckedChange={(v) => patch({ captcha: { ...settings.captcha, enabled: v } })}
          />
          </SettingGroup>

          <SettingGroup label="Closing">
          <SettingRow setting="settings.closeRules.closeAt" label="Close on a date">
            <Input
              type="datetime-local"
              className={CONTROL_WIDTH}
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
              setting="settings.closeRules.showCountdown" label="Show a countdown"
              description="Shows the time left in the chat."
              checked={settings.closeRules.showCountdown}
              onCheckedChange={(v) => patch({ closeRules: { ...settings.closeRules, showCountdown: v } })}
            />
          )}
          <SettingRow setting="settings.closeRules.maxSubmissions" label="Response limit" description="Close after this many responses.">
            <BufferedInput
              type="number"
              min={1}
              className={CONTROL_WIDTH}
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
              setting="settings.closeRules.showRemaining" label="Show spots left"
              /*
                Says what it publishes, not just what it does. A remaining
                count lets anyone holding the link work out how many people
                have responded — which is the point on a workshop signup and
                a leak on a hiring form, and the author is the only one who
                knows which of those this is.
              */
              description="Also reveals how many people have answered."
              checked={settings.closeRules.showRemaining}
              onCheckedChange={(v) => patch({ closeRules: { ...settings.closeRules, showRemaining: v } })}
            />
          )}
          <SettingRow setting="settings.closeRules.closedMessageMd" label="Closed message" description="Shown when the form is closed." stacked>
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
        <SettingSection title="Email notifications">
          <EmailNotificationSettings settings={settings} formTitle={formTitle ?? ""} onChange={onChange} />
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

      {section === "agent" && (
        <SettingSection title="Agent">
          <AgentSettings />
        </SettingSection>
      )}

      {section === "followup" && (
        <SettingSection title="Follow-ups">
          <p className="text-muted-foreground -mt-1 text-sm">
            Remind people who didn&apos;t finish. They get an email with a button to pick up
            where they left off.
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
    </SettingsShell>
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
      className={CONTROL_WIDTH}
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

type EmailTab = "me" | "respondent";

const EMAIL_TABS = [
  { value: "me", label: "Email to me" },
  { value: "respondent", label: "Email to respondent" },
] as const;

/**
 * The two emails a finished response sends, one tab each.
 *
 * They were one list: the owner's addresses, then a group headed "To the
 * respondent", and the notification address read as if it might receive the
 * confirmation too. Each mail now has its own page with the same rows in the
 * same order (the switch, who it goes to, where a reply lands, the subject).
 * The rows are plain: no card and no rule between them, only space.
 *
 * Where someone goes after finishing is not here. It is on each ending, since
 * a form with several endings sends each one somewhere different.
 */
function EmailNotificationSettings({
  settings,
  formTitle,
  onChange,
}: {
  settings: FormDoc["settings"];
  formTitle: string;
  onChange: (next: FormDoc["settings"]) => void;
}) {
  const onComplete = settings.onComplete;
  const confirmation = onComplete.autoReplyEmail;
  const patch = (p: Partial<typeof onComplete>) => onChange({ ...settings, onComplete: { ...onComplete, ...p } });
  const patchConfirmation = (p: Partial<typeof confirmation>) => patch({ autoReplyEmail: { ...confirmation, ...p } });

  const blocks = useBuilderStore((s) => s.doc?.blocks);
  const questions = useMemo(() => emailQuestions({ blocks: blocks ?? [] }), [blocks]);

  // A link to one of these settings opens the tab that holds it.
  const reveal = useSearchParams().get("reveal");
  const [tab, setTab] = useState<EmailTab>("me");
  const [revealed, setRevealed] = useState<string | null>(null);
  if (reveal && reveal !== revealed) {
    setRevealed(reveal);
    setTab(reveal.includes("autoReplyEmail") ? "respondent" : "me");
  }

  const owner = onComplete.notificationEmails[0];
  // Signing in with Google or an email code gives an address without asking for one.
  const hasAddress =
    questions.length > 0 || (settings.requireAuth.enabled && settings.requireAuth.method !== "phone");

  return (
    // No card per row: the rows sit flush with the heading and spacing alone
    // separates them.
    <div className="space-y-1 [&_[data-setting]]:px-0">
      <div className="flex pb-2">
        <SegmentedControl options={EMAIL_TABS} value={tab} onChange={setTab} ariaLabel="Which email" />
      </div>

      {tab === "me" ? (
        <>
            <SettingRow
              setting="settings.onComplete.notifyOwner" label="Receive email notifications"
              description="Get an email when someone submits your form."
              checked={onComplete.notifyOwner}
              onCheckedChange={(notifyOwner) => patch({ notifyOwner })}
            />
          <BlockedUntilOn
            blocked={!onComplete.notifyOwner}
            message="Turn on Receive email notifications first"
            className="space-y-1"
          >
            <SettingRow
              setting="settings.onComplete.notificationEmails" label="To"
              description={`Up to ${MAX_NOTIFICATION_EMAILS} addresses.`}
              issuePath="settings.onComplete.notificationEmails"
            >
              <NotificationEmailsInput
                emails={onComplete.notificationEmails}
                onChange={(notificationEmails) => patch({ notificationEmails })}
              />
            </SettingRow>
            <SettingRow
              setting="settings.onComplete.notificationReplyTo" label="Reply to"
              description="Where your reply to the notification goes."
            >
              <ReplyToField
                value={onComplete.notificationReplyTo}
                defaultLabel="The respondent"
                questions={questions}
                onChange={(notificationReplyTo) => patch({ notificationReplyTo })}
              />
            </SettingRow>
            <SettingRow
              setting="settings.onComplete.notificationSubject" label="Email subject"
              description="Write {{form.title}} to include the form name."
              stacked
            >
              <BufferedInput
                value={onComplete.notificationSubject}
                placeholder={`New response to ${formTitle || "your form"}`}
                onCommit={(v) => patch({ notificationSubject: v.trim() })}
              />
            </SettingRow>
          </BlockedUntilOn>
        </>
      ) : (
        <>
            <SettingRow
              setting="settings.onComplete.autoReplyEmail.enabled" label="Send email to respondent"
              description="Sent when they submit the form."
              checked={confirmation.enabled}
              onCheckedChange={(enabled) => patchConfirmation({ enabled })}
            />
          <BlockedUntilOn
            blocked={!confirmation.enabled}
            message="Turn on Send email to respondent first"
            className="space-y-1"
          >
            <SettingRow
              setting="settings.onComplete.autoReplyEmail.toField" label="To"
              description={
                hasAddress
                  ? "The email question it is sent to."
                  : "Add an email question so there is an address to send to."
              }
            >
              <Select
                value={questions.some((q) => q.ref === confirmation.toField) ? confirmation.toField : DEFAULT_CHOICE}
                onValueChange={(v) => patchConfirmation({ toField: v === DEFAULT_CHOICE ? "" : v })}
              >
                <SelectTrigger className={CONTROL_WIDTH} aria-label="Send to">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_CHOICE}>First email question</SelectItem>
                  {questions.map((q) => (
                    <SelectItem key={q.ref} value={q.ref}>
                      {q.title || q.ref}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
          <LockedControl feature="auto_reply_email">
              <SettingRow
                setting="settings.onComplete.autoReplyEmail.fromName" label="From name"
                description="The sender name they see."
              >
                <BufferedInput
                  className={CONTROL_WIDTH}
                  value={confirmation.fromName}
                  placeholder="chatform"
                  maxLength={100}
                  onCommit={(v) => patchConfirmation({ fromName: v.trim() })}
                />
              </SettingRow>
          </LockedControl>
            <SettingRow
              setting="settings.onComplete.autoReplyEmail.replyTo" label="Reply to"
              description="Where their reply goes."
            >
              <ReplyToField
                value={confirmation.replyTo}
                defaultLabel={owner ? `Form owner (${owner})` : "Form owner"}
                questions={questions}
                onChange={(replyTo) => patchConfirmation({ replyTo })}
              />
            </SettingRow>
          {/*
            The copy is behind the paywall and the switch is not: everybody
            sends the receipt, Pro writes its words. It stays visible while
            locked so the author can see what they would be buying.
          */}
          <LockedControl feature="auto_reply_email">
              <SettingRow setting="settings.onComplete.autoReplyEmail.subject" label="Email subject" stacked>
                <BufferedInput
                  value={confirmation.subject}
                  placeholder={DEFAULT_CONFIRMATION_SUBJECT}
                  onCommit={(v) => patchConfirmation({ subject: v })}
                />
              </SettingRow>
          </LockedControl>
          <LockedControl feature="auto_reply_email">
              <SettingRow
                setting="settings.onComplete.autoReplyEmail.bodyMd" label="Email body"
                description="Write {{form.title}} to include the form name."
                stacked
              >
                <BufferedTextarea
                  rows={5}
                  value={confirmation.bodyMd}
                  placeholder={DEFAULT_CONFIRMATION_BODY}
                  onCommit={(v) => patchConfirmation({ bodyMd: v })}
                />
              </SettingRow>
          </LockedControl>
            <SettingRow
              setting="settings.onComplete.autoReplyEmail.includeAnswers" label="Include their answers"
              description="Adds a copy of what they sent under the body."
              checked={confirmation.includeAnswers}
              onCheckedChange={(includeAnswers) => patchConfirmation({ includeAnswers })}
            />
          </BlockedUntilOn>
        </>
      )}
    </div>
  );
}

/** Select values that are not a question's ref. A ref is a slug, so neither can collide with one. */
const DEFAULT_CHOICE = "__default";
const CUSTOM_CHOICE = "__custom";

/**
 * Where a reply goes: the default, an email question, or an address typed out.
 *
 * The setting is one string (see `replyToChoice` in form-schema), so the
 * custom box only writes once it holds an address; until then the menu sitting
 * on "Custom email" is this component's own state.
 */
function ReplyToField({
  value,
  defaultLabel,
  questions,
  onChange,
}: {
  value: string;
  defaultLabel: string;
  questions: { ref: string; title: string }[];
  onChange: (next: string) => void;
}) {
  const [typing, setTyping] = useState(false);
  const stored = value.includes("@")
    ? CUSTOM_CHOICE
    : questions.some((q) => q.ref === value)
      ? value
      : DEFAULT_CHOICE;
  const selected = stored === DEFAULT_CHOICE && typing ? CUSTOM_CHOICE : stored;

  return (
    <div className={cn(CONTROL_WIDTH, "space-y-2")}>
      <Select
        value={selected}
        onValueChange={(v) => {
          setTyping(v === CUSTOM_CHOICE);
          if (v === CUSTOM_CHOICE) {
            if (stored !== CUSTOM_CHOICE) onChange("");
          } else {
            onChange(v === DEFAULT_CHOICE ? "" : v);
          }
        }}
      >
        <SelectTrigger className="w-full" aria-label="Reply to">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_CHOICE}>{defaultLabel}</SelectItem>
          {questions.map((q) => (
            <SelectItem key={q.ref} value={q.ref}>
              {q.title || q.ref}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM_CHOICE}>Custom email</SelectItem>
        </SelectContent>
      </Select>
      {selected === CUSTOM_CHOICE && (
        <BufferedInput
          type="email"
          aria-label="Custom reply-to email"
          value={stored === CUSTOM_CHOICE ? value : ""}
          placeholder="you@company.com"
          autoFocus={typing}
          onCommit={(v) => {
            const next = v.trim();
            if (!next || next.includes("@")) onChange(next);
          }}
        />
      )}
    </div>
  );
}

/**
 * One box per address, up to `MAX_NOTIFICATION_EMAILS`.
 *
 * The first box is always there, so clearing it leaves an empty box rather than
 * nothing to type into; every other box goes away with its address. A box added
 * with the plus holds no address until something is typed, because an empty
 * string in the list would fail the document's email check on the next save.
 */
function NotificationEmailsInput({
  emails,
  onChange,
}: {
  emails: string[];
  onChange: (next: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const showBlank = emails.length === 0 || adding;
  const canAdd = !showBlank && emails.length < MAX_NOTIFICATION_EMAILS;

  function set(i: number, raw: string) {
    const v = raw.trim();
    const taken = emails.some((e, j) => j !== i && e.toLowerCase() === v.toLowerCase());
    if (!v || taken) return onChange(emails.filter((_, j) => j !== i));
    onChange(emails.map((e, j) => (j === i ? v : e)));
  }

  function append(raw: string) {
    const v = raw.trim();
    if (!v) return;
    setAdding(false);
    if (emails.some((e) => e.toLowerCase() === v.toLowerCase())) return;
    onChange([...emails, v]);
  }

  return (
    <div className={cn(CONTROL_WIDTH, "space-y-2")}>
      {emails.map((email, i) => (
        <EmailBox
          key={i}
          value={email}
          onCommit={(v) => set(i, v)}
          onClear={() => onChange(emails.filter((_, j) => j !== i))}
        />
      ))}
      {showBlank && (
        <EmailBox
          key={emails.length}
          value=""
          autoFocus={adding}
          onCommit={append}
          onClear={emails.length > 0 ? () => setAdding(false) : undefined}
        />
      )}
      {canAdd && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground h-7 px-2 text-xs"
          onClick={() => setAdding(true)}
        >
          <Plus className="size-3.5" />
          Add email
        </Button>
      )}
    </div>
  );
}

function EmailBox({
  value,
  onCommit,
  onClear,
  autoFocus,
}: {
  value: string;
  onCommit: (v: string) => void;
  /** Absent on the one box that has nothing to clear and nowhere to go. */
  onClear?: () => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <BufferedInput
        type="email"
        className={cn("w-full", onClear && "pr-9")}
        value={value}
        placeholder="you@company.com"
        autoFocus={autoFocus}
        onCommit={onCommit}
      />
      {onClear && (
        <button
          type="button"
          aria-label={value ? `Remove ${value}` : "Remove"}
          className="text-background absolute top-1/2 right-2.5 -translate-y-1/2 rounded-full"
          onClick={onClear}
        >
          <CircleX className="fill-muted-foreground hover:fill-foreground size-4 transition-colors" />
        </button>
      )}
    </div>
  );
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
  setting,
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
   * `…​.0` the server actually complains about, an index into the list of boxes
   * this row draws.
   */
  issuePath?: string;
  /** The settings-registry key this row edits, for links that jump to it; see `setting-reveal.ts`. */
  setting?: string;
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
      <div data-setting={setting} className="space-y-2 px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          {description && <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>}
        </div>
        {withIssue}
      </div>
    );
  }

  // A switch stays beside its label at any width; an input drops below it on a
  // phone rather than squeezing the label into a column of single words.
  const isSwitch = checked !== undefined && onCheckedChange !== undefined;
  return (
    <div
      data-setting={setting}
      className={cn(
        "flex justify-between gap-4 px-4 py-3.5",
        isSwitch ? "items-center" : "flex-col gap-2 sm:flex-row sm:items-center sm:gap-4",
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">{description}</p>}
      </div>
      <div className={isSwitch ? "shrink-0" : "w-full shrink-0 sm:w-auto"}>{withIssue}</div>
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
      <p className="text-muted-foreground mt-0.5 mb-2 text-xs">Save values from the link with each response, like where people came from (?utm_source=instagram).</p>
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
      <p className="text-muted-foreground mt-0.5 mb-2 text-xs">A running total, like a quiz score. Logic changes it as people answer, and can use it to pick their ending.</p>
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
