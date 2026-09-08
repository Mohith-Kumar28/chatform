"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Textarea } from "@/components/ui/textarea";
import type { FormDoc } from "@repo/form-schema";
import { LockedControl } from "@/components/billing/gate";
import { LinkSettings } from "./link-settings";
import { FollowUpPanel } from "./followup-panel";
import { ShortcutsList } from "@/components/ui/shortcuts-dialog";
import { useBuilderStore } from "@/stores/builder-store";

interface SettingsPanelProps {
  settings: FormDoc["settings"];
  onChange: (next: FormDoc["settings"]) => void;
  formTitle?: string;
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
  hiddenFields,
  onHiddenFieldsChange,
  variables,
  onVariablesChange,
  slug,
}: SettingsPanelProps) {
  const params = useParams<{ id: string; section?: string[] }>();

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
              <SettingGroup>
              <LockedControl feature="duplicate_prevention">
              <SettingRow label="Duplicate responses" description="Control whether the same person can respond twice.">
                <Select
                  value={settings.duplicates.strategy}
                  onValueChange={(v) =>
                    patch({ duplicates: { ...settings.duplicates, strategy: v as FormDoc["settings"]["duplicates"]["strategy"] } })
                  }
                >
                  <SelectTrigger className="w-auto min-w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Allow repeats</SelectItem>
                    <SelectItem value="ip_daily">One per device per day</SelectItem>
                    <SelectItem value="field">Fingerprint by answer field</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
              </LockedControl>
              </SettingGroup>
            </SettingSection>
          )}

          {/* The AI Interviewer settings moved to the Agent tab, which has room
              for the persona, goal, knowledge base and guardrails. */}
          {section === "access" && (
            <SettingSection title="Access & closing">
              <SettingGroup label="Who can respond">
              <LockedControl feature="respondent_auth_google">
                <SettingRow
                  label="Require sign-in"
                  description="Respondents verify who they are before the first question."
                  checked={settings.requireAuth.enabled}
                  onCheckedChange={(v) => patch({ requireAuth: { ...settings.requireAuth, enabled: v } })}
                />
              </LockedControl>
              {settings.requireAuth.enabled && (
                <>
                  <SettingRow label="Accepted methods">
                    <div className="flex gap-1.5">
                      {(["google", "phone"] as const).map((m) => {
                        const on = settings.requireAuth.methods.includes(m);
                        return (
                          <button
                            key={m}
                            type="button"
                            aria-pressed={on}
                            onClick={() => {
                              const next = on
                                ? settings.requireAuth.methods.filter((x) => x !== m)
                                : [...settings.requireAuth.methods, m];
                              // At least one method has to stay on, or the form
                              // becomes impossible to answer.
                              if (next.length === 0) return;
                              patch({ requireAuth: { ...settings.requireAuth, methods: next } });
                            }}
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
                  <SettingRow
                    label="What the agent says"
                    description="The sentence shown above the sign-in buttons."
                    stacked
                  >
                    <Textarea
                      rows={2}
                      value={settings.requireAuth.message}
                      onChange={(e) => patch({ requireAuth: { ...settings.requireAuth, message: e.target.value } })}
                    />
                  </SettingRow>
                  <SettingRow
                    label="One response per person"
                    description="A verified identity can only answer once."
                    checked={settings.requireAuth.onePerIdentity}
                    onCheckedChange={(v) => patch({ requireAuth: { ...settings.requireAuth, onePerIdentity: v } })}
                  />
                </>
              )}
              <SettingRow
                label="Require password"
                description="Only people with the password can respond."
                checked={settings.password.enabled}
                onCheckedChange={(v) => patch({ password: { ...settings.password, enabled: v, value: settings.password.value || "letmein" } })}
              />
              {settings.password.enabled && (
                <SettingRow label="Password">
                  <Input
                    className="max-w-xs"
                    value={settings.password.value}
                    onChange={(e) => patch({ password: { ...settings.password, value: e.target.value } })}
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
              <SettingRow label="Close after N submissions" description="Cap the total number of responses.">
                <Input
                  type="number"
                  min={1}
                  className="w-32"
                  placeholder="No limit"
                  value={settings.closeRules.maxSubmissions ?? ""}
                  onChange={(e) =>
                    patch({
                      closeRules: {
                        ...settings.closeRules,
                        maxSubmissions: e.target.value ? Number(e.target.value) : undefined,
                      },
                    })
                  }
                />
              </SettingRow>
              <SettingRow label="Closed message" description="Shown when the form is closed." stacked>
                <Textarea
                  rows={2}
                  value={settings.closeRules.closedMessageMd}
                  onChange={(e) => patch({ closeRules: { ...settings.closeRules, closedMessageMd: e.target.value } })}
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
              <SettingRow label="Notification emails" description="Get an email for every completed response.">
                <Input
                  className="max-w-md"
                  value={settings.onComplete.notificationEmails.join(", ")}
                  placeholder="you@company.com"
                  onChange={(e) =>
                    patch({
                      onComplete: {
                        ...settings.onComplete,
                        notificationEmails: e.target.value
                          .split(",")
                          .map((x) => x.trim())
                          .filter(Boolean),
                      },
                    })
                  }
                />
              </SettingRow>
              <LockedControl feature="completion_redirect">
              <SettingRow label="Redirect after completion" description="Send respondents to your own thank-you page.">
                <Input
                  className="max-w-md"
                  value={settings.onComplete.redirectUrl ?? ""}
                  placeholder="https://yoursite.com/thanks"
                  onChange={(e) =>
                    patch({
                      onComplete: {
                        ...settings.onComplete,
                        redirectUrl: e.target.value || undefined,
                      },
                    })
                  }
                />
              </SettingRow>
              </LockedControl>
              </SettingGroup>
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

// ── building blocks ──────────────────────────────────────────────────

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
}: {
  label: string;
  description?: string;
  children?: React.ReactNode;
  checked?: boolean;
  onCheckedChange?: (v: boolean) => void;
  stacked?: boolean;
}) {
  const control =
    checked !== undefined && onCheckedChange ? (
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    ) : (
      children
    );

  if (stacked) {
    return (
      <div className="space-y-2 px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          {description && <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>}
        </div>
        {control}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">{description}</p>}
      </div>
      <div className="shrink-0">{control}</div>
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
