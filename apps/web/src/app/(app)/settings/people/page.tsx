"use client";

import { PeopleSection } from "@/components/settings/people-section";

/**
 * The one members-and-invites screen.
 *
 * There were two: this one, and the library's `/organization/people` tab —
 * different implementations writing the same `members` and `invitations` rows,
 * neither aware of the other. This is the one that survived, because it knows
 * about seats: the meter, the plan padlock on Send invite, and the expired
 * invitations that quietly stop holding a seat all live here and have no
 * equivalent in the generic table.
 */
export default function PeopleSettingsPage() {
  return <PeopleSection />;
}
