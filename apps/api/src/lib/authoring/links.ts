import type { Bindings } from "../../env.js";
import { researchBrief, MODELS, NO_USAGE, type AiTrace, type TokenUsage } from "../ai.js";
import { mergeSourceForms, type SourceForm } from "../form-import.js";
import { extractUrls, readSites, type SiteReading } from "../research.js";
import type { Ledger } from "./ledger.js";
import { wordQuestions } from "./wording.js";

/**
 * The links in an author's request, read before the model writes anything.
 *
 * One step for every way an author asks the AI for something (the New form
 * box, the builder's chat, `/v1`, MCP), so a link means the same thing
 * wherever it is pasted:
 * - a form on the page (a Google Form, a Typeform, a contact page) is read
 *   out by code, exactly (`formInPage`, shared with the importer), and its
 *   questions are worded for a chat by one small call (`wordQuestions`, the
 *   importer's too), so the drafting model only has to place them;
 * - any other page is read and summarised against the request, with a web
 *   search around it (`researchBrief`), which is the product context the
 *   questions are written from;
 * - those other pages are what belongs in the form's knowledge base.
 *
 * What to do with any of it is the request's to say, so this only reads.
 * Never throws: a page that will not load costs the author its context,
 * never the action.
 */
export interface LinkReading {
  urls: string[];
  sites: SiteReading[];
  /** Several linked forms merged into one, each field tagged with its form. */
  sourceForm: SourceForm | null;
  brief: { brief: string; sources: string[] } | null;
  /** Pages that are about the product rather than a form to copy: what the knowledge base keeps. */
  knowledgeUrls: string[];
}

/** Progress, for a stream that narrates each step. */
export type LinkProgress =
  | { step: "reading"; status: "start"; label: string }
  | { step: "reading"; status: "done" | "skip" }
  | { step: "pages"; pages: { url: string; title: string | null }[] }
  | { step: "researching"; status: "start" | "done" | "skip" }
  | { step: "searched"; sources: string[] };

const NONE: LinkReading = { urls: [], sites: [], sourceForm: null, brief: null, knowledgeUrls: [] };

export async function readLinks(opts: {
  env: Bindings;
  prompt: string;
  organizationId?: string | null;
  formId?: string | null;
  trace?: AiTrace;
  /** The research call is recorded here, on its own tier. */
  ledger: Ledger;
  onProgress?: (p: LinkProgress) => void | Promise<void>;
}): Promise<LinkReading> {
  const progress = async (p: LinkProgress) => {
    try {
      await opts.onProgress?.(p);
    } catch {
      // A narrator that fails must not fail the reading.
    }
  };
  const urls = extractUrls(opts.prompt);
  if (urls.length === 0) {
    await progress({ step: "reading", status: "skip" });
    await progress({ step: "researching", status: "skip" });
    return NONE;
  }

  await progress({ step: "reading", status: "start", label: urls.length === 1 ? hostOf(urls[0]!) : `${urls.length} pages` });
  const sites = await readSites(urls).catch(() => [] as SiteReading[]);
  await progress({ step: "reading", status: sites.length > 0 ? "done" : "skip" });
  if (sites.length > 0) await progress({ step: "pages", pages: sites.map((s) => ({ url: s.url, title: s.title })) });

  // A linked form is copied, not researched; the other pages are context.
  const merged = mergeSourceForms(sites.flatMap((s) => (s.form ? [s.form] : [])));
  const sourceForm = merged ? await worded(merged, opts) : null;
  const context = sites.filter((s) => !s.form);
  const formUrls = new Set(sites.filter((s) => s.form).map((s) => s.url));
  const knowledgeUrls = urls.filter((u) => !formUrls.has(u));

  if (context.length === 0) {
    // Only forms, or nothing that could be read (client-rendered, bot-walled,
    // down): say so rather than implying the questions know about it.
    await progress({ step: "researching", status: "skip" });
    return { urls, sites, sourceForm, brief: null, knowledgeUrls };
  }

  await progress({ step: "researching", status: "start" });
  let brief: LinkReading["brief"] = null;
  let usage: TokenUsage = NO_USAGE;
  try {
    const found = await researchBrief({
      env: opts.env,
      request: opts.prompt,
      sites: context,
      organizationId: opts.organizationId,
      formId: opts.formId,
      trace: opts.trace,
    });
    if (found) {
      brief = { brief: found.brief, sources: found.sources };
      usage = found.usage;
      if (found.sources.length > 0) await progress({ step: "searched", sources: found.sources });
    }
  } catch (err) {
    console.error("read_links_research_failed", { message: err instanceof Error ? err.message : String(err) });
  }
  if (usage.input + usage.output > 0) opts.ledger.add("research", MODELS.research, usage);
  await progress({ step: "researching", status: brief ? "done" : "skip" });
  return { urls, sites, sourceForm, brief, knowledgeUrls };
}

/** The form with its questions worded for a chat; its own words stand if that fails. */
async function worded(
  form: SourceForm,
  opts: { env: Bindings; organizationId?: string | null; ledger: Ledger },
): Promise<SourceForm> {
  const asked = form.fields.filter((f) => f.type !== "statement" && f.title.trim());
  const words = await wordQuestions(opts.env, asked, { formTitle: form.title, organizationId: opts.organizationId, ledger: opts.ledger, kind: "question_wording" });
  if (!words) return form;
  const byField = new Map(asked.map((f, i) => [f, words[i]!]));
  return { ...form, fields: form.fields.map((f) => (byField.has(f) ? { ...f, title: byField.get(f)!, label: f.title } : f)) };
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
