import { redirect } from "next/navigation";

/**
 * `/organization` is now the organization half of `/settings`.
 *
 * `people` matters most here: it was one of the two members screens the product
 * shipped at once, and it is the one that lost. Anyone who bookmarked it gets
 * the surviving one, which does strictly more.
 */
const SECTIONS: Record<string, string> = {
  settings: "/settings/general",
  general: "/settings/general",
  people: "/settings/people",
  members: "/settings/people",
};

export default async function OrganizationPage({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  redirect(SECTIONS[path?.[0] ?? ""] ?? "/settings/general");
}
