import { cn } from "@/lib/utils";

/**
 * Youform-style settings row: label + explanation on the left, control on the
 * right, one bordered card per row. Promoted out of settings-panel.tsx so
 * every settings surface uses the same rhythm.
 */
export function SettingRow({
  label,
  description,
  htmlFor,
  badge,
  control,
  children,
  className,
  stacked = false,
}: {
  label: string;
  description?: React.ReactNode;
  htmlFor?: string;
  badge?: React.ReactNode;
  /** Right-aligned control (switch, select, button). */
  control?: React.ReactNode;
  /** Full-width content below the label — for editors and long inputs. */
  children?: React.ReactNode;
  className?: string;
  stacked?: boolean;
}) {
  return (
    <div
      className={cn(
        "border-border bg-card rounded-xl border p-4",
        stacked ? "space-y-3" : "flex items-start justify-between gap-6",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <label htmlFor={htmlFor} className="text-h3 cursor-default">
            {label}
          </label>
          {badge}
        </div>
        {description && (
          <p className="text-muted-foreground text-caption max-w-prose">{description}</p>
        )}
      </div>
      {control && <div className="flex shrink-0 items-center gap-2">{control}</div>}
      {children}
    </div>
  );
}

/** Groups rows under a heading inside a settings section. */
export function SettingGroup({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      {title && (
        <div className="space-y-1">
          <h2 className="text-h2">{title}</h2>
          {description && <p className="text-muted-foreground text-body">{description}</p>}
        </div>
      )}
      <div className="space-y-3">{children}</div>
    </section>
  );
}
