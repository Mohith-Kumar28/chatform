"use client";

import { useState } from "react";
import { Bot, BookOpen, Shield, Target } from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SettingGroup, SettingRow } from "@/components/ui/setting-row";
import {  NumberField, SwitchField } from "../inspector/fields";
import { useBuilderStore } from "@/stores/builder-store";
import { KnowledgePanel } from "@/components/knowledge/knowledge-panel";
import { BufferedInput, BufferedTextarea } from "@/components/ui/buffered-input";

const SECTIONS = [
  { value: "persona", label: "Persona", icon: Bot },
  { value: "goal", label: "Goal", icon: Target },
  { value: "knowledge", label: "Knowledge", icon: BookOpen },
  { value: "guardrails", label: "Guardrails", icon: Shield },
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
        {/*
          No page heading. The tab you are on already says "Agent", and the
          sibling tabs (Results, Share, Integrate) print no title of their own —
          a heading here restated the nav and pushed the controls down a screen.
        */}
        <SegmentedControl
          options={SECTIONS}
          value={section}
          onChange={setSection}
          ariaLabel="Agent settings section"
        />

        {section === "persona" && (
          <SettingGroup>
            <SettingRow label="Interview style" control={
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
                ? "Rephrases, answers back, handles objections."
                : agent.mode === "hybrid"
                  ? "Conversational, falling back to your wording if the model is down."
                  : "Your exact wording. No AI cost."}
            </p>

            <SettingRow label="Name" description="Shown in the chat header." stacked>
              <BufferedInput
                value={agent.displayName ?? ""}
                placeholder={doc.title}
                onCommit={(v) => patch({ displayName: v || undefined }, "agentName")}
              />
            </SettingRow>

            <SettingRow
              label="Reword questions"
              description="Off, each is asked exactly as written."
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
              description="Who is this, and how do they talk?"
              stacked
            >
              <BufferedTextarea
                rows={4}
                maxLength={2000}
                value={agent.personaPrompt ?? ""}
                placeholder="You're Sam from the founding team. Warm, direct, allergic to corporate speak. You've talked to hundreds of customers."
                onCommit={(v) => patch({ personaPrompt: v || undefined }, "persona")}
              />
            </SettingRow>
          </SettingGroup>
        )}

        {section === "goal" && (
          <SettingGroup>
            <SettingRow label="Goal" stacked>
              <BufferedTextarea
                rows={3}
                maxLength={1000}
                value={agent.goal ?? ""}
                placeholder="Qualify the lead and, if they're a fit, get them to book a demo."
                onCommit={(v) => patch({ goal: v || undefined }, "goal")}
              />
            </SettingRow>
            <SettingRow
              label="What good looks like"
              description="When to dig deeper, when to move on."
              stacked
            >
              <BufferedTextarea
                rows={3}
                maxLength={1000}
                value={agent.successCriteria ?? ""}
                placeholder="We know their team size, budget range and timeline — and they left feeling heard, not processed."
                onCommit={(v) => patch({ successCriteria: v || undefined }, "success")}
              />
            </SettingRow>
          </SettingGroup>
        )}

        {section === "knowledge" && (
          /*
            No group description. It ran to three lines explaining indexing and
            per-conversation cost above a panel whose own empty state already
            says what knowledge is for.
          */
          <SettingGroup>
            <KnowledgePanel formId={formId} />
          </SettingGroup>
        )}

        {section === "guardrails" && (
          <SettingGroup>
            <SettingRow
              label="Answer off-topic questions"
              description="Off, it politely deflects."
              control={
                <SwitchField
                  label=""
                  checked={agent.guardrails.answerOffTopic}
                  onChange={(answerOffTopic) => patchGuards({ answerOffTopic })}
                />
              }
            />
            <SettingRow label="If it must decline" stacked>
              <BufferedInput
                value={agent.guardrails.refusalMessage}
                maxLength={500}
                onCommit={(v) => patchGuards({ refusalMessage: v })}
              />
            </SettingRow>
            <SettingRow label="Never discuss" description="One topic per line." stacked>
              <BufferedTextarea
                rows={3}
                value={agent.guardrails.forbiddenTopics.join("\n")}
                placeholder={"competitor pricing\nlegal advice"}
                onCommit={(v) =>
                  patchGuards({
                    forbiddenTopics: v
                      .split("\n")
                      .map((t) => t.trim())
                      .filter(Boolean)
                      .slice(0, 20),
                  })
                }
              />
            </SettingRow>
            {/*
              "Max turns" used to sit beside this. It went the same way as the
              token budget, and for the same reason: it is a ceiling on cost
              wearing the clothes of a preference. Nobody authoring a form knows
              what number is safe, the honest answer depends on the plan rather
              than on the form, and getting it wrong is invisible until a
              respondent is mid-conversation. The runtime reads it from the plan
              now (`clampForRuntime`), so leaving the control here would have
              been a field that quietly did nothing.

              "Give up after" stays, because it is a real authoring decision:
              how patient the interviewer should be before it stops asking in
              prose and puts the plain widget on screen.
            */}
            <NumberField
              label="Give up after"
              hint="Bad answers before it shows a widget."
              value={agent.escalateAfterInvalid}
              min={1}
              max={10}
              onChange={(v) => patch({ escalateAfterInvalid: v ?? 3 })}
            />
          </SettingGroup>
        )}

        {/*
          The model picker used to live here, offering Opus at roughly thirty
          times the cost of the tier below it — which made the per-conversation
          cost of the platform a choice for whoever opened a dropdown, on a
          screen that gave them no way to judge it. The model is now ours to
          pick, and so are the two token limits that sat beside it.

          They were removed for the same reason: "Token budget: 12000" is not a
          question an author can answer. It reads as a preference and behaves as
          a cliff — spend it and the interviewer quietly becomes a plain form
          mid-conversation, which is exactly what happened to a live
          registration form carrying the old 12,000 default. The runtime now
          derives the budget from the plan on every read (`clampForRuntime`), so
          it is right for every existing form without anyone republishing.
        */}
      </div>

    </div>
  );
}
