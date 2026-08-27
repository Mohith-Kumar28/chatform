import { redirect } from "next/navigation";

/**
 * `/usage` is absorbed by `/billing`.
 *
 * Kept as a redirect rather than deleted: the usage pill, the command palette and any
 * bookmark still point here, and two pages showing the same numbers is how they end up
 * disagreeing.
 */
export default function UsagePage() {
  redirect("/billing");
}
