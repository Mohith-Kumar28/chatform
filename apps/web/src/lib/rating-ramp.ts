/**
 * The five faces of a bug report, as colour: terrible → great.
 *
 * The same values as `--rating-1…5` in `globals.css`, held here too because the
 * chat runtime cannot use those. A form's page is themed by its author, not by
 * the dashboard's light/dark setting — a black form renders on a light-mode
 * laptop — so the respondent's panel has to choose the step from the *form's*
 * background, which is what `chatThemeVars` does with this.
 *
 * Change a value in one place and the console and the respondent's own faces
 * disagree about what "bad" looks like. Change both, and re-run the dataviz
 * palette checker against each surface; the reasoning for these steps is in the
 * comment above the CSS tokens.
 */
export const RATING_RAMP = {
  light: ["#b00c15", "#d66919", "#e0ab22", "#2b8a36", "#00c47f"],
  dark: ["#db423c", "#f98942", "#ffcf53", "#4ea954", "#45eca4"],
} as const;
