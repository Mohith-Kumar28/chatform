import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HubPage } from "@/components/templates/gallery/hub-page";
import { GOALS, byGoal, goalPath } from "@/content/templates";
import { hubCopy } from "@/content/templates/hubs";
import { hubMetadata } from "@/content/templates/hub-metadata";

export const dynamicParams = false;

export function generateStaticParams() {
  return GOALS.filter((g) => byGoal(g.slug).length > 0).map((g) => ({ goal: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ goal: string }> }): Promise<Metadata> {
  const { goal: slug } = await params;
  const goal = GOALS.find((g) => g.slug === slug);
  if (!goal) return {};
  return hubMetadata(goalPath(goal.slug), hubCopy(`goal:${goal.slug}`));
}

/** Templates for one goal, across every type. */
export default async function TemplateGoalPage({ params }: { params: Promise<{ goal: string }> }) {
  const { goal: slug } = await params;
  const goal = GOALS.find((g) => g.slug === slug);
  if (!goal) notFound();
  const path = goalPath(goal.slug);
  return <HubPage path={path} crumbs={[{ name: goal.label, path }]} copy={hubCopy(`goal:${goal.slug}`)} templates={byGoal(goal.slug)} eyebrow={`${byGoal(goal.slug).length} free templates`} />;
}
