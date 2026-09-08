import { AiBuildPreview } from "./ai-build-preview";
import { FlowPreview } from "./flow-preview";
import { ResultsPreview, type ResultsTranscriptTurn } from "./results-preview";
import { SharePanel } from "./share-panel";
import type { UseCase, UseCaseStep } from "@/content/use-cases/define";

/**
 * The picture beside a step.
 *
 * These are the product's own interface, re-drawn as components, rather than
 * screenshots. That is a deliberate trade and worth writing down, because
 * "put a screenshot here" is the obvious answer:
 *
 *  - A screenshot is one theme. This site ships light and dark and a reader in
 *    dark mode would get a bright rectangle in the middle of a dark page.
 *  - A screenshot is one width. These reflow on a phone, which is where a
 *    large share of the people these guides are written for will read them.
 *  - A screenshot goes stale silently. Nothing tells you the builder moved a
 *    button; the picture just quietly starts lying. These are built from the
 *    same tokens and the same families as the real screens, and the marketing
 *    claims test fails if a question family stops existing.
 *
 * The cost is that they are reproductions, not captures. That is the right
 * cost to pay for a page whose whole job is to still be true in six months.
 */
/**
 * The first two question-and-answer exchanges of this guide's own demo.
 *
 * Derived rather than authored, because the demo script IS the conversation
 * this page is about — writing a second, separate sample would be two things
 * that have to agree with each other forever. Takes the answer somebody
 * actually gave, whether that was a tapped choice or something they typed.
 */
function transcriptFromDemo(useCase: UseCase): ResultsTranscriptTurn[] {
  const out: ResultsTranscriptTurn[] = [];
  for (let i = 0; i < useCase.demo.length - 1 && out.length < 4; i++) {
    const question = useCase.demo[i];
    const answer = useCase.demo[i + 1];
    if (question?.role !== "bot" || answer?.role !== "user") continue;
    out.push({ role: "bot", text: question.text });
    out.push({ role: "user", text: answer.picked ?? answer.pickedAll?.join(", ") ?? answer.text });
  }
  return out;
}

export function UseCaseFigure({
  figure,
  useCase,
}: {
  figure: NonNullable<UseCaseStep["figure"]>;
  useCase: UseCase;
}) {
  switch (figure) {
    case "prompt":
    case "questions":
      return (
        <AiBuildPreview
          prompt={useCase.draft.prompt}
          readUrl={useCase.draft.readUrl}
          readPages={useCase.draft.readPages}
          questions={useCase.draft.questions}
        />
      );
    case "flow":
      return <FlowPreview />;
    case "share":
      return <SharePanel slug={useCase.shareSlug} qrLabel={useCase.qrLabel} />;
    case "results":
      return (
        <ResultsPreview
          transcript={transcriptFromDemo(useCase)}
          fields={useCase.resultFields}
          reference={useCase.responseReference}
        />
      );
    case "chat":
      return null;
  }
}
