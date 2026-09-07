"use client";

import { Building2, Check } from "lucide-react";
import { useActiveOrg } from "@/hooks/use-active-org";
import { OrganizationMembers } from "@/components/auth/organization/organization-members";
import { OrganizationInvitations } from "@/components/auth/organization/organization-invitations";
import { SettingsSectionHeader } from "@/components/settings/settings-section-header";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Who is in this workspace, and inviting more of them.
 *
 * ## Why this is the library's table and not our own
 *
 * There were two members screens shipping at once — this route's hand-written
 * roster and Better Auth UI's `/organization/people` — writing the same rows and
 * unaware of each other. The hand-written one won the first cut on the strength
 * of what it knew about *seats*; that was the wrong comparison. It was a plain
 * `<ul>` with no search, no sorting, no pagination and no bulk actions, judged
 * against a workspace containing one person. Business sells twenty-five.
 *
 * The library's version pages against the server, filters and sorts roles
 * server-side, searches, selects in bulk, and gets the ownership rules right in
 * ways ours only approximated — you cannot select yourself, cannot remove the
 * last owner, and a non-owner cannot select an owner. It also already models
 * `membershipLimit`, `invitationLimit` and localized limit copy, which we had
 * hand-rolled a parallel version of.
 *
 * These files are ejected and product-owned, so adopting them is not accepting
 * their look. What ours knew has been carried *into* them rather than kept
 * beside them: the seat count sits next to the invite button, that button wears
 * the plan padlock and opens the paywall, a seat refusal from the server becomes
 * that same paywall instead of a raw `PAYMENT_REQUIRED`, and an invitation past
 * its expiry finally reads as expired rather than pending forever.
 *
 * What stays here is the one thing the library has no opinion about: what the
 * roles actually mean.
 */

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

export function PeopleSection() {
  const { org, isPending } = useActiveOrg();

  if (isPending) {
    return (
      <>
        <SettingsSectionHeader title="People" />
        <div className="space-y-6">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </>
    );
  }

  if (!org) {
    return (
      <>
        <SettingsSectionHeader title="People" />
        <EmptyState
          icon={Building2}
          title="You're not in a workspace yet"
          description="Create one from the switcher in the header, and the people in it will appear here."
        />
      </>
    );
  }

  return (
    <>
      {/* The workspace's name is not repeated here — the rail beside this pane
          is headed with it, and saying it twice on one screen is the duplication
          this consolidation exists to remove. */}
      <SettingsSectionHeader title="People" />

      <div className="flex flex-col gap-8">
        <OrganizationMembers />
        <OrganizationInvitations />

        {/*
          Roles, in the terms somebody choosing one actually thinks in.

          Collapsed, because it is read once — when you are about to send an
          invitation and want to know what Editor lets that person do — and then
          never again. `py-0`: the trigger brings its own vertical rhythm, and
          the card's default padding on top of it made a collapsed row read as an
          empty card with a sentence floating in it.
        */}
        <Card className="py-0">
          <Accordion type="single" collapsible>
            <AccordionItem value="roles" className="border-b-0">
              <AccordionTrigger className="px-6 py-4 text-sm">What each role can do</AccordionTrigger>
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
                                <Check className="text-primary mx-auto size-4" strokeWidth={2.25} aria-label="yes" />
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
    </>
  );
}
