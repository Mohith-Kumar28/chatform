import { UseTemplate } from "@/components/templates/use-template";

/**
 * "Use this template", as an address.
 *
 * The public template pages link here. Signed in, it copies the template into
 * the workspace and opens it in the builder. Signed out, the app's auth guard
 * sends the visitor to sign in (or sign up) with this address as `next`, so
 * they land back here and the same thing happens: one click from a search
 * result to editing their own copy.
 */
export default async function UseTemplatePage({ params }: PageProps<"/templates/[slug]/use">) {
  const { slug } = await params;
  return <UseTemplate slug={slug} />;
}
