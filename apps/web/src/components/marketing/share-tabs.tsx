"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Mail } from "lucide-react";
import { ChatBubble } from "@/components/chat/chat-bubble";
import { LogoMark } from "@/components/brand/logo";
import { qrSvg } from "@/lib/qr";
import { Band } from "./band";
import { SectionTitle, TextLink } from "./kit";
import { cn } from "@/lib/utils";

/**
 * Every way a form goes out, as tabs. Each tab says it in a sentence and shows
 * it in a picture. "Popup" opens this site's own contact form, which is a real
 * popup embed, rather than a picture of one.
 *
 * A custom domain is not here: it is priced but not built yet.
 */

const DEMO_SLUG = process.env.NEXT_PUBLIC_DEMO_FORM_SLUG ?? "how-you-use-forms";
const LINK = `https://chatform.in/f/${DEMO_SLUG}`;

const TABS = [
  { id: "link", label: "Share a link", title: "Your form, one link away.", body: "Every form gets its own page the moment you publish. Send it in a message, a bio or an email." },
  { id: "embed", label: "Website embed", title: "Right inside your page.", body: "Paste one line and the conversation sits in your page, growing as it goes. Works with any site builder." },
  { id: "popup", label: "Popup", title: "A button in the corner.", body: "A launcher that opens the form over your page, on a click, on load, on scroll or when someone is about to leave." },
  { id: "email", label: "Email", title: "A button in your newsletter.", body: "Email clients block forms, so you get a ready-made button that opens the conversation in one tap." },
  { id: "qr", label: "QR code", title: "Print it. Scan it.", body: "A QR code for posters, tables and receipts, ready to download as soon as the form is live." },
  { id: "api", label: "API", title: "Or build your own.", body: "Run the whole conversation inside your app with the REST API and the JavaScript and React SDKs." },
] as const;

type TabId = (typeof TABS)[number]["id"];

function MiniForm() {
  return (
    <div className="chat-surface space-y-2 rounded-xl border p-4 text-left">
      <div className="flex">
        <ChatBubble from="bot">Hey! What brings you here today?</ChatBubble>
      </div>
      <div className="flex justify-end">
        <ChatBubble from="user">Planning a team offsite</ChatBubble>
      </div>
      <div className="flex">
        <ChatBubble from="bot">Nice. How many people?</ChatBubble>
      </div>
    </div>
  );
}

