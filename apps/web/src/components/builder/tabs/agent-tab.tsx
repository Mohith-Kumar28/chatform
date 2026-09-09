"use client";

import { useState } from "react";
import { Bot, BookOpen, Shield, Target, Coins } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SettingGroup, SettingRow } from "@/components/ui/setting-row";
import {  NumberField, SwitchField } from "../inspector/fields";
import { useBuilderStore } from "@/stores/builder-store";
import { KnowledgePanel } from "@/components/knowledge/knowledge-panel";

const SECTIONS = [
  { value: "persona", label: "Persona", icon: Bot },
  { value: "goal", label: "Goal", icon: Target },
  { value: "knowledge", label: "Knowledge", icon: BookOpen },
  { value: "guardrails", label: "Guardrails", icon: Shield },
  { value: "budget", label: "Budget", icon: Coins },
] as const;

type Section = (typeof SECTIONS)[number]["value"];

/**
 * The Agent tab — the reason this product isn't Youform.
 *
 * Blocks say WHAT to collect. This says who is asking, what they are trying to
 * achieve, what they may answer from, and what they must not do.
 */
export function AgentTab() {
  const doc = useBuilderStore((s) => s.doc);
  const edit = useBuilderStore((s) => s.edit);
  const formId = useBuilderStore((s) => s.formId);
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

  return (
    <div className="mx-auto h-[calc(100svh-3.5rem)] w-full max-w-3xl overflow-y-auto p-6">
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

            <SettingRow
              label="Let the agent reword questions"
              description="Off, each question is asked exactly as you wrote it."
              control={
                <SwitchField
                  label=""
                  checked={agent.rephraseQuestions}
                  onChange={(rephraseQuestions) => patch({ rephraseQuestions })}
                />
              }
            />

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
          <SettingGroup description="What the agent can answer when a respondent asks a question back. Everything you add here is read, indexed and looked up only when it is relevant — so a 200-page manual costs the same per conversation as a one-line FAQ.">
            <KnowledgePanel formId={formId} />
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

        {/*
          The model picker used to live here, offering Opus at roughly thirty
          times the cost of the tier below it — which made the per-conversation
          cost of the platform a choice for whoever opened a dropdown, on a
          screen that gave them no way to judge it. The model is now ours to
          pick; what is left are the two limits an author has a real stake in.
        */}
        {section === "budget" && (
          <SettingGroup description="How much a single conversation may spend.">
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

    </div>
  );
}
