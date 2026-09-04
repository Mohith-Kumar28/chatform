"use client";

import { useState } from "react";
import { authClient, useActiveOrganization } from "@/lib/auth/auth-client";
import { useEntitlements } from "@/hooks/use-entitlements";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { UserPlus, Lock } from "lucide-react";

/**
 * Who is in this organization, and inviting more of them.
 *
 * Reads the **active** organization rather than the first one the account
 * belongs to. That distinction is the whole bug this page used to have: someone
 * in two organizations saw the members of whichever came back first and — worse
 * — invited people into it, regardless of which one they were actually working
 * in. Everything else in the product resolves the org from
 * `sessions.active_organization_id`; this now does too.
 *
 * Members come from `useActiveOrganization`, which returns them with the
 * organization. The previous hand-written `fetch` in a `useEffect` was both a
 * second source of truth and a violation of the repo's no-hand-written-fetching
 * rule, and it swallowed every error it hit.
 */

/**
 * The roles an invite may assign.
 *
 * `owner` is not here: an organization has one, and transferring it is a
 * different operation from inviting someone. `member` is Better Auth's legacy
 * name for `editor` and is accepted by the API but never offered.
 */
const ROLES = [
  { value: "editor", label: "Editor", blurb: "Build forms and read every response." },
  { value: "admin", label: "Admin", blurb: "Everything except billing." },
  { value: "viewer", label: "Viewer", blurb: "Read completed responses and basic analytics." },
] as const;

type Role = (typeof ROLES)[number]["value"];

export default function TeamPage() {
  const { data: org, isPending } = useActiveOrganization();
  const ent = useEntitlements();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [invited, setInvited] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const members = (org?.members ?? []) as { id: string; role: string; user?: { name?: string; email?: string } }[];

  /**
   * Inviting is a role, not a plan — so a refusal here is a 403 and upgrading
   * would not fix it. The form is shown either way, switched off, for the same
   * reason locked features stay visible: a capability nobody can see is one
   * nobody knows to ask their admin for.
   */
  const canInvite = ent.allows("invitation", "create");

  /** Seats are a plan limit, and hitting it is a 402 nobody should meet mid-invite. */
  const seatLimit = ent.limit("seats");
  const seatsUsed = members.length;
  const seatsFull = seatLimit !== null && seatsUsed >= seatLimit;

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const res = await authClient.organization.inviteMember({ email, role: role as never });
      if (res.error) throw new Error(res.error.message ?? "Invite failed");
      setInvited(email);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setSending(false);
    }
  };

  if (isPending) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-3 px-6 py-10">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            No organization is active — create one from the dashboard to invite teammates.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Team</h1>
        <p className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-2 text-sm">
          <span>{org.name}</span>
          <span aria-hidden>·</span>
          <span>
            {seatsUsed} {seatsUsed === 1 ? "member" : "members"}
            {seatLimit !== null && ` of ${seatLimit}`}
          </span>
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">Members</CardTitle>
            <CardDescription>People with access to this organization.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {members.length === 0 && <p className="text-muted-foreground text-sm">No members yet.</p>}
            {members.map((m) => {
              const display = m.user?.name ?? m.user?.email ?? "Unknown";
              return (
                <div key={m.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                  {/*
                    `text-primary-foreground`, not the hardcoded `text-white`
                    this used to carry: white on the brand orange measures
                    2.78:1. See the token's note in globals.css.
                  */}
                  <div className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                    {display.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{display}</p>
                    {m.user?.email && m.user.email !== display && (
                      <p className="text-muted-foreground truncate text-xs">{m.user.email}</p>
                    )}
                  </div>
                  <Badge variant="secondary">{m.role}</Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2 text-base">
              Invite a teammate
              {!canInvite && <Lock className="text-muted-foreground size-3.5" aria-hidden />}
            </CardTitle>
            <CardDescription>
              {canInvite
                ? "They'll get access to every form in this organization."
                : "Your role cannot invite people. Ask an owner or admin."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={invite} className="space-y-4">
              <fieldset disabled={!canInvite || seatsFull || sending} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="invite-email">Email</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="teammate@company.com"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <SegmentedControl
                    options={ROLES.map((r) => ({ value: r.value, label: r.label }))}
                    value={role}
                    onChange={(v) => setRole(v as Role)}
                    size="sm"
                    ariaLabel="Role"
                  />
                  <p className="text-muted-foreground text-xs">{ROLES.find((r) => r.value === role)?.blurb}</p>
                </div>

                <Button type="submit" className="w-full rounded-full">
                  <UserPlus className="size-4" /> {sending ? "Sending…" : "Send invite"}
                </Button>
              </fieldset>

              {/*
                Said before the click rather than after: hitting the seat limit
                mid-invite means typing an address, pressing send, and being
                shown a paywall instead of a confirmation.
              */}
              {seatsFull && canInvite && (
                <p className="rounded-lg bg-[var(--warning-soft)] px-3 py-2 text-sm text-[var(--warning-soft-foreground)]">
                  Every seat on your plan is taken. Add seats from{" "}
                  <a href="/billing" className="underline underline-offset-2">
                    billing
                  </a>{" "}
                  to invite more people.
                </p>
              )}
              {error && (
                <p className="text-destructive rounded-lg bg-[var(--destructive-soft)] px-3 py-2 text-sm" role="alert">
                  {error}
                </p>
              )}
              {invited && (
                <p className="rounded-lg bg-[var(--success-soft)] px-3 py-2 text-sm text-[var(--success-soft-foreground)]">
                  Invite sent to {invited}.
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
