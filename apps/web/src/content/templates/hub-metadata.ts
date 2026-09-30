import type { Metadata } from "next";
import { canonical, openGraphBase } from "@/lib/seo";
import type { HubCopy } from "./hub-types";

/** A hub page's metadata, from its authored copy. */
export function hubMetadata(path: string, copy: HubCopy): Metadata {
  return {
    title: { absolute: `${copy.title} · chatform` },
    description: copy.metaDescription,
    ...canonical(path),
    openGraph: { ...openGraphBase(path), title: copy.title, description: copy.metaDescription },
    twitter: { card: "summary_large_image" },
  };
}
