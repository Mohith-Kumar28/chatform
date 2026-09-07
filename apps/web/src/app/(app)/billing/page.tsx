import { redirect } from "next/navigation";

/**
 * `/billing` is now `/usage`.
 *
 * The money left this app for the payment provider's portal — invoices, cards, tax and
 * cancellation are theirs — so what remained here was the meters and one door out. That
 * is a usage page, and calling it billing sent people looking for an invoice they were
 * never going to find on it.
 *
 * A redirect rather than a deletion: old bookmarks, and the `?plan=`/`?checkout=`
 * parameters `/pricing` and the provider's return URL still carry. `redirect` preserves
 * neither by itself, so the query is forwarded explicitly — dropping it would land a
 * finished checkout on a page that never learns it succeeded.
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") qs.set(key, value);
    else if (Array.isArray(value) && value[0]) qs.set(key, value[0]);
  }
  const query = qs.toString();
  redirect(query ? `/settings/usage?${query}` : "/settings/usage");
}
