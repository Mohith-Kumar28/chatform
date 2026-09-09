import { generateText } from "ai";
import type { Bindings } from "../../env.js";
import { chatModel, MODELS, splitUsage } from "../ai.js";
import { logAiGeneration } from "../ai-usage.js";
import { fetchSiteText } from "../research.js";
import type { KnowledgeSourceInput } from "./store.js";

/**
 * Turning whatever an author uploaded into markdown.
 *
 * Three routes, picked by kind rather than by MIME sniffing, because the author
 * already told us which control they used:
 *
 * - **Workers AI `toMarkdown`** for documents and images. Free for everything
 *   but the image path, and it covers PDF, the Office and OpenDocument
 *   families, CSV, HTML, XML and Apple Numbers. We write no parsers.
 * - **Whisper** for audio. `toMarkdown` does not handle audio at all.
 * - **`fetchSiteText`** for links, reusing the reader the form generator
 *   already uses — it caps the body, follows redirects and rejects non-HTML.
 *
 * ## The OCR gap, and why this file is more than one call
 *
 * `toMarkdown`'s PDF path extracts embedded text and traverses the structure
 * tree. It does not OCR. A scanned page has no embedded text, so it returns
 * empty — and an empty extraction indexed without complaint is the worst
 * outcome available: the author sees "ready" and the agent knows nothing. So a
 * low yield is treated as a failure of extraction rather than as a result, and
 * falls through to a vision model.
 */

/**
 * Below this, an extraction is treated as having failed rather than succeeded.
 *
 * A real document that is genuinely this short (a one-line note) will have come
 * through the paste box, not as a file. From a PDF or an image, this much text
 * means a header, a page number, or nothing.
 */
const MIN_USEFUL_CHARS = 120;

/** What a source may cost us to read before we stop. */
const MAX_EXTRACT_CHARS = 2_000_000;

export interface Extraction {
  markdown: string;
  /** True when the vision fallback produced this, for logging and metering. */
  ocr: boolean;
}

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}

export async function extract(
  env: Bindings,
  input: KnowledgeSourceInput,
  ctx: { organizationId: string },
): Promise<Extraction> {
  const markdown = await extractRaw(env, input);
  const trimmed = markdown.trim();

  // Pasted text and link text are already what they are; there is nothing to
  // fall back to and no pixels to read.
  const canOcr = input.kind === "file" || input.kind === "image";
  if (trimmed.length >= MIN_USEFUL_CHARS || !canOcr) {
    if (!trimmed) {
      throw new ExtractionError(
        input.kind === "link"
          ? "That page had no readable text — it may need JavaScript to render."
          : "We couldn't find any text in that file.",
      );
    }
    return { markdown: cap(trimmed), ocr: false };
  }

  const read = await ocrFallback(env, input, ctx);
  if (!read || read.trim().length < MIN_USEFUL_CHARS) {
    throw new ExtractionError(
      "We couldn't read any text from that file. If it's a scan or a photo, try a clearer image — or paste the text instead.",
    );
  }
  return { markdown: cap(read.trim()), ocr: true };
}

function cap(text: string): string {
  return text.length > MAX_EXTRACT_CHARS ? text.slice(0, MAX_EXTRACT_CHARS) : text;
}

async function extractRaw(env: Bindings, input: KnowledgeSourceInput): Promise<string> {
  switch (input.kind) {
    case "text":
      return input.text ?? "";

    case "link":
    case "crawl": {
      if (!input.url) throw new ExtractionError("No URL to read.");
      const page = await fetchSiteText(input.url);
      if (!page) throw new ExtractionError("We couldn't read that page.");
      return page.title ? `# ${page.title}\n\n${page.text}` : page.text;
    }

    case "audio":
      return await transcribe(env, input);

    case "file":
    case "image":
      return await toMarkdown(env, input);
  }
}

/**
 * Workers AI's document conversion.
 *
 * Errors come back per file as `format: "error"` rather than as a throw, so a
 * bad document fails its own source and never a batch.
 */
