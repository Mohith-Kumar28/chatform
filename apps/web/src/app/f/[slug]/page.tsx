import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { PublicFormConfig } from "@repo/form-schema";
import { ChatClient } from "@/components/chat/chat-client";
import { ViewPing } from "@/components/chat/view-ping";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:8787";
const PUBLIC_API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:8787";

async function getConfig(slug: string): Promise<PublicFormConfig | null> {
  try {
    const res = await fetch(`${API_ORIGIN}/p/forms/${slug}/config`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as PublicFormConfig;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps<"/f/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const config = await getConfig(slug);
  if (!config) return { title: "Form not found", robots: { index: false } };

  const title = config.meta?.ogTitle ?? config.title;
  const description = config.meta?.ogDescription ?? `Answer a few questions — it only takes a minute.`;

  return {
    title,
    description,
    robots: config.meta?.noIndex ? { index: false, follow: false } : undefined,
    openGraph: {
      title,
      description,
      type: "website",
      images: config.meta?.ogImageUrl ? [{ url: config.meta.ogImageUrl }] : undefined,
    },
    twitter: {
      card: config.meta?.ogImageUrl ? "summary_large_image" : "summary",
      title,
      description,
    },
  };
}

export default async function PublicFormPage({ params, searchParams }: PageProps<"/f/[slug]">) {
  const { slug } = await params;
  const query = await searchParams;
  const config = await getConfig(slug);

  // A dead API or a bad slug used to render a plausible-looking empty chat
  // built from a hardcoded fallback config. A respondent could sit in a form
  // that would never ask anything. 404 instead.
  if (!config) notFound();

  // Hidden fields and per-block prefills arrive as query parameters.
  const hiddenFields: Record<string, string> = {};
  for (const name of config.hiddenFieldNames ?? []) {
    const value = query[name];
    if (typeof value === "string") hiddenFields[name] = value;
  }

  return (
    <>
      <ViewPing slug={slug} apiOrigin={PUBLIC_API_ORIGIN} />
      <ChatClient config={config} hiddenFields={hiddenFields} />
    </>
  );
}
