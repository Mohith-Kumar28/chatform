import { Band } from "./band";
import { InView } from "./in-view";
import { AgentPanelPreview } from "./agent-panel-preview";
import { CheckItem, PANEL_SHADOW, SectionLede, SectionTitle, Split, TextLink } from "./kit";

/**
 * The interviewer's brief: a goal, a knowledge base it can quote, and the
 * topics it will not touch. The picture is the agent panel from the builder.
 */
export function AgentBrief() {
  return (
    <Band id="agent" hairline>
      <Split cols="lg:grid-cols-[1fr_1fr]">
        <div>
          <SectionTitle eyebrow="Your interviewer" accent="like a person.">
            Then brief it
          </SectionTitle>
          <SectionLede>
            Tell it what the form is for and what it may say. It asks your questions in your voice and stays on the
            topics you allow.
          </SectionLede>
          <ul className="mt-7 space-y-3 text-[0.9375rem]">
            <CheckItem>A knowledge base it can quote: your docs, pages and notes</CheckItem>
            <CheckItem>
              A persona and a goal, like &ldquo;qualify the lead, then book a demo&rdquo;
            </CheckItem>
            <CheckItem>
              Guardrails for what it won&apos;t discuss, and how it declines
            </CheckItem>
            <CheckItem>A switch to ask every question word for word</CheckItem>
          </ul>
          <div className="mt-8">
            <TextLink href="/why-conversation-works">Why a conversation works</TextLink>
          </div>
        </div>
        <InView className={`bg-card rounded-[18px] border p-4 sm:p-6 ${PANEL_SHADOW}`}>
          <AgentPanelPreview />
        </InView>
      </Split>
    </Band>
  );
}
