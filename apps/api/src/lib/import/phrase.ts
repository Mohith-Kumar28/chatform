import type { FormDoc } from "@repo/form-schema";
import type { Bindings } from "../../env.js";
import { Ledger } from "../authoring/ledger.js";
import { wordQuestions } from "../authoring/wording.js";
import { readImport } from "./read.js";
import { importedToDoc } from "./to-doc.js";
import type { ImportReport } from "./types.js";

/**
 * A link → our form, with every question worded for a chat.
 *
 * The one path the converter, the dashboard's Import and `/v1/import` share.
 * The form is read by code, exactly; the questions are worded by the same
 * step a link in the AI box or the builder chat gets (`wordQuestions`). The
 * chat does not reword later: the default hybrid mode asks each question as
 * written.
 */
export async function convertImport(
  env: Bindings,
  url: string,
  organizationId: string,
): Promise<{ doc: FormDoc; report: ImportReport }> {
  const started = Date.now();
  const form = await readImport(url);
  const ledger = new Ledger();
  const items = form.items.filter((it) => it.type !== "statement" && it.title.trim());
  const worded = await wordQuestions(env, items, { formTitle: form.title, organizationId, ledger, kind: "import_phrasing" });
  await ledger.log(env, { organizationId, latencyMs: Date.now() - started });
  const asked = worded ? new Map(items.map((it, i) => [it.key, worded[i]!])) : null;
  return importedToDoc(form, asked);
}
