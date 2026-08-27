"use client";

import { Globe } from "lucide-react";
import { FEATURES, PLANS, minPlanFor } from "@repo/entitlements";
import { useEntitlements } from "@/hooks/use-entitlements";
import { useUpgrade } from "@/components/billing/gate";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Custom domains: shown, priced, and honestly labelled as not built yet.
 *
 * The field is here because a locked control someone can *see* is what creates the want —
 * and because a plan that advertises custom domains needs the place they'd configure it to
 * exist. What it must never do is imply the feature ships today: the plan lists it as
 * "coming soon" and so does this.
 *
 * The pre-filled example uses their real form slug, so what they are looking at is their
 * own URL rather than a generic placeholder.
 */
export function CustomDomainField({ slug }: { slug: string }) {
  const ent = useEntitlements();
  const upgrade = useUpgrade();

  const entitled = ent.can("custom_domain");
  const plan = PLANS[minPlanFor("custom_domain")];
  const soon = FEATURES.custom_domain.soon === true;

  return (
    <div className="border-t border-[var(--border)] pt-4">
      <div className="flex items-center gap-2">
        <Label htmlFor="custom-domain" className="flex items-center gap-1.5">
          <Globe className="text-muted-foreground size-3.5" aria-hidden />
          Custom domain
        </Label>
        {soon && <span className="text-muted-foreground text-xs">coming soon</span>}
      </div>

      <div className="mt-1.5 flex gap-2">
        <Input
          id="custom-domain"
          readOnly
          disabled
          value={`forms.yourcompany.com/${slug}`}
          className="font-mono text-sm"
        />
        {!entitled && (
          <button
            type="button"
            onClick={() => upgrade("custom_domain", { surface: "share.domain" })}
            className="shrink-0 rounded-lg bg-[var(--warning-soft)] px-3 text-xs font-medium text-[var(--warning-soft-foreground)] transition-opacity hover:opacity-80"
          >
            {plan.name}
          </button>
        )}
      </div>

      <p className="text-muted-foreground mt-1.5 text-xs">
        Serve this form from your own domain instead of ours.
      </p>
    </div>
  );
}
