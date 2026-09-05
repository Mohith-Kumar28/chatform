/**
 * Read the body out of a generated client response.
 *
 * The generated functions are typed as returning `{ data, status } & { headers }`,
 * but `customFetch` returns `await res.json()` — the bare body — and orval
 * types that call as the wrapper. So the types and the runtime disagree, and
 * every call site has had to launder the difference itself: `templates/page.tsx`
 * casts through `unknown` to reach `.id`, and the dashboard sidestepped the
 * generated hooks entirely and re-declared its own row type.
 *
 * This is the one place that lie is told, so it is the one place to fix when
 * the generator config is corrected.
 */
export function apiData<T>(response: unknown): T {
  return response as T;
}
