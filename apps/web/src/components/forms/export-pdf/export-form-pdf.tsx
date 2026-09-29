"use client";

import { safeReadFormDoc, type FormDoc } from "@repo/form-schema";
import { toast } from "sonner";
import {
  getApiFormsById,
  getApiFormsByIdIntegrations,
  getApiFormsByIdKnowledge,
  getApiPaymentAccounts,
  getApiWebhooks,
} from "@/lib/api/dashboard/dashboard";
import type { OutlineExtras } from "./form-outline";
import { apiData } from "@/lib/api/payload";
import { SITE_ORIGIN } from "@/lib/seo";

/**
 * "Export as PDF", from the builder or a form card.
 *
 * Built entirely in the browser and loaded on the click: the PDF renderer is a
 * large chunk and nobody should download it to look at their dashboard. The
 * builder passes the document it is holding, so unsaved edits are included;
 * the card passes only the id and the saved draft is fetched.
 */
export async function exportFormPdf(source: { formId: string; doc?: FormDoc }) {
  const job = build(source);
  toast.promise(job, {
    loading: "Preparing your PDF…",
    success: "PDF downloaded",
    error: (e) => ({ message: "Couldn't export the PDF", description: e instanceof Error ? e.message : undefined }),
  });
  await job.catch(() => undefined);
}

async function build({ formId, doc: given }: { formId: string; doc?: FormDoc }) {
  const row = apiData<{ workingSchema: unknown; slug: string | null; status: string }>(await getApiFormsById(formId));
  const doc = given ?? safeReadFormDoc(row.workingSchema);
  if (!doc) throw new Error("This form's document could not be read.");
  const live = row.status === "published" && row.slug ? row.slug : null;
  const blob = await renderFormPdf(doc, { formId, liveSlug: live, extras: await extrasFor(formId) });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName(doc.title)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked later, not now: Safari starts the download after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** The PDF itself. `liveSlug` is set only for a published form, whose link is printed. */
export async function renderFormPdf(
  doc: FormDoc,
  { formId, liveSlug, extras = {} }: { formId: string; liveSlug: string | null; extras?: OutlineExtras },
): Promise<Blob> {
  const [{ pdf }, { FormPdf, registerPdfFonts }, { snapshotFlow }, { outlineForm }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./form-pdf"),
    import("./flow-snapshot"),
    import("./form-outline"),
  ]);
  const site = SITE_ORIGIN.replace(/^https?:\/\//, "");
  const { pages, icons } = await snapshotFlow(doc, { title: doc.title, footer: `Made with ChatForm · ${site}` });

  registerPdfFonts(window.location.origin);
  return pdf(
    <FormPdf
      outline={outlineForm(doc, extras)}
      icons={icons}
      flowPages={pages}
      liveUrl={liveSlug ? `${SITE_ORIGIN}/f/${liveSlug}` : null}
      builderUrl={`${SITE_ORIGIN}/forms/${formId}/build`}
      status={liveSlug ? "live" : "draft"}
      exportedAt={new Date()}
      siteOrigin={SITE_ORIGIN}
    />,
  ).toBlob();
}

/**
 * The overview's wiring: integrations, webhooks, knowledge, payment accounts.
 *
 * In parallel, and each one allowed to fail on its own: a viewer who cannot
 * list webhooks still gets a PDF, just without that line.
 */
async function extrasFor(formId: string): Promise<OutlineExtras> {
  const quietly = <T,>(p: Promise<unknown>) => p.then((r) => apiData<T>(r)).catch(() => undefined);
  const [integrations, webhooks, knowledge, payments] = await Promise.all([
    quietly<OutlineExtras["integrations"]>(getApiFormsByIdIntegrations(formId)),
    quietly<OutlineExtras["webhooks"]>(getApiWebhooks()),
    quietly<OutlineExtras["knowledge"]>(getApiFormsByIdKnowledge(formId)),
    quietly<{ accounts?: OutlineExtras["paymentAccounts"] }>(getApiPaymentAccounts()),
  ]);
  return {
    integrations: Array.isArray(integrations) ? integrations : undefined,
    // Account-wide hooks (no form) fire for this form too.
    webhooks: Array.isArray(webhooks) ? webhooks.filter((w) => w.formId === formId || w.formId === null) : undefined,
    knowledge: knowledge && Array.isArray(knowledge.sources) ? knowledge : undefined,
    paymentAccounts: payments?.accounts,
  };
}

function fileName(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 60);
  return base || "form";
}
