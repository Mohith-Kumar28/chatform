import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/utils";

/**
 * Code, a prompt or a payload to read and copy.
 *
 * Scrolls inside itself in both directions, so a long line never widens the
 * page on a phone. The copy button sits on the frame rather than in the
 * scrolling text, so it stays put while the code moves under it. The block
 * sets its own text colour: inside the dark marketing band an inherited one
 * left the button white on white.
 */
export function CodeBlock({
  code,
  copy = true,
  wrap = false,
  className,
}: {
  code: string;
  /** False where a labelled copy button beside the block is the main action. */
  copy?: boolean;
  /** Wrap long lines instead of scrolling sideways. Suits prose prompts. */
  wrap?: boolean;
  className?: string;
}) {
  return (
    <div className="text-foreground relative min-w-0">
      <pre
        className={cn(
          "bg-muted text-caption max-h-96 overflow-auto rounded-xl p-4 font-mono",
          wrap && "break-words whitespace-pre-wrap",
          copy && "pr-12",
          className,
        )}
      >
        <code>{code}</code>
      </pre>
      {copy && (
        <CopyButton
          value={code}
          toastMessage="Copied"
          className="bg-background/80 hover:bg-background absolute top-2 right-2 backdrop-blur-sm"
        />
      )}
    </div>
  );
}
