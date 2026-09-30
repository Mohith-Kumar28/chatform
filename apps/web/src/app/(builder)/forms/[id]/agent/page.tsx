import { redirect } from "next/navigation";

/**
 * Agent moved from a tab of its own into Settings, as its last section. Old
 * links (and a `?section=` sub-tab) land there.
 */
export default async function AgentPage({ params, searchParams }: PageProps<"/forms/[id]/agent">) {
  const { id } = await params;
  const { section } = await searchParams;
  const query = typeof section === "string" ? `?section=${encodeURIComponent(section)}` : "";
  redirect(`/forms/${id}/settings/agent${query}`);
}
