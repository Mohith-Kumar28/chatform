"use client";

import { usePathname } from "next/navigation";
import { ChatformEmbed } from "@/components/marketing/chatform-embed";

/**
 * The contact form as a corner button, on every marketing page.
 *
 * Not on `/contact`: that page is the same form inline, and embed.js keeps one
 * instance per form, so a second tag there would fight the first.
 */
export function ContactLauncher() {
  const pathname = usePathname();
  if (pathname === "/contact") return null;
  return <ChatformEmbed form="contact-us-673e52" />;
}
