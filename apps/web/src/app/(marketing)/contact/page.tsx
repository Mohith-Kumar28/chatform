import type { Metadata } from "next";
import { ChatformEmbed } from "@/components/marketing/chatform-embed";
import { canonical, openGraphBase } from "@/lib/seo";

const TITLE = "Contact us";
const DESCRIPTION = "Questions, feedback or a hand setting up a form. Ask here and we will get back to you.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...canonical("/contact"),
  openGraph: { ...openGraphBase("/contact"), title: TITLE, description: DESCRIPTION },
};

/**
 * The contact form is a chatform, inline, and it is the whole page: from under
 * the nav (62px tall) to the bottom of the screen. `dvh` so a phone's collapsing
 * address bar never hides the answer box.
 *
 * embed.js sizes its inline box with a px height on the element itself, so the
 * `!h-full` on its `.cf-inline` is what lets this box set the height instead.
 */
export default function ContactPage() {
  return (
    <div className="h-[calc(100dvh-62px)] px-4 pt-2 pb-4">
      <h1 className="sr-only">{TITLE}</h1>
      <div id="contact-form" className="mx-auto h-full max-w-3xl [&>.cf-inline]:!h-full" />
      <ChatformEmbed
        form="contact-us-673e52"
        attributes={{ mode: "inline", target: "#contact-form", height: "800" }}
      />
    </div>
  );
}
