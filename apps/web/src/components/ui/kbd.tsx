import { cn } from "@/lib/utils";

/**
 * A key, drawn the same everywhere it appears.
 *
 * Shortcuts are only worth having if people find out about them, and the place
 * they find out is the control they were already reaching for. So this shows up
 * in tooltips far more often than in the shortcut sheet — hence `tone`, because
 * tooltips are drawn on the foreground colour and a muted chip disappears into
 * them.
 */
export function Kbd({
  children,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  tone?: "default" | "inverse";
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "inline-grid min-w-[1.25rem] shrink-0 place-items-center rounded px-1 py-0.5",
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
