import { TemplateDetail } from "@/components/templates/template-detail";

/**
 * A template gets a page of its own, because choosing one is a decision.
 *
 * A route rather than a modal over the gallery: it is linkable (the command
 * palette points straight at it), it survives a refresh, and the back button
 * means what it says. It also has room for the two panes the decision actually
 * needs — the questions and the flow — which a dialog over a grid does not.
 */
export default async function TemplateDetailPage({ params }: PageProps<"/templates/[slug]">) {
  const { slug } = await params;
  return <TemplateDetail slug={slug} />;
}
