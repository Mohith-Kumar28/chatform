"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient, useSession } from "@/lib/auth/auth-client";
import { useActiveOrg } from "@/hooks/use-active-org";
import { useEntitlements, ENTITLEMENTS_KEY } from "@/hooks/use-entitlements";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { UsageMeter } from "@/components/ui/usage-meter";
import { LockedControl, useUpgrade } from "@/components/billing/gate";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, Clock, Lock, MailWarning, MoreHorizontal, UserPlus } from "lucide-react";
// Shared with the workspace switcher, which shows the reader their own role.
// Two copies of "member means editor" is one copy too many.
import {
  ASSIGNABLE_ROLES,
  type AssignableRole,
  primaryRole,
  roleLabel,
} from "@/lib/roles";

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
 *
 * ## Layout
 *
 * One roster, not three lists. Members, live invitations and expired ones are
 * the same question — "who can get into this organization, and who is on the
 * way in" — and splitting them into separate cards meant the seat total was the
 * only place they were ever added up. They share a table now; the row treatment
 * carries the difference.
 *
 * The seat meter sits inside the invite card rather than in a band across the
 * top. Seats are only ever interesting next to the control they constrain, and
 * as a full-width card it was a lot of chrome around one number — which then
 * repeated the "every seat is taken" sentence that the invite form was already
 * saying two hundred pixels to the right.
 */

/**
 * The roles an invite may assign, and what each one means.
 *
 * Moved to `lib/roles` when the create-workspace flow grew an invite step of
 * its own: two copies of "Admin — everything except billing" is two places for
 * it to stop being true.
 */
const ROLES = ASSIGNABLE_ROLES;

type Role = AssignableRole;

/**
 * What each role actually means, for the expandable matrix.
 *
 * Hand-written rather than derived from the permission statements, and
 * deliberately so: `apps/api/src/lib/permissions.ts` is the enforcement
 * boundary and lists twelve resources, most of which mean nothing to the person
 * choosing between "Admin" and "Editor". This is the six sentences that change
 * someone's answer. It is help text, not an authorization decision — the server
 * refuses regardless of what this table claims — but it must not drift, so it
 * is pinned to those statements by `apps/api/tests/team-roles.test.ts`.
 */
const CAPABILITIES = [
  { label: "Read responses and analytics", owner: true, admin: true, editor: true, viewer: true },
  { label: "Build, edit and publish forms", owner: true, admin: true, editor: true, viewer: false },
  { label: "Export responses, see partial ones", owner: true, admin: true, editor: true, viewer: false },
  { label: "API keys, custom domain, audit log", owner: true, admin: true, editor: false, viewer: false },
  { label: "Invite and remove teammates", owner: true, admin: true, editor: false, viewer: false },
  { label: "Change the plan", owner: true, admin: false, editor: false, viewer: false },
] as const;

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string | Date;
}

/** An invitation with its expiry already resolved against a single clock reading. */
type ResolvedInvitation = Invitation & { expired: boolean };

interface Member {
  id: string;
  userId: string;
  role: string;
  user?: { name?: string; email?: string };
}

/**
 * Live invitations, with expiry resolved once against a single clock reading.
 *
 * At module scope rather than inside the query, and that is not only about
 * `Date.now()` being impure — the compiler flags everything written inside the
 * `useQuery` call, deferred or not. Taking the reading where the list arrives is
 * also the more correct place: it is the same moment the server counted seats
 * from, and a 48-hour window does not need a clock that ticks in render.
 */
function resolveInvitations(rows: Invitation[]): ResolvedInvitation[] {
  const now = Date.now();
  return rows
    .filter((i) => i.status === "pending")
    .map((i) => ({ ...i, expired: new Date(i.expiresAt).getTime() <= now }));
}

