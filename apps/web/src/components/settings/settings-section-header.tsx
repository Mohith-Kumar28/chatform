"use client";

import { useEntitlements } from "@/hooks/use-entitlements";

/**
 * The heading for one settings section.
 *
 * The layout owns the `h1`, so this is an `h2` — and because `CardTitle` and
 * friends render as `div`, `font-display` has to be asked for explicitly rather
 * than inherited from a bare heading tag.
 *
 * `readOnly` names the reader's role instead of restating the rule. "Only an
 * owner can do this" invites "so what am I?"; `roleLabel` is already in the
 * entitlements payload and answers it in the same breath.
 */
export function SettingsSectionHeader({
  title,
  description,
  actions,
  readOnly,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Set when every control in this section is inert for the current role. */
  readOnly?: boolean;
}) {
  const ent = useEntitlements();
  const role = ent.data?.roleLabel;

  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 className="font-display text-h2">{title}</h2>
        {description && (
          <p className="text-muted-foreground text-caption mt-1 text-pretty">{description}</p>
        )}
        {readOnly && role && (
          <p className="text-muted-foreground text-caption mt-1">
            You&rsquo;re {role.toLowerCase()} here — this is read-only.
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
