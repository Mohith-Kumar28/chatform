"use client";

import { ApiError } from "@/lib/api/mutator";
import { postApiImportClaim, postApiImportForms, postApiImportPreview } from "@/lib/api/dashboard/dashboard";
import { apiData } from "@/lib/api/payload";
import { getRespondentSignal } from "@/lib/respondent-signal";

/**
 * Everything the import screens share: which builders we read, the calls,
 * and the report handed from the import to the builder.
 *
 * The conversion itself is server-side (`apps/api/src/lib/import/`) and makes
 * no model call, so these are plain requests, not a stream.
 */

export type ImportSource = "typeform" | "google_forms" | "tally" | "jotform" | "youform";

export const IMPORT_SOURCES: {
  id: ImportSource;
  name: string;
  /** The URL segment of its landing page, `/import/<slug>`. */
  slug: string;
  placeholder: string;
  /** Where the respondent link lives, for the hint beside the field. */
  where: string;
}[] = [
  {
    id: "typeform",
    name: "Typeform",
    slug: "typeform",
    placeholder: "https://form.typeform.com/to/…",
    where: "In Typeform, open the form, choose Share, and copy the link.",
  },
  {
    id: "google_forms",
    name: "Google Forms",
    slug: "google-forms",
    placeholder: "https://forms.gle/…",
    where: "In Google Forms, press Send, choose the link tab, and copy it. The editor link won't work.",
  },
  {
    id: "tally",
    name: "Tally",
    slug: "tally",
    placeholder: "https://tally.so/r/…",
    where: "In Tally, open the form, choose Share, and copy the link.",
  },
  {
    id: "jotform",
    name: "Jotform",
    slug: "jotform",
    placeholder: "https://form.jotform.com/…",
    where: "In Jotform, open the form, choose Publish, and copy the form link.",
  },
  {
    id: "youform",
    name: "Youform",
    slug: "youform",
    placeholder: "https://app.youform.com/forms/…",
    where: "In Youform, open the form, choose Share, and copy the link.",
  },
];

export const SOURCE_NAME: Record<ImportSource, string> = {
  typeform: "Typeform",
  google_forms: "Google Forms",
  tally: "Tally",
  jotform: "Jotform",
  youform: "Youform",
};

export interface ImportReport {
  provider: ImportSource;
  sourceUrl: string;
  questions: number;
  branches: number;
  endings: number;
  notCopied: string[];
  closed: boolean;
  outline: { title: string; type: string; required: boolean }[];
}

export interface ImportTrial {
  token: string;
  slug: string;
  report: ImportReport;
  /** Free conversions left today, or null when signed in. */
  remaining: number | null;
}

/** A link the importer can read, for suggesting it when someone pastes one into the AI box. */
export function detectImportSource(text: string): ImportSource | null {
  const t = text.trim();
  if (/\s/.test(t) || t.length > 2000) return null;
  if (/(^|\/\/)([a-z0-9-]+\.)?typeform\.com\/(to|form)\//i.test(t)) return "typeform";
  if (/(^|\/\/)(forms\.gle\/|docs\.google\.com\/forms\/)/i.test(t)) return "google_forms";
  if (/(^|\/\/)tally\.so\/(r|embed)\//i.test(t)) return "tally";
  if (/(^|\/\/)([a-z0-9-]+\.)?youform\.com\/forms\//i.test(t)) return "youform";
  if (/(^|\/\/)([a-z0-9-]+\.)?(jotform\.com|jotformeu\.com|jotform\.me)\/(build\/|form\/|jsform\/)?\d{10,}/i.test(t)) return "jotform";
  return null;
}

/** What went wrong, as the sentence the API chose. Limit hits are told apart so the screen can offer sign-up. */
export function importErrorOf(err: unknown): { message: string; limit: boolean } {
  if (err instanceof ApiError) return { message: err.message, limit: err.status === 429 };
  return { message: "We couldn't reach chatform. Check your connection and try again.", limit: false };
}

export async function previewImport(url: string): Promise<ImportTrial> {
  // Null is fine: the server then counts this browser by its address.
  const deviceSignal = (await getRespondentSignal().catch(() => null)) ?? undefined;
  return apiData<ImportTrial>(await postApiImportPreview({ url, deviceSignal }));
}

export async function claimImport(token: string, workspaceId?: string): Promise<{ formId: string; report: ImportReport }> {
  return apiData<{ formId: string; report: ImportReport }>(await postApiImportClaim({ token, workspaceId }));
}

export async function importIntoWorkspace(url: string, workspaceId?: string): Promise<{ formId: string; report: ImportReport }> {
  return apiData<{ formId: string; report: ImportReport }>(await postApiImportForms({ url, workspaceId }));
}

/**
 * The report rides to the builder in session storage, keyed by form, and is
 * shown once there. Not stored on the form: it describes the import, not the
 * form, and it has nothing to say after the author has seen it.
 */
const reportKey = (formId: string) => `chatform:import-report:${formId}`;

export function handOffReport(formId: string, report: ImportReport) {
  try {
    sessionStorage.setItem(reportKey(formId), JSON.stringify(report));
  } catch {
    // Private mode: the builder simply shows no notice.
  }
}

export function takeReport(formId: string): ImportReport | null {
  try {
    const raw = sessionStorage.getItem(reportKey(formId));
    if (!raw) return null;
    sessionStorage.removeItem(reportKey(formId));
    return JSON.parse(raw) as ImportReport;
  } catch {
    return null;
  }
}

/** "14 questions, 3 branches", the line under every import. */
export function reportSummary(r: ImportReport): string {
  const parts = [`${r.questions} ${r.questions === 1 ? "question" : "questions"}`];
  if (r.branches > 0) parts.push(`${r.branches} ${r.branches === 1 ? "branch" : "branches"}`);
  if (r.endings > 1) parts.push(`${r.endings} endings`);
  return parts.join(", ");
}
