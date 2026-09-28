/**
 * Where a visit came from: a platform name ("Reddit", "Google") and the channel
 * it belongs to ("Social", "Search", …).
 *
 * Tagged links win over the referrer. In-app browsers (Instagram, LinkedIn,
 * WhatsApp) usually send no referrer at all, so a campaign link's `utm_source`
 * is the only thing that survives the tap. An ad click id (`gclid`, `fbclid`, …)
 * wins over both, because it is the ad network saying so.
 *
 * Ported from shipwithmuse's `lib/traffic-source.ts`, where it has classified
 * real traffic for months. AI assistants are matched before Google so that
 * gemini.google.com is not counted as a search.
 */

export const TRAFFIC_CHANNELS = ["Direct", "Search", "Social", "Community", "AI", "Email", "Paid", "Referral"] as const;
export type TrafficChannel = (typeof TRAFFIC_CHANNELS)[number];

export interface TrafficSource {
  source: string;
  channel: TrafficChannel;
  host: string | null;
}

/** The ad networks whose click ids the web tracker reports, keyed by what it sends. */
export const AD_NETWORKS: Record<string, string> = {
  google: "Google Ads",
  meta: "Meta Ads",
  microsoft: "Microsoft Ads",
  tiktok: "TikTok Ads",
  linkedin: "LinkedIn Ads",
  x: "X Ads",
};

// [platform, channel, host suffixes, utm_source aliases]
const PLATFORMS: [string, TrafficChannel, string[], string[]][] = [
  ["ChatGPT", "AI", ["chatgpt.com", "chat.openai.com", "openai.com", "com.openai.chatgpt"], ["chatgpt", "openai", "chatgpt.com"]],
  ["Perplexity", "AI", ["perplexity.ai", "ai.perplexity.app"], ["perplexity"]],
  ["Claude", "AI", ["claude.ai", "com.anthropic.claude"], ["claude", "anthropic"]],
  ["Gemini", "AI", ["gemini.google.com", "bard.google.com"], ["gemini", "bard"]],
  ["Copilot", "AI", ["copilot.microsoft.com", "copilot.cloud.microsoft"], ["copilot"]],
  ["Grok", "AI", ["grok.com", "x.ai"], ["grok"]],
  ["DeepSeek", "AI", ["chat.deepseek.com", "deepseek.com"], ["deepseek"]],
  ["Meta AI", "AI", ["meta.ai"], ["metaai"]],
  ["Phind", "AI", ["phind.com"], ["phind"]],
  ["You.com", "AI", ["you.com"], []],

  ["Reddit", "Social", ["reddit.com", "redd.it", "reddit.app.link", "com.reddit.frontpage"], ["reddit", "rd"]],
  ["LinkedIn", "Social", ["linkedin.com", "lnkd.in", "com.linkedin.android"], ["linkedin", "li", "lnkd"]],
  ["X (Twitter)", "Social", ["x.com", "twitter.com", "t.co", "com.twitter.android"], ["x", "twitter", "tw"]],
  ["Facebook", "Social", ["facebook.com", "fb.com", "fb.me", "com.facebook.katana", "com.facebook.orca", "messenger.com"], ["facebook", "fb"]],
  ["Instagram", "Social", ["instagram.com", "com.instagram.android"], ["instagram", "ig"]],
  ["Threads", "Social", ["threads.net", "threads.com", "com.instagram.barcelona"], ["threads"]],
  ["Bluesky", "Social", ["bsky.app", "bsky.social"], ["bluesky", "bsky"]],
  ["YouTube", "Social", ["youtube.com", "youtu.be", "com.google.android.youtube"], ["youtube", "yt"]],
  ["TikTok", "Social", ["tiktok.com", "com.zhiliaoapp.musically"], ["tiktok", "tt"]],
  ["Pinterest", "Social", ["pinterest.com", "pin.it"], ["pinterest"]],
  ["Snapchat", "Social", ["snapchat.com"], ["snapchat", "snap"]],
  ["Quora", "Social", ["quora.com"], ["quora"]],
  ["Mastodon", "Social", ["mastodon.social", "mastodon.online", "fosstodon.org", "hachyderm.io"], ["mastodon"]],

  ["Hacker News", "Community", ["news.ycombinator.com", "hn.algolia.com", "hckrnews.com"], ["hn", "hackernews", "hacker_news", "ycombinator"]],
  ["Product Hunt", "Community", ["producthunt.com"], ["producthunt", "product_hunt", "ph"]],
  ["GitHub", "Community", ["github.com", "github.io"], ["github", "gh"]],
  ["Discord", "Community", ["discord.com", "discordapp.com", "discord.gg"], ["discord"]],
  ["Telegram", "Community", ["t.me", "telegram.org", "telegram.me", "org.telegram.messenger"], ["telegram", "tg"]],
  ["WhatsApp", "Community", ["whatsapp.com", "wa.me", "com.whatsapp"], ["whatsapp", "wa"]],
  ["Slack", "Community", ["slack.com", "com.slack"], ["slack"]],
  ["Indie Hackers", "Community", ["indiehackers.com"], ["indiehackers", "ih"]],
  ["DEV", "Community", ["dev.to"], ["devto", "dev.to"]],
  ["Medium", "Community", ["medium.com"], ["medium"]],
  ["Substack", "Community", ["substack.com"], ["substack"]],

  ["Gmail", "Email", ["mail.google.com", "com.google.android.gm"], ["gmail"]],
  ["Outlook", "Email", ["outlook.live.com", "outlook.office.com", "outlook.office365.com"], ["outlook"]],

  ["Google", "Search", ["google.com", "google", "com.google.android.googlequicksearchbox"], ["google"]],
  ["Bing", "Search", ["bing.com"], ["bing"]],
  ["DuckDuckGo", "Search", ["duckduckgo.com"], ["duckduckgo", "ddg"]],
  ["Brave Search", "Search", ["search.brave.com"], ["brave"]],
  ["Yahoo", "Search", ["search.yahoo.com", "yahoo.com"], ["yahoo"]],
  ["Yandex", "Search", ["yandex.ru", "yandex.com", "ya.ru"], ["yandex"]],
  ["Baidu", "Search", ["baidu.com"], ["baidu"]],
  ["Ecosia", "Search", ["ecosia.org"], ["ecosia"]],
  ["Kagi", "Search", ["kagi.com"], ["kagi"]],
];

