"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Copy this page as markdown.
 *
 * Developers paste documentation into their own assistants, and making that one
 * click instead of a selection drag through rendered HTML costs almost nothing.
 * The source is fetched rather than inlined so the page's own payload does not
 * carry a second copy of itself.
 */
export function CopyMarkdown({ slug }: { slug: string[] }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      const res = await fetch(`/docs/${slug.join("/")}.md`);
      if (!res.ok) return;
      await navigator.clipboard.writeText(await res.text());
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access throws on insecure origins; a silent no-op beats an
      // error toast for something this incidental.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="text-muted-foreground hover:text-foreground text-caption mt-1 flex shrink-0 items-center gap-1.5 transition-colors"
      aria-label="Copy this page as markdown"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : "Copy as markdown"}
    </button>
  );
}
