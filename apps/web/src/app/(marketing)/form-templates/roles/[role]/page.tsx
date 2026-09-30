import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HubPage } from "@/components/templates/gallery/hub-page";
import { ROLES, byRole, rolePath } from "@/content/templates";
import { hubCopy } from "@/content/templates/hubs";
import { hubMetadata } from "@/content/templates/hub-metadata";

export const dynamicParams = false;

export function generateStaticParams() {
  return ROLES.filter((r) => byRole(r.slug).length > 0).map((r) => ({ role: r.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ role: string }> }): Promise<Metadata> {
  const { role: slug } = await params;
  const role = ROLES.find((r) => r.slug === slug);
  if (!role) return {};
  return hubMetadata(rolePath(role.slug), hubCopy(`role:${role.slug}`));
}

/** Templates for one line of work, across every type. */
export default async function TemplateRolePage({ params }: { params: Promise<{ role: string }> }) {
  const { role: slug } = await params;
  const role = ROLES.find((r) => r.slug === slug);
  if (!role) notFound();
  const path = rolePath(role.slug);
  return <HubPage path={path} crumbs={[{ name: `For ${role.label.toLowerCase()}`, path }]} copy={hubCopy(`role:${role.slug}`)} templates={byRole(role.slug)} />;
}
