import { redirect } from "next/navigation";

/**
 * Design moved from a route into a sheet over the builder, so the form stays
 * visible while it is themed. Existing links land on Build, where the sheet
 * lives.
 */
export default async function DesignPage({ params }: PageProps<"/forms/[id]/design">) {
  const { id } = await params;
  redirect(`/forms/${id}/build`);
}