function Visual({ tab }: { tab: TabId }) {
  const [copied, setCopied] = useState(false);
  const qr = useMemo(() => (tab === "qr" ? qrSvg(LINK, 5) : ""), [tab]);

  switch (tab) {
    case "link":
      return (
        <div className="bg-primary-soft grid h-full place-items-center rounded-[18px] p-8">
          <div className="w-full max-w-md">
            <p className="font-hand text-primary-soft-foreground text-center text-2xl">Copy, paste, done.</p>
            <div className="bg-card mt-5 flex items-center gap-2 rounded-xl border p-2 pl-4 shadow-sm">
              <code className="min-w-0 flex-1 truncate text-sm">{LINK}</code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(LINK).then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1600);
                  });
                }}
                className="bg-foreground text-background inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold"
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
        </div>
      );
    case "embed":
      return (
        <div className="bg-card overflow-hidden rounded-[18px] border">
          <div className="border-border flex items-center gap-1.5 border-b px-4 py-2.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="border-border size-2.5 rounded-full border" />
            ))}
            <span className="text-muted-foreground ml-3 text-xs">yourstudio.com/contact</span>
          </div>
          <div className="grid gap-6 p-6 sm:grid-cols-[1fr_1.3fr]">
            <div className="space-y-2.5">
              <div className="bg-foreground/80 h-4 w-3/4 rounded" />
              <div className="bg-muted h-2.5 w-full rounded" />
              <div className="bg-muted h-2.5 w-5/6 rounded" />
              <div className="bg-muted h-2.5 w-2/3 rounded" />
            </div>
            <MiniForm />
          </div>
        </div>
      );
    case "popup":
      return (
        <div className="bg-brand-violet-soft grid h-full place-items-center rounded-[18px] p-8 text-center">
          <div>
            <LogoMark className="mx-auto size-12" />
            <p className="font-hand text-brand-violet-soft-foreground mt-4 text-3xl">Go on, open it.</p>
            <button
              type="button"
              data-chatform-open
              className="bg-foreground text-background mt-5 inline-flex h-11 items-center rounded-full px-6 text-sm font-semibold shadow-[0_3px_0_oklch(0.25_0.02_65/0.16)]"
            >
              Try the popup
            </button>
            <p className="text-muted-foreground mt-3 text-xs">It opens our own contact form.</p>
          </div>
        </div>
      );
    case "email":
      return (
        <div className="bg-card overflow-hidden rounded-[18px] border">
          <div className="border-border space-y-1 border-b px-5 py-3 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <Mail className="size-4" /> Quick question about your visit
            </p>
            <p className="text-muted-foreground text-xs">From: Northwind Studio</p>
          </div>
          <div className="space-y-5 p-6">
            <p className="text-[0.9375rem] leading-relaxed">
              Thanks for coming in last week. We would love to hear how it went. It takes about two minutes.
            </p>
            <span className="bg-primary text-on-primary inline-flex h-11 items-center rounded-full px-6 text-sm font-semibold">
              Answer a few questions →
            </span>
          </div>
        </div>
      );
    case "qr":
      return (
        <div className="bg-[var(--family-choice-soft)] grid h-full place-items-center rounded-[18px] p-8 text-center">
          <div>
            <div className="mx-auto w-40 rounded-xl bg-white p-3 shadow-sm [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="font-hand mt-4 text-3xl text-[var(--family-choice-ink)]">Go on, give it a scan.</p>
          </div>
        </div>
      );
    case "api":
      return (
        <div className="overflow-hidden rounded-[18px] bg-[#1b1a18] p-6 font-mono text-[0.8125rem] leading-relaxed text-[#ecebe6]">
          <p className="text-white/50">{"// Run the conversation from your own server"}</p>
          <p>
            <span className="text-[#f7a66f]">const</span> chatform = createClient({"{"} apiKey {"}"});
          </p>
          <p className="mt-3">
            <span className="text-[#f7a66f]">const</span> session = <span className="text-[#f7a66f]">await</span> chatform.sessions.create(formId);
          </p>
          <p>
            <span className="text-[#f7a66f]">const</span> turn = <span className="text-[#f7a66f]">await</span> chatform.sessions.send(session.id, <span className="text-[#65c7a1]">&quot;Hi, I need a quote&quot;</span>);
          </p>
        </div>
      );
  }
}

export function ShareTabs() {
  const [active, setActive] = useState<TabId>("link");
  const tab = TABS.find((t) => t.id === active)!;

  return (
    <Band id="share" hairline>
      <SectionTitle eyebrow="Share and embed your form" accent="Embed it on your site.">
        Share a link.
      </SectionTitle>

      <div role="tablist" aria-label="Ways to share" className="mt-10 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === active}
            aria-controls="share-panel"
            onClick={() => setActive(t.id)}
            className={cn(
              "h-10 rounded-full border px-4 text-sm font-semibold transition-colors duration-[var(--duration-micro)]",
              t.id === active
                ? "bg-primary-soft text-primary-soft-foreground border-[color-mix(in_oklch,var(--primary)_30%,transparent)]"
                : "border-border bg-card hover:border-foreground/30",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id="share-panel" role="tabpanel" aria-label={tab.label} className="mt-8 grid items-center gap-10 lg:grid-cols-[0.8fr_1.4fr]">
        <div>
          <h3 className="font-display text-2xl font-semibold tracking-tight">{tab.title}</h3>
          <p className="text-muted-foreground mt-3 max-w-sm leading-relaxed">{tab.body}</p>
          <div className="mt-6">
            <TextLink href={tab.id === "api" ? "/docs" : "/signin?mode=signup"}>
              {tab.id === "api" ? "Read the API docs" : "Publish your first form"}
            </TextLink>
          </div>
        </div>
        <div className="min-h-[18rem] [&>*]:min-h-[18rem]">
          <Visual tab={active} />
        </div>
      </div>
    </Band>
  );
}
