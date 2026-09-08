import { Code2, Link2, QrCode } from "lucide-react";

/**
 * The three ways a finished form reaches people, drawn.
 *
 * Lifted out of `how-it-works.tsx`, where it was a local `SHARE` array, so the
 * use-case guides can show the same surface with their own link in it — a
 * booking guide showing `chatform.in/f/book-a-cut` is doing a different job
 * from one showing a generic slug.
 *
 * The embed line is deliberately last and deliberately the only technical
 * thing on it. Most people reading these guides will send a link or print the
 * QR; the script tag is there so the one person whose web guy asked can see it
 * exists, and it is not explained here because explaining it here would be
 * explaining it to the wrong reader.
 */
export function SharePanel({
  slug = "team-onboarding",
  qrLabel = "A QR code to print, download it free",
}: {
  slug?: string;
  qrLabel?: string;
}) {
  const rows = [
    { icon: Link2, label: `chatform.in/f/${slug}`, mono: true },
    { icon: QrCode, label: qrLabel, mono: false },
    { icon: Code2, label: "Or drop it straight into your website", mono: false },
  ];

  return (
    <div className="border-border/70 bg-background flex flex-col gap-2 rounded-xl border p-3 shadow-sm">
      {rows.map((row) => (
        <div
          key={row.label}
          className="border-border/60 flex min-w-0 items-center gap-2.5 rounded-lg border px-2.5 py-2"
        >
          <row.icon className="text-primary size-3.5 shrink-0" strokeWidth={2} />
          <span
            className={`text-micro text-muted-foreground truncate ${row.mono ? "font-mono" : ""}`}
          >
            {row.label}
          </span>
        </div>
      ))}
    </div>
  );
}
