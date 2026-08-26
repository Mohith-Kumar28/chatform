import { BuilderShell } from "@/components/builder/builder-shell";

/**
 * Persistent builder chrome. Everything under /forms/[id]/* renders inside
 * this, so the header, the loaded document and the undo history survive tab
 * navigation — the tabs used to be `useState` branches inside one component,
 * which meant no URLs, no back button and no per-tab code splitting.
 */
export default async function BuilderLayout({
  children,
  params,
}: LayoutProps<"/forms/[id]">) {
  const { id } = await params;
  return <BuilderShell formId={id}>{children}</BuilderShell>;
}
