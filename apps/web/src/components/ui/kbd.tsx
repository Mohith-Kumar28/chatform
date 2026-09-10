import { cn } from "@/lib/utils";

/**
 * A key, drawn the same everywhere it appears.
 *
 * Shortcuts are only worth having if people find out about them, and the place
 * they find out is the control they were already reaching for. So this shows up
 * in tooltips far more often than in the shortcut sheet — hence `tone`, because
 * tooltips are drawn on the foreground colour and a muted chip disappears into
 * them.
 *
 * On a device with no keyboard it draws nothing. `kbd-hint` is the single rule
 * in `globals.css` that decides that, shared with the runtime's `KeyHint`, so
 * no caller has to remember a `sm:` gate or a `hidden md:inline-grid` of its
 * own — which is how `⌘K` came to be advertised on phones in the first place.
 */
export function Kbd({
  children,
  tone = "default",
  always = false,
  className,
}: {
  children: React.ReactNode;
  tone?: "default" | "inverse";
  /**
   * Draw it even without a keyboard — for the places where a key is the
   * *subject* rather than an affordance. The shortcut sheet is the only one:
   * it is reachable by tapping a row in the command palette, and a list of
   * shortcuts with the keys taken out of it is a list of nothing.
   */
  always?: boolean;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        always ? "inline-grid" : "kbd-hint",
        "min-w-[1.25rem] shrink-0 place-items-center rounded px-1 py-0.5",
        "font-sans text-[0.6875rem] leading-none font-medium tabular-nums",
        tone === "inverse"
          ? "bg-background/20 text-background"
          : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/**
 * Tooltip body for a control that has a shortcut: the name, then the key.
 *
 * Used instead of gluing the key onto the label with a space, which reads as
 * part of the sentence and wraps in the wrong place.
 */
export function TooltipHint({
  label,
  keys,
  hint,
}: {
  label: string;
  keys?: string;
  /** The second line, for controls whose name does not say what they do. */
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span>
        <span className="block font-medium">{label}</span>
        {hint && <span className="text-background/70 block text-[0.6875rem]">{hint}</span>}
      </span>
      {keys && <Kbd tone="inverse">{keys}</Kbd>}
    </div>
  );
}
