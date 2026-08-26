import { redirect } from "next/navigation";

/** /forms/[id] has no content of its own — Build is the entry point. */
export default async function FormIndexPage({ params }: PageProps<"/forms/[id]">) {
  const { id } = await params;
  redirect(`/forms/${id}/build`);
}
