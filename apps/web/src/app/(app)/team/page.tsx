"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth/auth-client";
import { useActiveOrg } from "@/hooks/use-active-org";
import { useEntitlements } from "@/hooks/use-entitlements";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { UsageMeter } from "@/components/ui/usage-meter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Clock, Lock, UserPlus } from "lucide-react";

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
 * Members come from `useActiveOrg`, which wraps Better Auth's
 * `useActiveOrganization` and returns them with the organization. The previous
 * hand-written `fetch` in a `useEffect` was both a second source of truth and a
 * violation of the repo's no-hand-written-fetching rule, and it swallowed every
 * error it hit.
 *
 * The wrapper exists because "no active organization" was, for every account
 * created before the session hook landed, a session that had simply never
 * picked one — not an account without a workspace. This page was the only place
 * that difference was visible, and it read as the workspace having vanished.
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

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string | Date;
}

export default function TeamPage() {
  const { org, isPending } = useActiveOrg();
  const ent = useEntitlements();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [invited, setInvited] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const members = (org?.members ?? []) as { id: string; role: string; user?: { name?: string; email?: string } }[];

  /**
   * Invites that have been sent and not yet accepted.
   *
   * Without this the page counted a seat as free the moment an invite was
   * sent and showed nothing at all for someone who had been invited a week
   * ago and never clicked the link — so the only way to find out was to
   * invite them again.
   */
  const { data: invitations } = useQuery({
    queryKey: ["organization", org?.id, "invitations"],
    enabled: Boolean(org?.id),
    queryFn: async () => {
      const res = await authClient.organization.listInvitations();
      return ((res.data ?? []) as Invitation[]).filter((i) => i.status === "pending");
    },
    // A refused list is an empty list here: pending invites are useful context,
    // not something worth failing the page over.
    retry: false,
  });
  const pending = invitations ?? [];

  /**
   * Inviting is a role, not a plan — so a refusal here is a 403 and upgrading
   * would not fix it. The form is shown either way, switched off, for the same
   * reason locked features stay visible: a capability nobody can see is one
   * nobody knows to ask their admin for.
   */
  const canInvite = ent.allows("invitation", "create");

  /** Seats are a plan limit, and hitting it is a 402 nobody should meet mid-invite. */
  const seatLimit = ent.limit("seats");
  // An outstanding invite is a seat already spoken for.
  const seatsUsed = members.length + pending.length;
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
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-8 sm:px-6">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            You&apos;re not in a workspace yet — create one from the switcher in the header
            to invite teammates.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Team"
        description={`${org.name} · ${members.length} ${members.length === 1 ? "member" : "members"}${
          pending.length > 0 ? ` · ${pending.length} invited` : ""
        }`}
      />

      <Card className="mt-6">
        <CardContent className="pt-6">
          <UsageMeter
            label="Seats used"
            used={seatsUsed}
            limit={seatLimit}
            hint={
              seatsFull
                ? "Every seat on your plan is taken. Add seats from billing to invite more people."
                : "Pending invites count against your seats until they're accepted or expire."
            }
          />
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-base">Members</CardTitle>
              <CardDescription>People with access to this organization.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {members.length === 0 ? (
                <p className="text-muted-foreground px-6 text-sm">No members yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Member</TableHead>
                      <TableHead className="pr-6 text-right">Role</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((m) => {
                      const display = m.user?.name ?? m.user?.email ?? "Unknown";
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="py-2 pl-6">
                            <div className="flex items-center gap-3">
                              {/*
                                `text-primary-foreground`, not the hardcoded
                                `text-white` this used to carry: white on the
                                brand orange measures 2.78:1. See the token's
                                note in globals.css.
                              */}
                              <div className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                                {display.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{display}</p>
                                {m.user?.email && m.user.email !== display && (
                                  <p className="text-muted-foreground truncate text-xs">{m.user.email}</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="pr-6 text-right">
                            <Badge variant="secondary">{m.role}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {pending.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="font-display text-base">Pending invites</CardTitle>
                <CardDescription>Sent, but not yet accepted.</CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableBody>
                    {pending.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="pl-6">
                          <div className="flex items-center gap-3">
                            <span className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-full">
                              <Clock className="size-3.5" strokeWidth={1.75} />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm">{i.email}</p>
                              <p className="text-muted-foreground text-xs">
                                Expires {new Date(i.expiresAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="pr-6 text-right">
                          <Badge variant="outline">{i.role}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="h-fit">
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

                <Button type="submit" shape="pill" className="w-full">
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
