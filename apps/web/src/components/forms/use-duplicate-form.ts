"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { postApiForms } from "@/lib/api/dashboard/dashboard";
import { invalidateForms } from "@/lib/query-keys";

/**
 * Copy a form into a new draft beside it.
 *
 * The server reads the source's saved document (`duplicateOf`), so the copy is
 * what is stored, and it lands in the source's workspace. Responses, versions
 * and the live link are not copied: a duplicate is a new form that starts
 * with the same questions. `open` goes straight to the copy's builder; the
 * dashboard leaves it off and offers it from the toast instead.
 */
export function useDuplicateForm() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return async (form: { id: string; title: string }, { open = false }: { open?: boolean } = {}) => {
    const title = `${form.title} (copy)`.slice(0, 200);
    try {
      const res = await postApiForms({ title, duplicateOf: form.id });
      // A 403 is the plan's form limit, and its message says so.
      if (res.status !== 200) throw new Error(res.data.error?.message ?? "Couldn't duplicate");
      const id = res.data.id;
      void invalidateForms(queryClient);
      if (open) {
        router.push(`/forms/${id}/build`);
        toast.success("Form duplicated");
      } else {
        toast.success("Form duplicated", { action: { label: "Open", onClick: () => router.push(`/forms/${id}/build`) } });
      }
    } catch (e) {
      toast.error("Couldn't duplicate", { description: e instanceof Error ? e.message : undefined });
    }
  };
}
