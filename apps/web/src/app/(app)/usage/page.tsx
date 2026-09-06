import { redirect } from "next/navigation";

/**
 * `/usage` is absorbed by `/billing`.
 *
 * Kept as a redirect rather than deleted: the command palette and any bookmark still
 * point here, and two pages showing the same numbers is how they end up disagreeing.
 * The usage pill that also pointed here is gone — see `plan-badge.tsx` for why.
 */
export default function UsagePage() {
  redirect("/billing");
}
