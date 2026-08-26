import type { Metadata } from "next";
import type { PublicFormConfig } from "@repo/form-schema";
import { ChatClient } from "@/components/chat/chat-client";
import { ViewPing } from "@/components/chat/view-ping";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:8787";

async function getConfig(slug: string): Promise<PublicFormConfig | null> {
  try {
    const res = await fetch(`${API_ORIGIN}/p/forms/${slug}/config`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as PublicFormConfig;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug.replaceAll("-", " ") };
}

export default async function PublicFormPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ embed?: string }> }) {
  const { slug } = await params;
  const { embed } = await searchParams;
  const config = await getConfig(slug);

  const fallback: PublicFormConfig = {
    slug,
    title: slug.replaceAll("-", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    blocks: [],
    endings: [],
    hiddenFieldNames: [],
    progressBar: "percent",
    allowBack: true,
    allowSkip: false,
    brandingHidden: false,
    agentMode: "hybrid",
    theme: {
      colorScheme: "light",
      background: "#faf7f2",
      surface: "#ffffff",
      text: "#1c1917",
      accent: "#f97316",
      accentText: "#ffffff",
      botBubble: "#ffffff",
      userBubble: "#f97316",
      userBubbleText: "#ffffff",
      radius: "lg",
      fontHeading: "Bricolage Grotesque",
      fontBody: "Inter",
      avatarKey: null,
      backgroundImageKey: null,
      backgroundBrightness: 1,
    },
    requireAuth: false,
    captchaEnabled: true,
  };

  return (
    <>
      <ViewPing slug={slug} apiOrigin={process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:8787"} />
      <ChatClient config={config ?? fallback} embed={embed === "1"} />
    </>
  );
}
