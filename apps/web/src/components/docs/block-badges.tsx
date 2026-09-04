const FAMILY_LABELS: Record<string, string> = {
  content: "Content",
  text: "Text",
  contact: "Contact",
  number: "Number",
  choice: "Choice",
  scale: "Scale",
  advanced: "Advanced",
};

/**
 * The family pill on a block reference page.
 *
 * The families are the same seven the builder groups blocks by, and they carry
 * the same colours — someone who has used the builder should recognise where a
 * block lives before reading a word.
 */
export function BlockBadges({ family, type }: { family: string; type: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span
        className="text-micro rounded-full px-2.5 py-1 font-medium"
        style={{
          background: `var(--block-${family}-soft)`,
          color: `var(--block-${family}-ink)`,
        }}
      >
        {FAMILY_LABELS[family] ?? family}
      </span>
      <code className="text-caption bg-muted rounded-md px-2 py-0.5 font-mono">{type}</code>
    </div>
  );
}
