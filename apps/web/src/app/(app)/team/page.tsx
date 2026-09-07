import { redirect } from "next/navigation";

/**
 * `/team` is now `/settings/people`.
 *
 * A redirect rather than a deletion: this was a top-level nav item for the whole
 * life of the product, so it is in bookmarks, in the command palette's muscle
 * memory, and in the seat paywall's own copy. Same reasoning, and the same
 * shape, as `/billing → /usage`.
 */
export default function TeamPage() {
  redirect("/settings/people");
}
