import { redirect } from "next/navigation";

/** `/api-keys` is now `/settings/api-keys`. Linked from the docs and the integrate tab. */
export default function ApiKeysPage() {
  redirect("/settings/api-keys");
}
