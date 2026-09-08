import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/seo";

/**
 * The app and the hosted forms stay out of the index: `/f/*` pages honour
 * their own `noIndex` meta per form, and nothing behind the session guard
 * should be crawled at all.
 *
 * ⚠️ This file is not the whole story in production. The Cloudflare zone serves
 * a *managed* robots.txt block above whatever Next emits, and at the time of
 * writing that block carries `Disallow: /` for GPTBot, ClaudeBot,
 * Google-Extended, CCBot, Bytespider, Applebot-Extended, meta-externalagent and
 * Amazonbot, plus `Content-Signal: ai-train=no, use=reference`. So the
 * allowances declared below are currently contradicted by a setting that lives
 * in the Cloudflare dashboard (AI Crawl Control / managed robots.txt), not in
 * this repository.
 *
 * They are declared here anyway, because the intent belongs in version control
 * and because the day that switch is flipped this file should already say the
 * right thing. Shipping an llms.txt and a markdown mirror while the crawlers
 * that would read them are blocked at the edge is self-cancelling, and that is
 * the state today.
 */

/**
 * The crawlers that read pages on behalf of an assistant.
 *
 * Deliberately the retrieval and search agents rather than every bot with "AI"
 * in the name: these are the ones that fetch a page because a person asked a
 * question, which is the traffic an llms.txt and a `.md` mirror exist to serve.
 */
const ASSISTANT_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "PerplexityBot",
  "Google-Extended",
];

const PRIVATE_PATHS = [
  "/dashboard",
  "/forms/",
  "/preview/",
  "/api/",
  "/settings",
  "/usage",
  // Still listed: they resolve as redirects into /settings, and a
  // crawler that already knows them should not follow one to find out.
  "/team",
  "/api-keys",
  "/account",
  "/organization",
  "/billing",
  /**
   * The markdown mirror's internal address. `/docs/<path>.md` is the public URL
   * and stays crawlable; `/docs-md/<path>` is where the rewrite lands, and
   * indexing both would be the same document at two addresses.
   */
  "/docs-md",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
      ...ASSISTANT_AGENTS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: PRIVATE_PATHS,
      })),
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
