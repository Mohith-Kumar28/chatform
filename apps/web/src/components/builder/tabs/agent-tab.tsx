"use client";

import { useState } from "react";
import {
  Bot,
  BookOpen,
  Plus,
  Shield,
  Sparkles,
  Target,
  Trash2,
  Cpu,
} from "lucide-react";
import { KNOWLEDGE_CHAR_BUDGET, knowledgeSize } from "@repo/form-schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SettingGroup, SettingRow } from "@/components/ui/setting-row";
import { Field, SelectField, NumberField, SwitchField, TextField } from "../inspector/fields";
import { PreviewChat } from "../preview-chat";
import { useBuilderStore } from "@/stores/builder-store";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { value: "persona", label: "Persona", icon: Bot },
  { value: "goal", label: "Goal", icon: Target },
  { value: "knowledge", label: "Knowledge", icon: BookOpen },
  { value: "guardrails", label: "Guardrails", icon: Shield },
  { value: "model", label: "Model", icon: Cpu },
] as const;

type Section = (typeof SECTIONS)[number]["value"];

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;

/**
 * The Agent tab — the reason this product isn't Youform.
 *
 * Blocks say WHAT to collect. This says who is asking, what they are trying to
 * achieve, what they may answer from, and what they must not do.
 */
export function AgentTab() {
  const doc = useBuilderStore((s) => s.doc);
  const formId = useBuilderStore((s) => s.formId);
  const edit = useBuilderStore((s) => s.edit);
  const [section, setSection] = useState<Section>("persona");

  if (!doc) return null;
  const agent = doc.settings.agent;

  const patch = (p: Partial<typeof agent>, coalesceKey?: string) =>
    edit((d) => {
      Object.assign(d.settings.agent, p);
    }, coalesceKey);

  const patchGuards = (p: Partial<typeof agent.guardrails>) =>
    edit((d) => {
      Object.assign(d.settings.agent.guardrails, p);
    });

  const used = knowledgeSize(agent.knowledge);
  const overBudget = used > KNOWLEDGE_CHAR_BUDGET;

  return (
    <div className="mx-auto grid h-[calc(100svh-3.5rem)] w-full max-w-6xl grid-cols-1 gap-6 overflow-y-auto p-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-6">
        <div className="space-y-1">
          <h1 className="text-h1">Agent</h1>
          <p className="text-muted-foreground text-body">
            Your form is an interviewer. This is who it is and how it behaves.
          </p>
        </div>

        <SegmentedControl
          options={SECTIONS}
          value={section}
          onChange={setSection}
          ariaLabel="Agent settings section"
        />

        {section === "persona" && (
          <SettingGroup>
            <SettingRow label="Interview style" description="How the agent sounds throughout." control={
              <SegmentedControl
                size="sm"
                options={[
                  { value: "ai", label: "Agentic" },
                  { value: "hybrid", label: "Hybrid" },
                  { value: "template", label: "Scripted" },
                ]}
                value={agent.mode}
                onChange={(mode) => patch({ mode })}
              />
            } />
            <p className="text-muted-foreground text-micro -mt-1 px-1">
              {agent.mode === "ai"
                ? "Fully conversational — rephrases, answers questions back, handles objections."
                : agent.mode === "hybrid"
                  ? "Conversational phrasing, but falls back to scripted text when the model is unavailable."
                  : "Fixed wording, zero AI cost. Fastest and completely predictable."}
            </p>

            <SettingRow label="Name" description="Shown in the chat header." stacked>
              <Input
                value={agent.displayName ?? ""}
                placeholder={doc.title}
                onChange={(e) => patch({ displayName: e.target.value || undefined }, "agentName")}
              />
            </SettingRow>

            <SettingRow label="Tone" control={
              <SegmentedControl
                size="sm"
                options={[
                  { value: "friendly", label: "Friendly" },
                  { value: "professional", label: "Professional" },
                  { value: "playful", label: "Playful" },
                ]}
                value={agent.tone}
                onChange={(tone) => patch({ tone })}
              />
            } />

            <SettingRow
              label="Persona"
              description="Free-form character notes. Who is this, and how do they talk?"
              stacked
            >
              <Textarea
                rows={4}
                maxLength={2000}
                value={agent.personaPrompt ?? ""}
                placeholder="You're Sam from the founding team. Warm, direct, allergic to corporate speak. You've talked to hundreds of customers."
                onChange={(e) => patch({ personaPrompt: e.target.value || undefined }, "persona")}
              />
            </SettingRow>
          </SettingGroup>
        )}

        {section === "goal" && (
          <SettingGroup description="What a good conversation achieves, beyond every field being filled.">
            <SettingRow label="Goal" stacked>
              <Textarea
                rows={3}
                maxLength={1000}
                value={agent.goal ?? ""}
                placeholder="Qualify the lead and, if they're a fit, get them to book a demo."
                onChange={(e) => patch({ goal: e.target.value || undefined }, "goal")}
              />
            </SettingRow>
            <SettingRow
              label="What good looks like"
              description="Helps the agent decide when to dig deeper and when to move on."
              stacked
            >
              <Textarea
                rows={3}
                maxLength={1000}
                value={agent.successCriteria ?? ""}
                placeholder="We know their team size, budget range and timeline — and they left feeling heard, not processed."
                onChange={(e) => patch({ successCriteria: e.target.value || undefined }, "success")}
              />
            </SettingRow>
          </SettingGroup>
        )}

        {section === "knowledge" && (
          <SettingGroup description="What the agent can answer when a respondent asks a question back.">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-caption text-muted-foreground tabular">
                  {used.toLocaleString()} / {KNOWLEDGE_CHAR_BUDGET.toLocaleString()} characters
                </span>
                {overBudget && <Badge variant="destructive">Over budget</Badge>}
              </div>
              <Button
                size="sm"
                shape="pill"
                disabled={agent.knowledge.length >= 20}
                onClick={() =>
                  patch({
                    knowledge: [...agent.knowledge, { id: uid("kb"), title: "", body: "" }],
                  })
                }
              >
                <Plus className="size-3.5" />
                Add entry
              </Button>
            </div>

            <div
              className={cn(
                "bg-muted h-1 overflow-hidden rounded-full",
                overBudget && "bg-[var(--destructive-soft)]",
              )}
            >
              <div
                className={cn("h-full rounded-full transition-all", overBudget ? "bg-destructive" : "bg-primary")}
                style={{ width: `${Math.min(100, (used / KNOWLEDGE_CHAR_BUDGET) * 100)}%` }}
              />
            </div>

            {agent.knowledge.length === 0 ? (
              <EmptyState
                compact
                icon={BookOpen}
                title="No knowledge yet"
                description="Add your pricing, FAQ or policies and the agent can answer questions mid-form instead of deflecting."
              />
            ) : (
              <div className="space-y-3">
                {agent.knowledge.map((entry, i) => (
                  <div key={entry.id} className="border-border bg-card space-y-2 rounded-xl border p-3">
                    <div className="flex items-center gap-2">
                      <Input
                        value={entry.title}
                        placeholder="Pricing"
                        className="h-8 font-medium"
                        onChange={(e) =>
                          edit((d) => {
                            d.settings.agent.knowledge[i]!.title = e.target.value;
                          }, `kbTitle:${entry.id}`)
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remove entry"
                        className="hover:text-destructive shrink-0"
                        onClick={() =>
                          patch({ knowledge: agent.knowledge.filter((k) => k.id !== entry.id) })
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    <Textarea
                      rows={4}
                      value={entry.body}
                      placeholder="Pro is $29/month billed monthly, or $240/year. It includes 1,000 responses, the AI agent, and no chatform branding."
                      onChange={(e) =>
                        edit((d) => {
                          d.settings.agent.knowledge[i]!.body = e.target.value;
                        }, `kbBody:${entry.id}`)
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </SettingGroup>
        )}

        {section === "guardrails" && (
          <SettingGroup description="The edges of the conversation.">
            <SettingRow
              label="Answer off-topic questions"
              description="When on, the agent may answer things your knowledge base doesn't cover. When off, it politely deflects."
              control={
                <SwitchField
                  label=""
                  checked={agent.guardrails.answerOffTopic}
                  onChange={(answerOffTopic) => patchGuards({ answerOffTopic })}
                />
              }
            />
            <SettingRow label="If it must decline" stacked>
              <Input
                value={agent.guardrails.refusalMessage}
                maxLength={500}
                onChange={(e) => patchGuards({ refusalMessage: e.target.value })}
              />
            </SettingRow>
            <SettingRow label="Never discuss" description="One topic per line." stacked>
              <Textarea
                rows={3}
                value={agent.guardrails.forbiddenTopics.join("\n")}
                placeholder={"competitor pricing\nlegal advice"}
                onChange={(e) =>
                  patchGuards({
                    forbiddenTopics: e.target.value
                      .split("\n")
                      .map((t) => t.trim())
                      .filter(Boolean)
                      .slice(0, 20),
                  })
                }
              />
            </SettingRow>
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Max turns"
                hint="Hard stop on runaway conversations."
                value={agent.guardrails.maxTurns}
                min={5}
                max={200}
                onChange={(v) => patchGuards({ maxTurns: v ?? 60 })}
              />
              <NumberField
                label="Give up after"
                hint="Bad answers before showing a widget instead."
                value={agent.escalateAfterInvalid}
                min={1}
                max={10}
                onChange={(v) => patch({ escalateAfterInvalid: v ?? 3 })}
              />
            </div>
          </SettingGroup>
        )}

        {section === "model" && (
          <SettingGroup description="Which model runs the interview, and how much it may spend.">
            <SelectField
              label="Model"
              hint="Sonnet 5 is the default and handles objections and off-topic questions best."
              value={agent.model ?? "default"}
              onChange={(v) => patch({ model: v === "default" ? undefined : v })}
              options={[
                { value: "default", label: "Claude Sonnet 5 (recommended)" },
                { value: "anthropic/claude-opus-5", label: "Claude Opus 5 — highest quality" },
                { value: "anthropic/claude-haiku-4-5", label: "Claude Haiku 4.5 — fastest, cheapest" },
                { value: "openai/gpt-4o-mini", label: "GPT-4o mini" },
              ]}
            />
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Token budget"
                hint="Per conversation. Falls back to scripted when spent."
                value={agent.sessionTokenBudget}
                min={1000}
                max={200000}
                onChange={(v) => patch({ sessionTokenBudget: v ?? 12000 })}
              />
              <NumberField
                label="Reply length"
                hint="Max tokens per agent turn."
                value={agent.responseMaxTokens}
                min={50}
                max={2000}
                onChange={(v) => patch({ responseMaxTokens: v ?? 400 })}
              />
            </div>
          </SettingGroup>
        )}
      </div>

      {/* Test it here rather than switching tabs to find out what changed. */}
      <aside className="hidden h-[34rem] lg:sticky lg:top-6 lg:block">
        <div className="mb-2 flex items-center gap-1.5">
          <Sparkles className="text-primary size-3.5" />
          <p className="text-caption font-medium">Try it</p>
        </div>
        <PreviewChat formId={formId} doc={doc} />
      </aside>
    </div>
  );
}