export default function TeamPage() {
  const { org, isPending } = useActiveOrg();
  const { data: session } = useSession();
  const ent = useEntitlements();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [invited, setInvited] = useState<string | null>(null);
  const upgrade = useUpgrade();
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  /** The row with a request in flight, so only its own menu goes quiet. */
  const [busyRow, setBusyRow] = useState<string | null>(null);

  const members = (org?.members ?? []) as Member[];
  const meId = session?.user?.id;

  /**
   * Invites that have been sent and not yet accepted.
   *
   * Without this the page counted a seat as free the moment an invite was
   * sent and showed nothing at all for someone who had been invited a week
   * ago and never clicked the link — so the only way to find out was to
   * invite them again.
   */
  const invitationsKey = ["organization", org?.id, "invitations"] as const;
  const { data: invitations } = useQuery({
    queryKey: invitationsKey,
    enabled: Boolean(org?.id),
    queryFn: async () => {
      const res = await authClient.organization.listInvitations();
      return resolveInvitations((res.data ?? []) as Invitation[]);
    },
    // A refused list is an empty list here: pending invites are useful context,
    // not something worth failing the page over.
    retry: false,
  });

  /**
   * `status` is not enough to know an invitation is still live.
   *
   * Better Auth never writes the row back to `expired`; it compares `expiresAt`
   * at accept time and leaves the status alone. So a `pending` row can be weeks
   * dead. The server's seat count makes the same distinction (`countSeats`), and
   * the two must agree or this page will insist there is a free seat that the
   * invite endpoint then refuses — or the reverse.
   */
  const pending = (invitations ?? []).filter((i) => !i.expired);
  const expired = (invitations ?? []).filter((i) => i.expired);

  /**
   * Inviting is a role, not a plan — so a refusal here is a 403 and upgrading
   * would not fix it. The form is shown either way, switched off, for the same
   * reason locked features stay visible: a capability nobody can see is one
   * nobody knows to ask their admin for.
   */
  const canInvite = ent.allows("invitation", "create");
  const canCancel = ent.allows("invitation", "cancel");
  const canRemove = ent.allows("member", "delete");
  const canSetRole = ent.allows("member", "update");

  /** Seats are a plan limit, and hitting it is a 402 nobody should meet mid-invite. */
  const seatLimit = ent.limit("seats");
  // A live invite is a seat already spoken for. An expired one is not — it can
  // never be accepted, and holding a seat for it is how an organization ends up
  // permanently short of a seat it is paying for.
  const seatsUsed = members.length + pending.length;
  const seatsFull = seatLimit !== null && seatsUsed >= seatLimit;

  /**
   * Anything that changes the roster changes the seat count, and the seat count
   * is served by the entitlements endpoint — which every gate in the product
   * reads. Refreshing only the list would leave the meter above the form
   * disagreeing with the server that enforces it.
   */
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: invitationsKey }),
      qc.invalidateQueries({ queryKey: ENTITLEMENTS_KEY }),
    ]);
  };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const res = await authClient.organization.inviteMember({ email, role: role as never });
      if (res.error) throw new Error(res.error.message ?? "Invite failed");
      setInvited(email);
      setEmail("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setSending(false);
    }
  };

  /** One wrapper so every row action reports the same way. */
  const run = async (rowId: string, label: string, fn: () => Promise<{ error?: unknown }>) => {
    setBusyRow(rowId);
    try {
      const res = await fn();
      const err = res?.error as { message?: string } | undefined;
      if (err) throw new Error(err.message ?? `${label} failed`);
      await refresh();
      toast.success(label);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setBusyRow(null);
    }
  };

  const changeRole = (m: Member, next: string) =>
    run(m.id, "Role updated", () =>
      authClient.organization.updateMemberRole({ memberId: m.id, role: next as never }),
    );

  const removeMember = (m: Member) => {
    const who = m.user?.name ?? m.user?.email ?? "this person";
    confirm({
      title: `Remove ${who}?`,
      description:
        "They lose access to every form in this organization immediately. Responses they collected stay. You can invite them again later.",
      confirmLabel: "Remove",
      onConfirm: () =>
        run(m.id, "Member removed", () =>
          authClient.organization.removeMember({ memberIdOrEmail: m.id }),
        ),
    });
  };

  const revoke = (i: ResolvedInvitation) =>
    run(i.id, "Invitation revoked", () =>
      authClient.organization.cancelInvitation({ invitationId: i.id }),
    );

  const resend = (i: ResolvedInvitation) =>
    run(i.id, "Invitation sent again", () =>
      authClient.organization.inviteMember({
        email: i.email,
        role: primaryRole(i.role) as never,
        resend: true,
      }),
    );

  if (isPending) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <Skeleton className="h-9 w-32" />
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
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

  const canManageRows = canRemove || canSetRole || canCancel;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Team"
        description={`${org.name} · ${members.length} ${members.length === 1 ? "member" : "members"}${
          pending.length > 0 ? ` · ${pending.length} invited` : ""
        }`}
      />

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-base">People</CardTitle>
              <CardDescription>
                Everyone with access to this organization, and anyone on the way in.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-2">
              <ul className="divide-border divide-y">
                {members.map((m) => {
                  const display = m.user?.name ?? m.user?.email ?? "Unknown";
                  const isMe = m.userId === meId;
                  const isOwner = primaryRole(m.role) === "owner";
                  // The owner's row has no menu at all. Their role cannot be
                  // changed from here (transferring ownership is its own
                  // operation) and the server refuses to remove the last one —
                  // offering either would be a control that exists to fail.
                  const actionable = canManageRows && !isOwner && !isMe;
                  return (
                    <li key={m.id} className="flex items-center gap-3 px-6 py-3">
                      {/*
                        `text-primary-foreground`, not the hardcoded
                        `text-white` this used to carry: white on the
                        brand orange measures 2.78:1. See the token's
                        note in globals.css.
                      */}
                      <div className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                        {display.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                          {display}
                          {isMe && (
                            <span className="text-muted-foreground text-xs font-normal">you</span>
                          )}
                        </p>
                        {m.user?.email && m.user.email !== display && (
                          <p className="text-muted-foreground truncate text-xs">{m.user.email}</p>
                        )}
                      </div>
                      <Badge variant={isOwner ? "soft" : "secondary"}>{roleLabel(m.role)}</Badge>
                      {actionable ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={busyRow === m.id}
                              aria-label={`Manage ${display}`}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            {canSetRole && (
                              <>
                                <DropdownMenuLabel>Role</DropdownMenuLabel>
                                <DropdownMenuRadioGroup
                                  value={roleLabel(m.role)}
                                  onValueChange={(v) => changeRole(m, v)}
                                >
                                  {ROLES.map((r) => (
                                    <DropdownMenuRadioItem key={r.value} value={r.value}>
                                      {r.label}
                                    </DropdownMenuRadioItem>
                                  ))}
                                </DropdownMenuRadioGroup>
                              </>
                            )}
                            {canSetRole && canRemove && <DropdownMenuSeparator />}
                            {canRemove && (
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => removeMember(m)}
                              >
                                Remove from organization
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        // Holds the column so names and badges stay on one
                        // vertical rhythm whether or not a row has a menu.
                        <span className="size-8 shrink-0" aria-hidden />
                      )}
                    </li>
                  );
                })}

                {[...pending, ...expired].map((i) => {
                  const dead = i.expired;
                  return (
                    <li key={i.id} className="flex items-center gap-3 px-6 py-3">
                      <span
                        className={
                          dead
                            ? "bg-[var(--warning-soft)] text-[var(--warning-soft-foreground)] grid size-8 shrink-0 place-items-center rounded-full"
                            : "bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-full"
                        }
                      >
                        {dead ? (
                          <MailWarning className="size-3.5" strokeWidth={1.75} />
                        ) : (
                          <Clock className="size-3.5" strokeWidth={1.75} />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{i.email}</p>
                        <p className="text-muted-foreground text-xs">
                          {dead
                            ? "Invitation expired — it no longer holds a seat"
                            : `Invited · expires ${new Date(i.expiresAt).toLocaleDateString()}`}
                        </p>
                      </div>
                      <Badge variant="outline">{roleLabel(i.role)}</Badge>
                      {canCancel || canInvite ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={busyRow === i.id}
                              aria-label={`Manage invitation for ${i.email}`}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            {canInvite && (
                              <DropdownMenuItem onSelect={() => resend(i)}>
                                Send invitation again
                              </DropdownMenuItem>
                            )}
                            {canCancel && (
                              <DropdownMenuItem variant="destructive" onSelect={() => revoke(i)}>
                                {dead ? "Remove invitation" : "Revoke invitation"}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <span className="size-8 shrink-0" aria-hidden />
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          {/*
            Roles are four words with no shared meaning across products, and the
            invite form only ever showed one sentence about the one you happened
            to have selected. This is the comparison someone is actually making.
          */}
          {/* `py-0`: the trigger brings its own vertical rhythm, and the card's
              default padding on top of it made a collapsed row read as an empty
              card with a sentence floating in it. */}
          <Card className="py-0">
            <Accordion type="single" collapsible>
              <AccordionItem value="roles" className="border-b-0">
                <AccordionTrigger className="px-6 py-4 text-sm">
                  What each role can do
                </AccordionTrigger>
                <AccordionContent className="px-6">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[26rem] text-sm">
                      <thead>
                        <tr className="text-muted-foreground text-xs">
                          <th className="py-2 text-left font-medium">Can</th>
                          {["Owner", "Admin", "Editor", "Viewer"].map((r) => (
                            <th key={r} className="w-16 py-2 text-center font-medium">
                              {r}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {CAPABILITIES.map((c) => (
                          <tr key={c.label} className="border-border border-t">
                            <td className="py-2 pr-3">{c.label}</td>
                            {([c.owner, c.admin, c.editor, c.viewer] as const).map((yes, i) => (
                              <td key={i} className="py-2 text-center">
                                {yes ? (
                                  <Check
                                    className="text-primary mx-auto size-4"
                                    strokeWidth={2.25}
                                    aria-label="yes"
                                  />
                                ) : (
                                  <span className="text-muted-foreground/50" aria-label="no">
                                    —
                                  </span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Card>
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
          <CardContent className="space-y-4">
            {/*
              The seat meter lives here, next to the thing it constrains, rather
              than in a band across the top of the page — and it is the only
              place the seat story is told, so "every seat is taken" is not said
              twice on one screen.
            */}
            <UsageMeter
              label="Seats used"
              used={seatsUsed}
              limit={seatLimit}
              hint={
                seatsFull
                  ? undefined
                  : "Invitations hold a seat until they're accepted or they expire."
              }
              className="border-border border-b pb-4"
            />

            <form onSubmit={invite} className="space-y-4">
              {/*
                `seatsFull` deliberately not here.

                A disabled fieldset disables every form control inside it, and
                the padlock chip `LockedControl` draws is a `<button>`. So
                locking the seat gate this way killed the one thing on the card
                that was supposed to be clickable — the chip opened the paywall
                everywhere else in the product and did nothing here, which is
                the discrepancy that got reported.

                The seat lock belongs on the control it locks, not on the
                fieldset around it. `canInvite` stays: a viewer has no business
                typing an address at all, and there is no upgrade that fixes a
                role.
              */}
              <fieldset disabled={!canInvite || sending} className="space-y-4">
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

                {/*
                  Show, don't hide — the rule `gate.tsx` opens with, and the one
                  place in the product that used to break it.

                  This hid "Send invite" when the seats ran out and put an "Add
                  seats" button in its place, on the reasoning that a dead
                  primary button is loud and useless. But every other paid wall
                  in the product — Create key, the export switches, the custom
                  domain — stays exactly where it is, inert, wearing a padlock
                  and the name of the plan that opens it. A control that
                  disappears reads as a bug; one that is visibly locked reads as
                  a price, and it is the only version that teaches anybody what
                  they are missing.

                  Seats were the exception only because `LockedControl` could
                  not express "a limit is spent" — it keyed on feature flags.
                  Now it takes either, so this is the same component, the same
                  chip and the same paywall as everywhere else.
                */}
                <LockedControl limit="seats" used={seatsUsed} locked={seatsFull}>
                  <Button type="submit" shape="pill" className="w-full">
                    <UserPlus className="size-4" /> {sending ? "Sending…" : "Send invite"}
                  </Button>
                </LockedControl>
              </fieldset>

              {/*
                Said before the click rather than after: hitting the seat limit
                mid-invite means typing an address, pressing send, and being
                shown a paywall instead of a confirmation. And the way out is
                the button, not a sentence containing a link.
              */}
              {seatsFull && canInvite && (
                <div className="space-y-2">
                  <p className="text-muted-foreground text-sm">
                    Every seat on your plan is taken.
                    {expired.length > 0
                      ? " Revoking an expired invitation above frees one, or add seats."
                      : " Add seats to invite more people."}
                  </p>
                  {/*
                    The tier, on the button, the way every other paid control in
                    the product names it. "Add seats" on its own asked the reader
                    to go to /billing to find out which plan they were being
                    asked for — and seats are a limit rather than a feature, so
                    there is no `LockedControl` here to have said it for us.

                    `nextPlanWithMore` is the same rule the server uses when it
                    refuses an invite for want of a seat, so the plan named here
                    and the plan named in that denial cannot drift apart. Absent
                    on the top plan, where extra seats are bought by the seat and
                    there is no tier to move to.
                  */}
                  {/*
                    The same paywall the padlock opens, from a control big
                    enough to find.

                    It used to be a link to `/billing`, which is a price list —
                    it told somebody who already knew they needed seats to go
                    and read about plans, then find the right one, then start a
                    checkout. The paywall names the plan, the price and the
                    monthly/yearly choice, and its button goes straight to
                    Dodo. Same destination as every other gate in the product,
                    which is the point: there is one way to be asked to pay.
                  */}
                  <Button
                    variant="outline"
                    shape="pill"
                    className="w-full"
                    onClick={() => upgrade({ limit: "seats", used: seatsUsed }, { surface: "team" })}
                  >
                    Add seats
                  </Button>
                </div>
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

      {dialog}
    </div>
  );
}
