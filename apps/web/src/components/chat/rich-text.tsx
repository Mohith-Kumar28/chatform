"use client";

import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { embedFromUrl, type Embed } from "@repo/form-schema";
import { API_ORIGIN } from "@/lib/api/mutator";
import { cn } from "@/lib/utils";

/**
 * What an author's description may contain: the editor's six buttons and the
 * list items they produce. Nothing else survives, whatever is typed by hand.
 */
const AUTHOR_ELEMENTS = ["p", "br", "strong", "em", "a", "ul", "li", "img"];

const ASSET_PREFIX = `${API_ORIGIN}/p/assets/`;

/** The href a recall chip is smuggled through Markdown as; see `withRecallChips`. */
const RECALL_HREF = "#recall";

/**
 * `{{ref}}` as a chip naming the question, for the builder's preview.
 *
 * A respondent never sees the braces — the server swaps in their answer before
 * the description leaves it — but the preview has no answers, and printing
 * `{{q_platform}}` there showed the author the storage format instead of what
 * they wrote in the editor. So it reads the same as the editor's chip.
 */
function withRecallChips(markdown: string, recall: Map<string, string>): string {
  return markdown.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, ref: string) => {
    const label = (recall.get(ref) ?? ref).replace(/[[\]]/g, "");
    return `[@${label}](${RECALL_HREF})`;
  });
}

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: { href?: unknown };
  children?: HastNode[];
};

/**
 * The link a paragraph consists of, when it consists of nothing else.
 *
 * GFM turns a bare URL into an anchor whose text is the URL, so both shapes —
 * the text itself, or an anchor spelling out its own href — count. A link with
 * words of its own (`[watch this](…)`) is a link someone chose to write, and
 * stays one.
 */
function soleUrl(node: HastNode | undefined): string | null {
  const kids = (node?.children ?? []).filter((k) => !(k.type === "text" && !k.value?.trim()));
  if (kids.length !== 1) return null;
  const only = kids[0]!;
  if (only.type === "text") return only.value?.trim() ?? null;
  if (only.type === "element" && only.tagName === "a") {
    const href = typeof only.properties?.href === "string" ? only.properties.href : "";
    const text = (only.children ?? []).map((c) => c.value ?? "").join("").trim();
    return href && text === href ? href : null;
  }
  return null;
}

function EmbedView({ embed }: { embed: Embed }) {
  if (embed.kind === "youtube") {
    return (
      <div className="my-1 aspect-video w-full overflow-hidden rounded-2xl bg-black/5">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${embed.id}`}
          title="YouTube video"
          loading="lazy"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="size-full border-0"
        />
      </div>
    );
  }
  if (embed.kind === "video") {
    return (
      <video
        src={embed.url.replace(/#video$/, "")}
        controls
        playsInline
        preload="metadata"
        className="my-1 max-h-72 w-full rounded-2xl"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={embed.url} alt="" loading="lazy" className="my-1 max-h-72 w-auto rounded-2xl object-contain" />
  );
}

/**
 * The description dialect (`@repo/form-schema` rich-text), rendered.
 *
 * `trusted` is the author's own text. Untrusted text — anything a model wrote —
 * gets the same YouTube player, but images and video only from our own asset
 * store, so a reply cannot pull a picture off an arbitrary host.
 */
export function RichText({
  markdown,
  trusted = true,
  allowedElements = AUTHOR_ELEMENTS,
  recall,
  className,
}: {
  markdown: string;
  trusted?: boolean;
  allowedElements?: readonly string[];
  /** Question titles by ref: draws `{{ref}}` as an "@title" chip (preview only). */
  recall?: Map<string, string>;
  className?: string;
}) {
  const allowed = (embed: Embed) =>
    embed.kind === "youtube" || trusted || embed.url.startsWith(ASSET_PREFIX);

  const components: Components = {
    p: ({ node, children }) => {
      const url = soleUrl(node as HastNode | undefined);
      const embed = url ? embedFromUrl(url) : null;
      if (embed && allowed(embed)) return <EmbedView embed={embed} />;
      return <p>{children}</p>;
    },
    a: ({ href, children }) =>
      href === RECALL_HREF ? (
        <span
          className="rounded px-1 py-0.5 font-medium"
          style={{
            background: "color-mix(in srgb, var(--cf-accent, currentColor) 15%, transparent)",
            color: "var(--cf-accent, currentColor)",
          }}
        >
          {children}
        </span>
      ) : (
        <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
          {children}
        </a>
      ),
    img: ({ src, alt }) => {
      const url = typeof src === "string" ? src : "";
      if (!url || !(trusted || url.startsWith(ASSET_PREFIX))) return <>{alt}</>;
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt ?? ""} loading="lazy" className="my-1 block max-h-72 w-auto rounded-2xl object-contain" />
      );
    },
  };

  return (
    <div className={cn("chat-prose", className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        allowedElements={[...allowedElements]}
        unwrapDisallowed
        components={components}
      >
        {recall ? withRecallChips(markdown, recall) : markdown}
      </Markdown>
    </div>
  );
}

/** A question's description, under the question it belongs to. */
export function QuestionDescription({
  markdown,
  recall,
  className,
}: {
  markdown: string;
  recall?: Map<string, string>;
  className?: string;
}) {
  return <RichText markdown={markdown} recall={recall} className={cn("space-y-2 text-sm", className)} />;
}