// "google.co.in", "google.de" match the bare "google" pattern.
const GOOGLE_CC = /(^|\.)google\.[a-z.]{2,6}$/;

function byHost(host: string) {
  for (const p of PLATFORMS) {
    for (const h of p[2]) {
      if (host === h || host.endsWith(`.${h}`)) return p;
      if (h === "google" && GOOGLE_CC.test(host)) return p;
    }
  }
  return null;
}

/** The referrer's host, without the prefixes that only split one site into several. */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    // android-app://com.linkedin.android/ parses with the package name as the hostname.
    return new URL(url).hostname.toLowerCase().replace(/^(www|m|mobile|old|new|l|lm|out|np|amp)\./, "") || null;
  } catch {
    return null;
  }
}

const EMAIL_MEDIUM = /^(e-?mail|newsletter)$/i;
const PAID_MEDIUM = /^(cpc|ppc|paid|paidsocial|paid_social|paid-social|display|ads?|cpm|cpv|sponsored)$/i;

export function classifySource(
  referrer?: string | null,
  tag?: { source?: string | null; medium?: string | null; ad?: string | null },
): TrafficSource {
  const host = hostOf(referrer);

  const ad = tag?.ad ? AD_NETWORKS[tag.ad] : undefined;
  if (ad) return { source: ad, channel: "Paid", host };

  const raw = tag?.source?.trim().toLowerCase().slice(0, 60);
  if (raw) {
    const p = PLATFORMS.find((x) => x[3].includes(raw)) ?? byHost(hostOf(`https://${raw}`) ?? raw);
    const medium = tag?.medium ?? "";
    const channel: TrafficChannel = PAID_MEDIUM.test(medium)
      ? "Paid"
      : EMAIL_MEDIUM.test(medium) || EMAIL_MEDIUM.test(raw)
        ? "Email"
        : (p?.[1] ?? "Referral");
    return { source: p?.[0] ?? raw.replace(/^./, (c) => c.toUpperCase()), channel, host };
  }
  if (!host) return { source: "Direct", channel: "Direct", host: null };
  const p = byHost(host);
  return p ? { source: p[0], channel: p[1], host } : { source: host, channel: "Referral", host };
}
