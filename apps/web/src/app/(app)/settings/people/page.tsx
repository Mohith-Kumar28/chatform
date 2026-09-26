import { redirect } from "next/navigation";

/** `/settings/people` is now `/settings/team`; kept for bookmarks and old links. */
export default function PeopleSettingsRedirect() {
  redirect("/settings/team");
}
