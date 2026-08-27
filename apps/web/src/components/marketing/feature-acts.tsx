import Link from "next/link";
import {
  BadgeCheck,
  BarChart3,
  Blocks,
  Braces,
  Download,
  FileText,
  GitBranch,
  KeyRound,
  MessagesSquare,
  Palette,
  PencilLine,
  ShieldAlert,
  Sparkles,
  Undo2,
  Webhook,
} from "lucide-react";
import { BentoCard, BentoGrid } from "./bento-card";
import { Section } from "./section";
import { AgentPanelPreview } from "./agent-panel-preview";
import { ResultsPreview } from "./results-preview";
import { FlowPreview } from "./flow-preview";

export function ActBuild() {
  return (
    <Section
      eyebrow="Build"
      title="A builder that keeps up with the idea."
      lede="Everything a modern form builder does — and a linter that refuses to publish a flow with a question nobody can reach."
    >
      <BentoGrid>
        <BentoCard
          span={2}
          icon={Sparkles}
          tone="content"
          title="Generate the whole thing from one sentence"
          body="Questions, options, multiple endings and the branch rules between them. The output is normalised, run through the linter, and regenerated if it fails — so what lands in your builder is publishable, not a sketch."
          footer={
            <p className="text-micro text-muted-foreground">
              The AI bar in the builder edits an existing flow too — it rewrites routing, not just
              appends questions.
            </p>
          }
        />
        <BentoCard
          icon={Blocks}
          tone="choice"
          title="26 question types"
          body="Text, contact, numbers and dates, six kinds of choice, four kinds of scale, uploads, signatures and consent."
          footer={
            <Link
              href="#question-types"
              className="text-body text-primary hover:underline underline-offset-4"
            >
              See all of them →
            </Link>
          }
          delay={0.06}
        />
        <BentoCard
          icon={GitBranch}
          tone="scale"
          title="Branching that can't ship broken"
          body="19 operators, nested and/or groups, variables and scoring. The linter walks every path before publish; an unreachable question is an error, not a surprise."
          media={
            <div className="border-border/70 bg-background rounded-xl border p-2">
              <FlowPreview />
            </div>
          }
          delay={0.12}
        />
        <BentoCard
          span={2}
          icon={PencilLine}
          tone="text"
          title="Every setting, per question"
          body="An image, a short video or a downloadable file attached to any question. Prefill from a URL parameter. A custom button label. And per-question hints for the interviewer — how to ask it, why you're asking, what to say if the answer comes back unusable."
          delay={0.18}
        />
      </BentoGrid>
    </Section>
  );
}

export function ActConverse() {
  return (
    <Section
      tone="muted"
      eyebrow="Converse"
      title="An interviewer you can actually direct."
      lede="Give it a brief the way you'd brief a person — a goal, a voice, things it must not say — then let it hold the conversation."
    >
      <BentoGrid>
        <BentoCard
          span={2}
          icon={MessagesSquare}
          tone="content"
          title="A persona, a goal, and things it will not discuss"
          body="Name it, set its tone, tell it what a successful conversation looks like. Load a knowledge base it can quote from. Forbid topics, write the line it declines with, and cap how long it may go on."
          media={<AgentPanelPreview />}
        />
        <BentoCard
          icon={ShieldAlert}
          tone="advanced"
          title="Or guarantee the exact wording"
          body="Turn rephrasing off and your question text is emitted verbatim while the model is told not to ask it. Guaranteed, not requested — which is what compliance work and research instruments need."
          delay={0.06}
        />
        <BentoCard
          icon={Braces}
          tone="number"
          title="It understands what people type"
          body={
            <>
              &ldquo;About a dozen&rdquo; becomes <span className="font-mono text-foreground">12</span>. Choices
              and scales stay exact-match and instant; only free text goes to the model, and a
              low-confidence read becomes a follow-up question rather than a guess.
            </>
          }
          delay={0.12}
        />
        <BentoCard
          icon={BadgeCheck}
          tone="contact"
          title="Verify who answered"
          body="Google sign-in verified against Google's own keys, or a six-digit SMS code. No account is created — it's an attestation stored on the response. Cap it to one response per verified person."
          delay={0.18}
        />
        <BentoCard
          icon={Undo2}
          tone="choice"
          title="They can leave, come back, and change their mind"
          body="Answers persist server-side and the session is remembered on their device. Any earlier answer can be re-answered, and nothing counts until they review everything and press submit."
          delay={0.24}
        />
      </BentoGrid>
    </Section>
  );
}

export function ActCollect() {
  return (
    <Section
      eyebrow="Collect"
      title="Read the conversation, not just the row."
      lede="Every response is a transcript first and a set of fields second. The reasoning behind an answer is right there next to the answer."
    >
      <BentoGrid>
        <BentoCard
          span={2}
          icon={FileText}
          tone="content"
          title="The whole exchange, kept"
          body="What you asked, what they said, what got recorded and what they asked you back. Filter by completed or partial, open any one of them, and see both halves side by side."
          media={<ResultsPreview />}
        />
        <BentoCard
          icon={BarChart3}
          tone="scale"
          title="Analytics that follow the branch"
          body="Views, starts, completion rate and average duration, plus per-question answer rates and answer distributions — computed against the path each respondent actually took."
          delay={0.06}
        />
        <BentoCard
          icon={Webhook}
          tone="advanced"
          title="Signed webhooks that retry"
          body="HMAC-SHA256 on every delivery, a log of what was sent and what came back, and queue-backed retries with backoff when your endpoint has a bad afternoon."
          delay={0.12}
        />
        <BentoCard
          icon={Download}
          tone="number"
          title="Export the lot"
          body="CSV with one column per question. Partial responses and full transcripts included on Pro."
          delay={0.18}
        />
        <BentoCard
          icon={Palette}
          tone="text"
          title="Make it look like you"
          body="Colours, bubble shapes, corner radius, heading and body fonts, your logo and brand name. Drop the chatform badge on Pro."
          delay={0.24}
        />
      </BentoGrid>
    </Section>
  );
}

export const DEVELOPER_ICON = KeyRound;
