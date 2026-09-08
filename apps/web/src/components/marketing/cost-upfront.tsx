/**
 * The same twenty-five questions, drawn twice.
 *
 * Deliberately not a funnel chart. A funnel with numbers on it would be a
 * conversion claim, and there is no cross-customer conversion data in this
 * product to make one from — analytics computes completion rate and per-question
 * drop-off for *your* form, one form at a time, and nothing aggregates across
 * accounts. So this draws the thing that is actually true and actually visible:
 * a form shows you its whole length before you answer anything, and a
 * conversation shows you one question.
 *
 * Static, `role="img"`, and nothing animates — the landing page has exactly one
 * entrance on it, and that is the h1.
 */
export function CostUpfront() {
  return (
    <svg
      viewBox="0 0 420 240"
      role="img"
      aria-label="Twenty-five form fields stacked on one screen, beside the same questions asked as a conversation."
      className="w-full max-w-xl"
      fill="none"
    >
      <defs>
        {/* `currentColor` cannot be used for the transparent stop — a
            transparent black and a transparent cream fade through different
            greys — so both stops are the page's own ground token, one of them
            at zero alpha. */}
        <linearGradient id="cf-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-background)" stopOpacity="0" />
          <stop offset="55%" stopColor="var(--color-background)" stopOpacity="1" />
          <stop offset="100%" stopColor="var(--color-background)" stopOpacity="1" />
        </linearGradient>
      </defs>
      {/* Left: the form, cropped by its own frame — it does not fit, and that
          is the point of the drawing. */}
      <g>
        <rect
          x="6"
          y="18"
          width="176"
          height="206"
          rx="10"
          className="fill-background"
          stroke="currentColor"
          strokeOpacity="0.28"
          strokeWidth="1.5"
        />
        {Array.from({ length: 11 }, (_, i) => (
          <g key={i} transform={`translate(24 ${34 + i * 17})`}>
            <rect
              width={i % 3 === 0 ? 58 : 44}
              height="4"
              rx="2"
              fill="currentColor"
              fillOpacity="0.3"
            />
            <rect
              y="7"
              width="140"
              height="9"
              rx="3"
              fill="currentColor"
              fillOpacity="0.07"
              stroke="currentColor"
              strokeOpacity="0.16"
            />
          </g>
        ))}
        {/* The crop: the stack keeps going past the frame, faded out.
            A flat 86%-opaque panel was not enough — the field rows read
            straight through it and collided with the label. A gradient to the
            ground colour is both more convincing as a fade and completely
            opaque by the time it reaches the text. */}
        <rect x="7" y="170" width="174" height="53" fill="url(#cf-fade)" />
        <text
          x="94"
          y="216"
          textAnchor="middle"
          fontSize="9"
          fill="currentColor"
          fillOpacity="0.55"
        >
          …14 more
        </text>
      </g>

      {/* Right: three turns, at the same scale. */}
      <g transform="translate(238 0)">
        <rect
          x="0"
          y="18"
          width="176"
          height="206"
          rx="10"
          className="fill-background"
          stroke="currentColor"
          strokeOpacity="0.28"
          strokeWidth="1.5"
        />
        <g transform="translate(16 44)">
          <rect width="112" height="30" rx="10" fill="var(--brand-violet)" fillOpacity="0.18" />
          <rect x="12" y="10" width="72" height="4" rx="2" fill="currentColor" fillOpacity="0.42" />
          <rect x="12" y="18" width="50" height="4" rx="2" fill="currentColor" fillOpacity="0.42" />
        </g>
        <g transform="translate(66 86)">
          <rect width="94" height="22" rx="10" fill="var(--brand-orange)" fillOpacity="0.9" />
          <rect x="12" y="9" width="56" height="4" rx="2" fill="var(--on-primary)" fillOpacity="0.75" />
        </g>
        <g transform="translate(16 122)">
          <rect width="126" height="30" rx="10" fill="var(--brand-violet)" fillOpacity="0.18" />
          <rect x="12" y="10" width="88" height="4" rx="2" fill="currentColor" fillOpacity="0.42" />
          <rect x="12" y="18" width="42" height="4" rx="2" fill="currentColor" fillOpacity="0.42" />
        </g>
        {/* The composer, waiting. One question is the whole visible cost. */}
        <rect
          x="16"
          y="180"
          width="144"
          height="24"
          rx="12"
          fill="currentColor"
          fillOpacity="0.05"
          stroke="currentColor"
          strokeOpacity="0.18"
        />
        <rect x="28" y="190" width="34" height="4" rx="2" fill="currentColor" fillOpacity="0.28" />
      </g>

      <text x="94" y="10" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.62">
        25 questions, all at once
      </text>
      <text x="326" y="10" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.62">
        25 questions, as a conversation
      </text>
    </svg>
  );
}
