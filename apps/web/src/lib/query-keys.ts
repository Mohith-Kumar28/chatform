import type { QueryClient } from "@tanstack/react-query";
import { getGetApiFormsQueryKey } from "@/lib/api/dashboard/dashboard";

/**
 * The forms list, invalidated from one place.
 *
 * Three components created forms and each invalidated `["forms"]` — a key
 * they had also each declared by hand. The generated client keys the same
 * query on its path (`["/api/forms"]`), so the moment any of them moved onto
 * the generated hook the invalidation would have silently stopped matching
 * and a newly created form would not have appeared until a reload.
 */
export function invalidateForms(client: QueryClient): Promise<void> {
  return client.invalidateQueries({ queryKey: getGetApiFormsQueryKey() });
}
