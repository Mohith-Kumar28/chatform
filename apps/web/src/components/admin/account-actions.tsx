"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Eye, KeyRound, RefreshCw } from "lucide-react";
import {
  postApiAdminImpersonate,
  postApiAdminAccountsByOrgIdOverrides,
  postApiAdminAccountsByOrgIdRefreshEntitlements,
  deleteApiAdminAccountsByOrgIdOverridesByKey,
} from "@/lib/api/admin/admin";
import { FEATURE_KEYS, LIMIT_KEYS } from "@repo/entitlements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { startImpersonation } from "@/lib/impersonation";

/**
 * The three things you actually do to an account, next to the account.
 *
 * All three were previously `wrangler d1 execute` against production with a
 * hand-written SQL file — the comp grant even has a checked-in script,
 * `tooling/grant-founder-access.sql`, whose header explains which cache you then
 * have to delete by hand. Each writes an `audit_logs` row the customer can see
 * in their own activity log, which the SQL never did.
 *
 * Impersonation asks for a reason before it will start. Not a permission check —
 * you are already an admin and the field is free text — but a prompt that makes
 * you say what you are about to do, recorded next to the fact that you did it.
 */

export function AccountActions({
  orgId,
  owner,
  onChanged,
}: {
  orgId: string;
  /** The person to become. Absent when the organization has no members left. */
  owner: { id: string; name: string; email: string } | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [impersonateOpen, setImpersonateOpen] = useState(false);
  const [grantOpen, setGrantOpen] = useState(false);
  const [kind, setKind] = useState<"feature" | "limit">("feature");
  const [key, setKey] = useState<string>(FEATURE_KEYS[0] ?? "");
  const [value, setValue] = useState("true");
  const [expiresInDays, setExpiresInDays] = useState("");

  async function impersonate() {
    if (!owner) return;
    setBusy("impersonate");
    try {
      const res = (await postApiAdminImpersonate({ userId: owner.id, orgId, reason })) as unknown as {
        token: string;
        expiresAt: number;
        user: { id: string; name: string; email: string };
      };
      // Hands off to a full page load, so no cached query belonging to the
      // admin's own account survives into the customer's session.
      startImpersonation(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start impersonation");
      setBusy(null);
    }
  }

  async function grant() {
    setBusy("grant");
    try {
      await postApiAdminAccountsByOrgIdOverrides(orgId, {
        kind,
        key,
        value: kind === "feature" ? "true" : value,
        reason: reason || "granted from the platform console",
        expiresInDays: expiresInDays ? Number(expiresInDays) : null,
      });
      toast.success(`Granted ${key}`);
      setGrantOpen(false);
      setReason("");
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
      toast.success("Entitlement cache dropped — the next request re-reads the database");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not refresh");
    } finally {
      setBusy(null);
    }
  }

  const keys = kind === "feature" ? FEATURE_KEYS : LIMIT_KEYS;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Dialog open={impersonateOpen} onOpenChange={setImpersonateOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="secondary" disabled={!owner}>
            <Eye className="size-3.5" strokeWidth={2} aria-hidden />
            Sign in as
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Act as {owner?.name || owner?.email}</DialogTitle>
            <DialogDescription>
              You will use the product exactly as they can — same role, same plan, same limits — and you can change
              things. Anything you do is written to their activity log under your name, and the session ends after an
              hour.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="impersonate-reason">Why (recorded in their audit log)</Label>
            <Input
              id="impersonate-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reproducing the publish failure in ticket 41…"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setImpersonateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={impersonate} disabled={busy === "impersonate" || !reason.trim()}>
              {busy === "impersonate" ? "Starting…" : "Start"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="secondary">
            <KeyRound className="size-3.5" strokeWidth={2} aria-hidden />
            Grant
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant an entitlement</DialogTitle>
            <DialogDescription>
              Unlocks a capability without changing what they are billed. Their plan badge and Upgrade button read
              from the subscription, so this stays honest about what they pay.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Kind</Label>
                <Select
                  value={kind}
                  onValueChange={(v) => {
                    const next = v as "feature" | "limit";
                    setKind(next);
                    setKey((next === "feature" ? FEATURE_KEYS[0] : LIMIT_KEYS[0]) ?? "");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="feature">Feature</SelectItem>
                    <SelectItem value="limit">Limit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Which</Label>
                <Select value={key} onValueChange={setKey}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {keys.map((k) => (
                      <SelectItem key={k} value={k}>
                        {k.replaceAll("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {kind === "limit" && (
              <div className="space-y-2">
                <Label htmlFor="grant-value">New ceiling</Label>
                <Input
                  id="grant-value"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="5000, or leave empty for unlimited"
                />
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="grant-reason">Reason</Label>
                <Input
                  id="grant-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Evaluating for annual"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="grant-expiry">Expires in (days)</Label>
                <Input
                  id="grant-expiry"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value.replace(/\D/g, ""))}
                  placeholder="Never"
                  inputMode="numeric"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setGrantOpen(false)}>
              Cancel
            </Button>
            <Button onClick={grant} disabled={busy === "grant" || !key}>
              {busy === "grant" ? "Granting…" : "Grant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Button size="sm" variant="ghost" onClick={refresh} disabled={busy === "refresh"}>
        <RefreshCw className={busy === "refresh" ? "size-3.5 animate-spin" : "size-3.5"} strokeWidth={2} aria-hidden />
        Refresh entitlements
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
          toast.success(`Revoked ${keyName}`);
          onChanged();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not revoke");
        } finally {
          setBusy(false);
        }
      }}
    >
      revoke
    </button>
  );
}
