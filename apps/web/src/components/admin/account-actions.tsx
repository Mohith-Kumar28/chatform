"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Gift, RefreshCw, VenetianMask } from "lucide-react";
import {
  postApiAdminAccountsByOrgIdOverrides,
  postApiAdminAccountsByOrgIdPlan,
  postApiAdminAccountsByOrgIdRefreshEntitlements,
  deleteApiAdminAccountsByOrgIdOverridesByKey,
  deleteApiAdminAccountsByOrgIdPlan,
} from "@/lib/api/admin/admin";
import {
  FEATURES,
  FEATURE_KEYS,
  LIMITS,
  LIMIT_KEYS,
  PLANS,
  limitMeta,
  minPlanFor,
  type FeatureKey,
  type LimitKey,
  type LimitValue,
  type PlanId,
} from "@repo/entitlements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { openImpersonationTab } from "@/lib/impersonation";

/**
 * The three things you actually do to an account, next to the account.
 *
 * All three were previously `wrangler d1 execute` against production with a
 * hand-written SQL file — the comp grant even has a checked-in script,
 * `tooling/grant-founder-access.sql`, whose header explains which cache you then
 * have to delete by hand. Each writes an `audit_logs` row the customer can see
 * in their own activity log, which the SQL never did.
 *
 * The wording is the feature here, not the buttons. A console this small is used
 * once a fortnight, under time pressure, on somebody else's money — so it says
 * what will happen in the words a person would use, names entitlements the way
 * the pricing page does rather than as `ai_tokens_per_month`, and states the two
 * things an admin is actually anxious about before they click: whether this
 * charges the customer, and whether it can be undone.
 */

/** `null` is unlimited everywhere in the entitlement model, and reads as the word. */
function readLimit(key: LimitKey, value: LimitValue | undefined): string {
  if (value === undefined) return "—";
  const meta = limitMeta(key);
  const period = meta.kind === "monthly" ? " a month" : "";
  if (value === null) return `unlimited${period}`;
  const n = value.toLocaleString();
  const unit =
    meta.unit === "megabytes" ? " MB" : meta.unit === "tokens" ? " tokens" : meta.unit === "chars" ? " characters" : "";
  return `${n}${unit}${period}`;
}

/** Whole calendar months, matching the API so the preview date is the real one. */
function addMonths(from: number, months: number): number {
  const d = new Date(from);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  return d.getTime();
}

const MONTH_OPTIONS = [
  { value: "1", label: "1 month" },
  { value: "3", label: "3 months" },
  { value: "6", label: "6 months" },
  { value: "12", label: "12 months" },
  { value: "forever", label: "No expiry" },
] as const;

