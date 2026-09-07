import { redirect } from "next/navigation";

/**
 * `/usage` is now `/settings/usage`.
 *
 * The query string has to survive: the payment provider's return URL lands here
 * with `?checkout=success`, and `/pricing` sends people with `?plan=`. A redirect
 * that dropped them would land a finished checkout on a page that never learns it
 * succeeded — the same reason `/billing` forwards its query to here.
 */
export default async function UsagePage({
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
