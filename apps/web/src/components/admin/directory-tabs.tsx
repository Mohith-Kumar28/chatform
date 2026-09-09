"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { SegmentedControl } from "@/components/ui/segmented-control";

/**
 * Three ways to look up the same platform: by account, by person, by form.
 *
 * One page rather than three nav slots, because they answer the same question
 * from different directions — a support request arrives as an email address, a
 * billing question as an account, and a bug report as a form URL, and whichever
 * one you have is the one you search by. Splitting them across the top-level nav
 * would make you guess which list a thing lives in before you can look for it.
 *
 * The mode is in the URL so a filtered view stays linkable, same as every other
 * filter in the console.
 */

export const DIRECTORY_TABS = [
  { value: "accounts", label: "Organizations" },
  { value: "people", label: "People" },
  { value: "forms", label: "Forms" },
] as const;

export type DirectoryTab = (typeof DIRECTORY_TABS)[number]["value"];

export function useDirectoryTab(): DirectoryTab {
  const value = useSearchParams().get("view");
  return (DIRECTORY_TABS as readonly { value: string }[]).some((t) => t.value === value)
    ? (value as DirectoryTab)
    : "accounts";
}

export function DirectoryTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = useDirectoryTab();

  return (
    <SegmentedControl
      size="sm"
      value={tab}
      onChange={(next) => {
        const q = new URLSearchParams(params.toString());
        q.set("view", next);
        // Filters and paging belong to the list you were on, not the next one.
        for (const key of ["q", "cohort", "plan", "sort", "offset", "status"]) q.delete(key);
        router.replace(`${pathname}?${q.toString()}`, { scroll: false });
      }}
      options={DIRECTORY_TABS.map((t) => ({ value: t.value, label: t.label }))}
      ariaLabel="What to list"
    />
  );
}