export function AccountActions({
  orgId,
  orgName,
  plan,
  limits,
  owner,
  onChanged,
}: {
  orgId: string;
  /** Named in every sentence the dialogs write, so nobody grants to the wrong tab. */
  orgName: string;
  plan: PlanId;
  /** What this account is allowed today, overrides already applied. */
  limits: Record<string, LimitValue>;
  /** The person to become. Absent when the organization has no members left. */
  owner: { id: string; name: string; email: string } | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  /** One reason per dialog: a comp's justification is not why you went into their account. */
  const [reason, setReason] = useState("");
  const [visitReason, setVisitReason] = useState("");
  const [impersonateOpen, setImpersonateOpen] = useState(false);
  const [grantOpen, setGrantOpen] = useState(false);
  /**
   * The clock, read once when the dialog opens rather than on every render.
   *
   * `Date.now()` during render is impure — the preview date would drift between
   * renders — and a comp's end date is anchored to when the admin opened the
   * dialog, which is close enough to when the API will stamp it.
   */
  const [openedAt, setOpenedAt] = useState(0);
  const [kind, setKind] = useState<"feature" | "limit" | "plan">("feature");
  const [compPlan, setCompPlan] = useState<"pro" | "business">("pro");
  /** `"forever"` rather than an empty string: an open-ended comp is a choice, not a blank. */
  const [months, setMonths] = useState<"1" | "3" | "6" | "12" | "forever">("1");
  const [featureKey, setFeatureKey] = useState<FeatureKey>(FEATURE_KEYS[0]!);
  const [limitKey, setLimitKey] = useState<LimitKey>(LIMIT_KEYS[0]!);
  const [value, setValue] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");

  const planName = PLANS[plan]?.name ?? plan;
  const grantedLabel =
    kind === "feature" ? FEATURES[featureKey].label : kind === "limit" ? limitMeta(limitKey).label : PLANS[compPlan].name;
  const endsAt = months === "forever" || !openedAt ? null : addMonths(openedAt, Number(months));
  const alreadyHas = kind === "feature" && PLANS[plan]?.features.includes(featureKey);

  /**
   * Opened straight from the click, with the network call deliberately *not*
   * awaited first: a `window.open` that happens after an await has lost the
   * browser's user gesture and is blocked as a popup. The tab that opens does
   * its own minting — see `openImpersonationTab`.
   */
  function impersonate() {
    if (!owner) return;
    const win = openImpersonationTab({ userId: owner.id, orgId, reason: visitReason });
    if (!win) {
      toast.error("Your browser blocked the new tab. Allow pop-ups for this site and try again.");
      return;
    }
    setImpersonateOpen(false);
    setVisitReason("");
    toast.success(`Opened ${owner.name || owner.email}'s account in a new tab`);
  }

  async function grant() {
    setBusy("grant");
    try {
      if (kind === "plan") {
        await postApiAdminAccountsByOrgIdPlan(orgId, {
          planId: compPlan,
          months: months === "forever" ? null : Number(months),
          reason,
        });
        toast.success(`${orgName} is on ${PLANS[compPlan].name}, free`);
        setGrantOpen(false);
        setReason("");
        onChanged();
        return;
      }
      await postApiAdminAccountsByOrgIdOverrides(orgId, {
        kind,
        key: kind === "feature" ? featureKey : limitKey,
        // A feature is a boolean; a limit is the new ceiling as a decimal
        // string, and the empty string is how `parseOverride` spells unlimited
        // — the word "unlimited" would parse as malformed and be ignored.
        value: kind === "feature" ? "true" : value.trim(),
        reason,
        expiresInDays: expiresInDays ? Number(expiresInDays) : null,
      });
      toast.success(`${orgName} now has ${grantedLabel}, free`);
      setGrantOpen(false);
      setReason("");
      setValue("");
      setExpiresInDays("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not grant that");
    } finally {
      setBusy(null);
    }
  }

  async function refresh() {
    setBusy("refresh");
    try {
      await postApiAdminAccountsByOrgIdRefreshEntitlements(orgId);
      toast.success("Cache cleared — their next page load re-reads the database");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not refresh");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Dialog open={impersonateOpen} onOpenChange={setImpersonateOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="secondary" disabled={!owner}>
            <VenetianMask className="size-3.5" strokeWidth={2} aria-hidden />
            Impersonate
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Impersonate {owner?.name || owner?.email}</DialogTitle>
            <DialogDescription>
              A new tab, signed in as them. You see their forms, their responses and their plan exactly as they do — and
              you can change things, so treat it as their account, not a preview.
            </DialogDescription>
          </DialogHeader>

          <ul className="text-muted-foreground space-y-1.5 text-xs">
            <li>· Everything you do is written to their activity log, under your name.</li>
            <li>· It ends after an hour, when you press Stop, or when you close the tab.</li>
            <li>· This console stays open in the tab you are in now.</li>
          </ul>

          <div className="space-y-2">
            <Label htmlFor="impersonate-reason">Why are you going in?</Label>
            <Input
              id="impersonate-reason"
              value={visitReason}
              onChange={(e) => setVisitReason(e.target.value)}
              placeholder="Reproducing the publish failure in ticket 41…"
            />
            <p className="text-muted-foreground text-micro">The customer can read this in their own activity log.</p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setImpersonateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={impersonate} disabled={!visitReason.trim()}>
              Open their account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={grantOpen}
        onOpenChange={(open) => {
          setGrantOpen(open);
          if (open) setOpenedAt(Date.now());
        }}
      >
        <DialogTrigger asChild>
          <Button size="sm" variant="secondary">
            <Gift className="size-3.5" strokeWidth={2} aria-hidden />
            Give free access
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Give {orgName} free access</DialogTitle>
            <DialogDescription>
              Unlock something their plan does not include, at no charge. This is not money: it adds no credits, issues
              no refund and changes no invoice. It only changes what the product lets them do, and you can take it back
              from this page at any time.
            </DialogDescription>
          </DialogHeader>

          <SegmentedControl
            ariaLabel="What to give them"
            size="sm"
            value={kind}
            onChange={setKind}
            options={[
              { value: "feature", label: "Unlock a feature" },
              { value: "limit", label: "Raise a limit" },
              { value: "plan", label: "Put them on a plan" },
            ]}
          />

          {kind === "plan" ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Which plan</Label>
                  <Select value={compPlan} onValueChange={(v) => setCompPlan(v as "pro" | "business")}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pro">Pro</SelectItem>
                      <SelectItem value="business">Business</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>For how long</Label>
                  <Select value={months} onValueChange={(v) => setMonths(v as typeof months)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_OPTIONS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="bg-muted/50 text-muted-foreground text-micro rounded-lg px-3 py-2">
                This changes the plan itself, not just what is unlocked: their badge reads {PLANS[compPlan].name} and
                the Upgrade button goes away. No checkout, no invoice, no card — the subscription row is marked as
                granted by hand, and the revenue console leaves it out of MRR.
                {endsAt !== null && " It ends on its own; nothing to remember."}
              </p>
            </div>
          ) : kind === "feature" ? (
            <div className="space-y-2">
              <Label>Which feature</Label>
              <Select value={featureKey} onValueChange={(v) => setFeatureKey(v as FeatureKey)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEATURE_KEYS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {FEATURES[k].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="bg-muted/50 space-y-1 rounded-lg px-3 py-2">
                <p className="text-sm">{FEATURES[featureKey].blurb}</p>
                <p className="text-muted-foreground text-micro">
                  {alreadyHas
                    ? `Their ${planName} plan already includes this — granting it changes nothing.`
                    : `Normally on ${PLANS[minPlanFor(featureKey)].name}. They are on ${planName}.`}
                  {FEATURES[featureKey].soon && " Priced but not built yet, so they will not see anything new."}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Which limit</Label>
                <Select value={limitKey} onValueChange={(v) => setLimitKey(v as LimitKey)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LIMIT_KEYS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {LIMITS[k].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="grant-value">New ceiling</Label>
                <Input
                  id="grant-value"
                  value={value}
                  onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
                  placeholder="Leave empty for unlimited"
                  inputMode="numeric"
                />
                <p className="text-muted-foreground text-micro">
                  They get {readLimit(limitKey, limits[limitKey])} today.
                </p>
              </div>
            </div>
          )}

          <div className={kind === "plan" ? "space-y-2" : "grid gap-3 sm:grid-cols-2"}>
            <div className="space-y-2">
              <Label htmlFor="grant-reason">Why</Label>
              <Input
                id="grant-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Evaluating for annual"
              />
              <p className="text-muted-foreground text-micro">They can read this in their activity log.</p>
            </div>
            <div className="space-y-2" hidden={kind === "plan"}>
              <Label htmlFor="grant-expiry">Take it back after</Label>
              <Input
                id="grant-expiry"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value.replace(/\D/g, ""))}
                placeholder="Days — empty means never"
                inputMode="numeric"
              />
              <p className="text-muted-foreground text-micro">Expires on its own. No reminder to set.</p>
            </div>
          </div>

          {/*
            The sentence the admin actually reads before clicking. Every clause
            answers a question the raw form left open: who, what, for how long,
            what it costs them, and whether it is reversible.
          */}
          <p className="bg-muted/50 text-caption rounded-lg px-3 py-2">
            {kind === "plan" ? (
              <>
                <strong>{orgName}</strong> moves from {planName} to <strong>{PLANS[compPlan].name}</strong>, free
                {endsAt === null
                  ? ", with no end date"
                  : `, until ${new Date(endsAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} — then back to Free on its own`}
                . Nothing is charged and no invoice exists, and you can take it back from this page at any time.
              </>
            ) : (
              <>
                <strong>{orgName}</strong> gets <strong>{grantedLabel}</strong>
                {kind === "limit" && ` raised to ${value.trim() === "" ? "unlimited" : value.trim()}`}, free
                {expiresInDays ? ` for ${expiresInDays} days` : ", until you revoke it"}. They stay on {planName}, they
                are billed exactly what they are billed now, and their plan badge will not change.
              </>
            )}
          </p>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setGrantOpen(false)}>
              Cancel
            </Button>
            <Button onClick={grant} disabled={busy === "grant" || !reason.trim()}>
              {busy === "grant" ? "Giving…" : "Give free access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Button size="sm" variant="ghost" onClick={refresh} disabled={busy === "refresh"}>
        <RefreshCw className={busy === "refresh" ? "size-3.5 animate-spin" : "size-3.5"} strokeWidth={2} aria-hidden />
        Re-read their plan
      </Button>
    </div>
  );
}

/** Revoking is a one-click affair, so it lives next to the list rather than in a dialog. */
export function RevokeOverride({ orgId, keyName, onChanged }: { orgId: string; keyName: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="text-muted-foreground hover:text-destructive text-xs transition-colors duration-[var(--duration-micro)]"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await deleteApiAdminAccountsByOrgIdOverridesByKey(orgId, keyName);
          toast.success(`Took back ${entitlementLabel(keyName)}`);
          onChanged();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not revoke");
        } finally {
          setBusy(false);
        }
      }}
    >
      take it back
    </button>
  );
}

/**
 * Take back a plan this console granted.
 *
 * Sits next to the "granted by hand" line rather than in the actions row,
 * because it only exists when there is a comp to remove — and because the row of
 * things you *can* do to any account should not carry an option that is
 * meaningless on most of them.
 */
export function RevokeCompedPlan({ orgId, onChanged }: { orgId: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="text-muted-foreground hover:text-destructive text-xs underline-offset-2 transition-colors duration-[var(--duration-micro)] hover:underline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await deleteApiAdminAccountsByOrgIdPlan(orgId);
          toast.success("Comped plan removed — they are back to what they were paying for");
          onChanged();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not remove it");
        } finally {
          setBusy(false);
        }
      }}
    >
      take the plan back
    </button>
  );
}

/**
 * `ai_tokens_per_month` → `AI tokens`.
 *
 * The console showed the database key wherever a grant was listed, which is the
 * same confusion the grant dialog had: a name only the schema uses, next to a
 * button that spends money. One lookup, shared by the dialog and the list.
 */
export function entitlementLabel(key: string): string {
  if (key in FEATURES) return FEATURES[key as FeatureKey].label;
  if (key in LIMITS) return limitMeta(key as LimitKey).label;
  return key.replaceAll("_", " ");
}
