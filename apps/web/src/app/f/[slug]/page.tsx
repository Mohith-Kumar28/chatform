import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { PublicFormConfig } from "@repo/form-schema";
import { ChatClient } from "@/components/chat/chat-client";
import { ViewPing } from "@/components/chat/view-ping";
import { EmbedBridge } from "@/components/chat/embed-bridge";
// Absolute, because a crawler resolves `og:image` against nothing.
import { SITE_ORIGIN } from "@/lib/seo";

// Server-side fetch origin. `API_ORIGIN` may differ from the public one when the
// worker is reachable internally; both default to the deployed API.
const API_ORIGIN = process.env.API_ORIGIN ?? process.env.NEXT_PUBLIC_API_ORIGIN ?? "https://api.chatform.in";
const PUBLIC_API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "https://api.chatform.in";

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

  /**
   * Every form link unfurls as a card, uploaded or not.
   *
   * Without an image a shared link was a bare line of text in Slack and a grey
   * box on LinkedIn — the least trustworthy thing a link can look like, and it
   * was the default for every form nobody had uploaded an image to. The
   * fallback is our own card wearing the form's title, drawn on request at
   * `/og/form`, so the author's link looks deliberate before they have done
   * anything. Their own upload still wins the moment there is one.
   */
  const ogImage =
    config.meta?.ogImageUrl ??
    `${SITE_ORIGIN}/og/form?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`;

  return {
    title,
    description,
    robots: config.meta?.noIndex ? { index: false, follow: false } : undefined,
    // A form's own favicon when it has one, so a hosted form in a tab is the
    // sender's brand rather than ours. Absent, Next falls back to the app's own
    // icon, which is the chatform mark.
    icons: config.meta?.faviconUrl ? { icon: config.meta.faviconUrl } : undefined,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
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

  /**
   * Embedded mode.
   *
   * `?embed=1` has been appended by every snippet since embedding shipped and
   * read by nothing, so a framed form rendered with the same page chrome as a
   * standalone one. `parentOrigin` is the page that framed us, and it is only
   * ever used as a postMessage target after being checked against the form's
   * allowlist.
   */
  const embedded = query.embed === "1";
  const parentOrigin = typeof query.parentOrigin === "string" ? query.parentOrigin : null;

  return (
    <div className={embedded ? "cf-embedded" : undefined}>
      {/* A view is a view whether it is framed or not. */}
      <ViewPing slug={slug} apiOrigin={PUBLIC_API_ORIGIN} />
      {embedded ? (
        <EmbedBridge
          parentOrigin={parentOrigin}
          allowedOrigins={config.embed?.allowedOrigins ?? []}
        />
      ) : null}
      <ChatClient config={config} hiddenFields={hiddenFields} />
    </div>
  );
}
