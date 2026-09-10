import type { QueryClient } from "@tanstack/react-query";
import {
  getGetApiFormsQueryKey,
  getGetApiWorkspacesQueryKey,
} from "@/lib/api/dashboard/dashboard";
import { getGetApiBillingEntitlementsQueryKey } from "@/lib/api/billing/billing";

/**
 * The forms list, invalidated from one place.
 *
 * Three components created forms and each invalidated `["forms"]` — a key
 * they had also each declared by hand. The generated client keys the same
 * query on its path (`["/api/forms"]`), so the moment any of them moved onto
 * the generated hook the invalidation would have silently stopped matching
 * and a newly created form would not have appeared until a reload.
 *
 * The workspace list goes with it, because `GET /workspaces` returns a
 * `formCount` per workspace and that is a fact about forms. Moving three forms
 * to another folder emptied the grid and left the switcher still offering
 * "My Workspace 4 / Archive 0" — the numbers under the menu disagreeing with
 * the page behind it until a reload. Anything that creates, deletes or moves a
 * form changes those counts, so anything that invalidates the list invalidates
 * them too.
 *
 * Entitlements go with them for the same reason one step further out.
 * `forms_count` and `workspaces_count` are `gauge` limits (see
 * `packages/entitlements/src/limits.ts`), so they are part of the entitlements
 * payload and they move every time a form is created or deleted. Without this
 * line the usage meter kept showing "Forms 4 / 10" for up to its own 60s
 * `staleTime` after the fifth one appeared in the grid behind it — the same
 * class of disagreement the workspace counts above were added to fix. The
 * server reads these gauges fresh on every request (they are deliberately not
 * in the API's five-minute KV cache), so invalidating really does get the new
 * number.
 */
export function invalidateForms(client: QueryClient): Promise<void> {
  return Promise.all([
    client.invalidateQueries({ queryKey: getGetApiFormsQueryKey() }),
    client.invalidateQueries({ queryKey: getGetApiWorkspacesQueryKey() }),
    client.invalidateQueries({ queryKey: getGetApiBillingEntitlementsQueryKey() }),
  ]).then(() => undefined);
}
