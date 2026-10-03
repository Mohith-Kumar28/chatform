import { TONE_CLASSES, type BlockTone } from "@/components/builder/block-library";
import { Band } from "./band";
import { SectionLede, SectionTitle, TextLink } from "./kit";
import { QUESTION_TYPES, QUESTION_TYPE_COUNT_WORD } from "./question-types";
import { cn } from "@/lib/utils";

/**
 * Every question type, in three columns, each tile tinted with its family's
 * colour (the same tint it has in the builder). Built from the block library,
 * so a new block type appears here on the next build.
 */
const COLUMNS: { title: string; tones: BlockTone[] }[] = [
  { title: "The everyday details", tones: ["text", "contact", "number"] },
  { title: "A little room to choose", tones: ["choice", "scale"] },
  { title: "And the finishing touches", tones: ["advanced", "content"] },
];

export function QuestionTypesSection() {
  return (
    <Band id="question-types">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
        <div>
          <SectionTitle eyebrow="The right block for every ask" accent="every kind of answer.">
            Question types for
          </SectionTitle>
          <SectionLede>
            {QUESTION_TYPE_COUNT_WORD} of them, and every one has its own control in the chat: chips, stars, a calendar, a
            signature pad. People can still just type.
          </SectionLede>
          <div className="mt-7">
            <TextLink href="/docs/blocks">See every question type</TextLink>
          </div>
        </div>

        <div className="grid gap-x-8 gap-y-10 sm:grid-cols-3">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-muted-foreground text-xs font-bold tracking-[0.09em] uppercase">{col.title}</h3>
              <ul className="mt-5 space-y-3">
                {QUESTION_TYPES.filter((q) => col.tones.includes(q.tone)).map(({ type, label, icon: Icon, tone }) => (
                  <li key={type} className="flex items-center gap-3 text-[0.9375rem] font-medium">
                    <span className={cn("grid size-9 shrink-0 place-items-center rounded-[10px]", TONE_CLASSES[tone])}>
                      <Icon className="size-4" strokeWidth={2} />
                    </span>
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </Band>
  );
}
