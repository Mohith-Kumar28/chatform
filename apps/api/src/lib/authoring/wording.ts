import { generateObject } from "ai";
import { z } from "zod";
import type { Bindings } from "../../env.js";
import { chatModel, MODELS, reportedUsage, telemetry } from "../ai.js";
import { QUESTION_WORDING } from "../form-import.js";
import type { Ledger } from "./ledger.js";

/**
 * A copied form's questions, worded for a chat.
 *
 * The one place a copied question gets its words, for every path that copies
 * a form: the importer, a link in the AI box, a link in the builder chat.
 * Code reads the form exactly; this one small call words each question; the
 * drafting model only places them. Wording used to be one line in the
 * drafting prompt, and that model, busy building a whole form, sometimes
 * copied "Customer name:" straight through.
 *
 * Null when the model is not there, too slow, or answers the wrong shape, and
 * the caller keeps the source's own words: copying a form never waits on, or
 * fails for, this.
 */
const Worded = z.object({ questions: z.array(z.string()) });

export async function wordQuestions(
  env: Bindings,
  fields: { title: string; type: string; description?: string }[],
  ctx: { formTitle: string; organizationId?: string | null; ledger: Ledger; kind: string },
): Promise<string[] | null> {
  if (fields.length === 0 || !env.OPENROUTER_API_KEY) return null;
  try {
    const result = await generateObject({
      model: chatModel(env, MODELS.extraction),
      schema: Worded,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(10_000),
      system: `You word the questions of a conversational form, which asks one question at a time in a chat. You get an existing form's fields in order, and return one question per field, in the same order. ${QUESTION_WORDING}`,
      prompt: `Form: ${JSON.stringify(ctx.formTitle)}

${fields.map((f, i) => `${i + 1}. (${f.type}${f.description ? `, described as ${JSON.stringify(f.description.slice(0, 200))}` : ""}) ${JSON.stringify(f.title)}`).join("\n")}

Return exactly ${fields.length} questions.`,
      providerOptions: telemetry(env, {}, { kind: ctx.kind, organizationId: ctx.organizationId }),
    });
    ctx.ledger.add(ctx.kind, MODELS.extraction, reportedUsage(result));
    const out = result.object.questions.map((q) => q.trim());
    if (out.length !== fields.length || out.some((q) => !q || q.length > 2000)) return null;
    return out;
  } catch (err) {
    console.error("question_wording_failed", { kind: ctx.kind, message: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
