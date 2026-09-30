import { generateObject } from "ai";
import { z } from "zod";
import type { Bindings } from "../../env.js";
import { chatModel, MODELS, reportedUsage, telemetry } from "../ai.js";
import { QUESTION_WORDING } from "../form-import.js";
import { logAiGeneration } from "../ai-usage.js";
import type { FormDoc } from "@repo/form-schema";
import { readImport } from "./read.js";
import { importedToDoc } from "./to-doc.js";
import type { ImportedForm, ImportReport } from "./types.js";

/**
 * A link → our form, with every question worded for a chat.
 *
 * The one path the converter, the dashboard's Import and `/v1/import` share.
 * The form itself is read by code, exactly; only the wording of each question
 * is the model's, with the same instruction a linked form gets in the AI
 * box and the builder chat (`QUESTION_WORDING`). The chat does not reword
 * later: the default hybrid mode asks each question as written.
 */
export async function convertImport(
  env: Bindings,
  url: string,
  organizationId: string,
): Promise<{ doc: FormDoc; report: ImportReport }> {
  const form = await readImport(url);
  const asked = await phraseQuestions(env, form, organizationId);
  return importedToDoc(form, asked);
}

const Phrased = z.object({ questions: z.array(z.string()) });

/**
 * Item key → the question as a person would ask it, or null when the model
 * is not there, too slow, or answers the wrong shape. `importedToDoc` then
 * keeps the source's words, so an import never waits on, or fails for, this.
 */
async function phraseQuestions(env: Bindings, form: ImportedForm, organizationId: string): Promise<Map<string, string> | null> {
  const items = form.items.filter((it) => it.type !== "statement" && it.title.trim());
  if (items.length === 0 || !env.OPENROUTER_API_KEY) return null;
  const started = Date.now();
  try {
    const result = await generateObject({
      model: chatModel(env, MODELS.extraction),
      schema: Phrased,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(10_000),
      system: `You word the questions of a conversational form, which asks one question at a time in a chat. You get an existing form's fields in order, and return one question per field, in the same order. ${QUESTION_WORDING}`,
      prompt: `Form: ${JSON.stringify(form.title)}

${items.map((it, i) => `${i + 1}. (${it.type}${it.description ? `, described as ${JSON.stringify(it.description.slice(0, 200))}` : ""}) ${JSON.stringify(it.title)}`).join("\n")}

Return exactly ${items.length} questions.`,
      providerOptions: telemetry(env, {}, { kind: "import_phrasing", organizationId }),
    });
    const usage = reportedUsage(result);
    await logAiGeneration(env, { organizationId, kind: "import_phrasing", model: MODELS.extraction, usage, latencyMs: Date.now() - started });
    const out = result.object.questions.map((q) => q.trim());
    if (out.length !== items.length || out.some((q) => !q || q.length > 2000)) return null;
    return new Map(items.map((it, i) => [it.key, out[i]!]));
  } catch (err) {
    console.error("import_phrasing_failed", { message: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
