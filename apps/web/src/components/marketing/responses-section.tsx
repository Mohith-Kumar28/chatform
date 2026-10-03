import { Band } from "./band";
import { InView } from "./in-view";
import { ResultsPreview } from "./results-preview";
import { CheckItem, PANEL_SHADOW, SectionLede, SectionTitle, Split, TextLink } from "./kit";

/**
 * A response is a conversation, so it reads as one: the transcript beside the
 * answers that were recorded from it.
 */
export function ResponsesSection() {
  return (
    <Band id="responses" hairline>
      <Split cols="lg:grid-cols-[1.1fr_0.9fr]">
        <InView className={`order-2 lg:order-1 bg-card rounded-[18px] border p-4 sm:p-6 ${PANEL_SHADOW}`}>
          <ResultsPreview />
        </InView>
        <div className="order-1 lg:order-2">
          <SectionTitle eyebrow="Every response" accent="not the row.">
            Read the conversation,
          </SectionTitle>
          <SectionLede>What you asked, what they said, and what got recorded, side by side.</SectionLede>
          <ul className="mt-7 space-y-3 text-[0.9375rem]">
            <CheckItem>Clean answers in columns, ready for a spreadsheet</CheckItem>
            <CheckItem>The full chat behind each one, when you need the why</CheckItem>
            <CheckItem>Search, filter and export to CSV or Excel</CheckItem>
          </ul>
          <div className="mt-8">
            <TextLink href="/signin?mode=signup">See your first response</TextLink>
          </div>
        </div>
      </Split>
    </Band>
  );
}
