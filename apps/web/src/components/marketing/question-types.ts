import { BLOCK_LIBRARY } from "@/components/builder/block-library";

/**
 * The question types, as marketing is allowed to describe them.
 *
 * Three places used to say how many there are — a plan card ("All 26 question
 * types"), a pricing heading ("Twenty-six ways to ask.") and a strip under the
 * hero — and all three said twenty-six by hand. The registry has twenty-five.
 * Nobody mistyped it once; it was typed correctly at some point and then a
 * block type left the library and no one went looking for the prose.
 *
 * So the count is derived and the number is never written down again. Add or
 * remove a block type and every claim on the marketing site follows on the
 * next build, which is the same reason `BlockTypeGrid` renders from the
 * registry instead of keeping its own list.
 *
 * There is deliberately no exclusion list here. There used to be one, for
 * `payment`, because its respondent renderer said payment collection was not
 * enabled — an honest exclusion at the time and a stale one now that the block
 * ships a real affordance and `collect_payments` has lost its `soon` flag.
 * A hardcoded omission is the same class of bug as a hardcoded count.
 */
export const QUESTION_TYPES = BLOCK_LIBRARY;

export const QUESTION_TYPE_COUNT = QUESTION_TYPES.length;

/** For prose, where a numeral in a display heading reads as a spec sheet. */
const WORDS: Record<number, string> = {
  20: "Twenty",
  21: "Twenty-one",
  22: "Twenty-two",
  23: "Twenty-three",
  24: "Twenty-four",
  25: "Twenty-five",
  26: "Twenty-six",
  27: "Twenty-seven",
  28: "Twenty-eight",
  29: "Twenty-nine",
  30: "Thirty",
};

export const QUESTION_TYPE_COUNT_WORD =
  WORDS[QUESTION_TYPE_COUNT] ?? String(QUESTION_TYPE_COUNT);
