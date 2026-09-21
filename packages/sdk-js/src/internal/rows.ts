/**
 * Read a list response whichever envelope it arrives in.
 *
 * `/v1/templates`, `/v1/webhooks`, `/v1/forms/{id}/versions` and
 * `/v1/forms/{id}/integrations` used to answer a bare array and now answer
 * `{data, has_more, next_cursor}` like every other list. A client pinned to
 * either shape breaks against a deployment running the other, and both exist:
 * self-hosted workers update on their own schedule, and 0.1.1 of this package
 * is on the registry expecting arrays.
 *
 * So the SDK reads both and keeps returning an array. These four are bounded —
 * a form has a handful of versions, an organization a handful of webhooks —
 * so there is no cursor for a caller to carry and an array is the honest
 * ergonomics. `forms.list()` and `responses.list()` still return a `Page`,
 * because those genuinely page.
 */
export function rows<T>(body: T[] | { data: T[] } | null | undefined): T[] {
  if (Array.isArray(body)) return body;
  if (body && Array.isArray((body as { data?: T[] }).data)) return (body as { data: T[] }).data;
  return [];
}