async function toMarkdown(env: Bindings, input: KnowledgeSourceInput): Promise<string> {
  if (!env.WORKERS_AI) throw new ExtractionError("Document reading is unavailable right now.");
  if (!input.blob) throw new ExtractionError("No file to read.");

  const result = await env.WORKERS_AI.toMarkdown(
    { name: input.filename ?? input.title, blob: input.blob },
    {
      conversionOptions: {
        // Figures inside a PDF or a .docx carry real content — a pricing
        // table screenshotted into a policy document is the usual case — and
        // without this they are dropped silently.
        pdf: { images: { convert: true, maxConvertedImages: 20 } },
        docx: { images: { convert: true, maxConvertedImages: 20 } },
        // Chrome and navigation are not knowledge. Where a page marks its
        // content, keep only that.
        html: { cssSelector: "main, article, [role=main]" },
      },
    },
  );

  if (result.format === "error") throw new ExtractionError(readableFileError(result.error));
  return result.data ?? "";
}

/**
 * Whisper. Separate from `toMarkdown`, which does not accept audio.
 *
 * A voice note is the one source type where the author cannot see what was
 * captured, so a transcript that fails must say so rather than index silence.
 */
async function transcribe(env: Bindings, input: KnowledgeSourceInput): Promise<string> {
  if (!env.WORKERS_AI) throw new ExtractionError("Audio transcription is unavailable right now.");
  if (!input.blob) throw new ExtractionError("No audio to transcribe.");

  // whisper-large-v3-turbo takes base64, unlike the original `@cf/openai/whisper`,
  // which takes a byte array. Chunked because `String.fromCharCode` with a
  // spread of a whole file blows the call stack somewhere around a megabyte,
  // and a voice note is comfortably bigger than that.
  const bytes = new Uint8Array(await input.blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  const result = (await env.WORKERS_AI.run("@cf/openai/whisper-large-v3-turbo", {
    audio: btoa(binary),
    task: "transcribe",
  })) as { text?: string };

  const text = result?.text?.trim() ?? "";
  if (!text) throw new ExtractionError("We couldn't hear any speech in that recording.");
  return `# ${input.title}\n\n${text}`;
}

/**
 * The scanned-document path: hand the bytes to a vision model and ask for the
 * text.
 *
 * Metered like any other builder-side model call, so an org that uploads a
 * hundred scans shows up in `ai_generations` rather than as an unattributed
 * bill.
 */
async function ocrFallback(
  env: Bindings,
  input: KnowledgeSourceInput,
  ctx: { organizationId: string },
): Promise<string | null> {
  if (!input.blob) return null;
  const started = Date.now();
  try {
    const bytes = new Uint8Array(await input.blob.arrayBuffer());
    const mediaType = input.mime || (input.kind === "image" ? "image/png" : "application/pdf");

    const result = await generateText({
      model: chatModel(env, MODELS.ocr),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Transcribe every piece of text in this document into markdown. " +
                "Preserve headings, lists and tables. Do not summarise, do not comment, " +
                "and do not add anything that is not written in it. " +
                "If it contains no legible text, reply with exactly: NO_TEXT",
            },
            { type: "file", data: bytes, mediaType },
          ],
        },
      ],
      abortSignal: AbortSignal.timeout(90_000),
    });

    await logAiGeneration(env, {
      organizationId: ctx.organizationId,
      formId: input.formId,
      kind: "knowledge_ocr",
      model: MODELS.ocr,
      usage: splitUsage(result.usage),
      latencyMs: Date.now() - started,
    });

    const text = result.text?.trim() ?? "";
    return text === "NO_TEXT" ? null : text;
  } catch (err) {
    console.error("knowledge_ocr_failed", input.sourceId, err);
    return null;
  }
}

/**
 * Workers AI's error strings name formats and internals. The author needs to
 * know what to do instead.
 */
function readableFileError(error: string | undefined): string {
  const raw = (error ?? "").toLowerCase();
  if (raw.includes("unsupported") || raw.includes("format")) {
    return "We can't read that file type. PDFs, Word, Excel, CSV, text and images work.";
  }
  if (raw.includes("password") || raw.includes("encrypt")) {
    return "That file is password-protected, so we couldn't open it.";
  }
  return "We couldn't read that file. It may be corrupt or an unsupported format.";
}
