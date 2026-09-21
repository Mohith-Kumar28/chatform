/**
 * The one envelope every list endpoint answers in.
 *
 * `docs/pagination.mdx` says a list returns `{data, has_more, next_cursor}` and
 * that you page by handing `next_cursor` back. Six list endpoints, five shapes:
 * `/v1/forms` and `/v1/forms/{id}/responses` honoured it, `/v1/templates`,
 * `/v1/webhooks`, `/v1/forms/{id}/versions` and `/v1/forms/{id}/integrations`
 * answered a bare array, and `/v1/exports` answered `{data}` with no cursor at
 * all. A client written to the documented contract read `.data` of an array and
 * got `undefined`.
 *
 * The four that are wrapped here are bounded rather than paged: a form has a
 * handful of versions, an organization a handful of webhooks, and there are
 * thirty-five templates. `has_more` is therefore honestly `false` today. That is
 * the point of wrapping them anyway — when one of them does grow a cursor, the
 * shape callers are already reading will not have to change again.
 */
export interface Page<T> {
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
}

export function page<T>(data: T[], opts: { hasMore?: boolean; nextCursor?: string | null } = {}): Page<T> {
  return { data, has_more: opts.hasMore ?? false, next_cursor: opts.nextCursor ?? null };
}
