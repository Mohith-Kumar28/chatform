import { isSafeUrl } from "@repo/guard";
import { can, limitOf } from "@repo/entitlements";
import type { Bindings } from "../../env.js";
import { getEntitlements } from "../entitlements.js";
import { countSources, createSource, knowledgeBytes } from "../knowledge-service.js";
import { hostOf } from "./links.js";

/**
 * Pages an author linked while asking the AI for something, kept in the
 * form's knowledge base so the agent can answer respondents' questions about
 * them.
 *
 * The same for a new form and an edit. Links nobody explicitly uploaded must
 * never be what opens a paywall, so this adds only what the plan has room for
 * after `reserve` (sources the dashboard is about to add by hand), skips a
 * page the form already has, and does nothing on a plan without knowledge.
 * Never throws: it is a side effect of the action, not part of it.
 */
export async function addPagesToKnowledge(
  env: Bindings,
  opts: { organizationId: string | null | undefined; formId: string; urls: string[]; reserve?: number },
): Promise<number> {
  if (!opts.organizationId || opts.urls.length === 0) return 0;
  try {
    const ent = await getEntitlements(env, opts.organizationId);
    if (!can(ent, "agent_knowledge")) return 0;
    const maxBytes = limitOf(ent, "knowledge_bytes");
    if (maxBytes != null && (await knowledgeBytes(env, opts.formId)) >= maxBytes) return 0;
    const existing = await env.DB.prepare(`SELECT origin FROM knowledge_sources WHERE form_id = ? AND origin IS NOT NULL AND status != 'failed'`)
      .bind(opts.formId)
      .all<{ origin: string }>();
    const key = (u: string) => u.trim().replace(/\/+$/, "").toLowerCase();
    const have = new Set((existing.results ?? []).map((r) => key(r.origin)));
    const max = limitOf(ent, "knowledge_sources_count");
    const room = max == null ? Infinity : Math.max(0, max - (await countSources(env, opts.formId)) - (opts.reserve ?? 0));

    let added = 0;
    for (const url of opts.urls) {
      if (added >= room) break;
      if (have.has(key(url)) || !isSafeUrl(url, { allowInsecure: true })) continue;
      have.add(key(url));
      await createSource(env, { organizationId: opts.organizationId, formId: opts.formId, kind: "link", title: hostOf(url), origin: url });
      added++;
    }
    return added;
  } catch (err) {
    console.error("knowledge_links_failed", { formId: opts.formId, message: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}
