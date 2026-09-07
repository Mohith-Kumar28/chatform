import { redirect } from "next/navigation";

/** `/settings` is an address the avatar menu can point at; General is the door. */
export default function SettingsIndex() {
  redirect("/settings/general");
}
