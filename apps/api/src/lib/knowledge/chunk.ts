/**
 * Splitting extracted markdown into passages worth embedding.
 *
 * Everything upstream produces markdown — `toMarkdown` for files, Whisper for
 * audio, `fetchSiteText` for links — so this splits on document structure
 * first and only falls back to counting when structure runs out.
 *
 * ## Why headings first
 *
 * A fixed-width window cuts mid-sentence and mid-table, and the retrieved
 * passage then opens halfway through a thought. Markdown already marks where
 * one topic ends: an FAQ answer, a policy clause, a spreadsheet's sheet. Cutting
 * there means a hit is usually a whole answer, which is what gets quoted back
 * to a respondent.
 */

/**
 * Target passage size, in characters.
 *
 * bge-m3 accepts 8192 tokens, far more than this — the limit that matters is
 * not the model's but the reader's. A passage is pasted into a tool result and
 * the agent answers from it, so it wants to be one topic, not one page. ~2000
 * characters is roughly 500 tokens: a couple of paragraphs.
 */
export const CHUNK_CHARS = 2000;

/**
 * How much of the previous passage each one repeats.
 *
 * Overlap exists for the sentence that straddles a boundary. Without it, a fact
 * split across a cut is in neither passage as a whole thought and matches
 * neither query. 15% is enough to carry a sentence or two across.
 */
export const CHUNK_OVERLAP_CHARS = Math.round(CHUNK_CHARS * 0.15);

/** Below this a passage is a heading with nothing under it — noise, not content. */
const MIN_CHUNK_CHARS = 60;

export interface Chunk {
  ordinal: number;
  text: string;
}

/**
 * Split on markdown headings, keeping each heading with the prose beneath it.
 *
 * A section longer than the target is handed to the paragraph splitter; a run of
 * short sections is packed together, because six one-line headings make six
 * useless vectors where one passage would answer the question.
 */
export function chunkMarkdown(markdown: string, chunkChars: number = CHUNK_CHARS): Chunk[] {
  const normalized = markdown.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!normalized) return [];

  const sections = splitOnHeadings(normalized);
  const out: string[] = [];
  let buffer = "";

  for (const section of sections) {
    if (section.length > chunkChars) {
      // Flush what is held before a long section, or the buffer would be
      // prepended to the first of its pieces and push it over the target.
      if (buffer.trim()) out.push(buffer.trim());
      buffer = "";
      out.push(...splitLong(section, chunkChars));
      continue;
    }
    if (buffer.length + section.length + 2 > chunkChars && buffer.trim()) {
      out.push(buffer.trim());
      buffer = "";
    }
    buffer += (buffer ? "\n\n" : "") + section;
  }
  if (buffer.trim()) out.push(buffer.trim());

  return withOverlap(out.filter((t) => t.trim().length >= MIN_CHUNK_CHARS || out.length === 1))
    .map((text, i) => ({ ordinal: i, text }));
}

/** Each ATX heading starts a new section and stays attached to its body. */
function splitOnHeadings(md: string): string[] {
  const lines = md.split("\n");
  const sections: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    // Fenced code can legally contain a `#` line; treat a heading as a heading
    // only outside a fence.
    if (/^#{1,6}\s/.test(line) && current.length > 0) {
      sections.push(current.join("\n").trim());
      current = [];
    }
    current.push(line);
  }
  if (current.length) sections.push(current.join("\n").trim());
  return sections.filter(Boolean);
}

/**
 * A section with no internal headings, cut on the softest boundary available:
 * blank line, then sentence, then — only if a single sentence is enormous —
 * width.
 *
 * The section's heading is lifted off first and re-attached to every piece.
 * Without that, splitting `# Refunds` + three pages of prose left the heading
 * alone in a fragment too small to survive the minimum-size filter, and the
 * pages that followed no longer said anywhere what they were about — so a
 * search for "refunds" matched none of them. Repeating one line per chunk is a
 * cheap price for every passage knowing its own subject.
 */
function splitLong(section: string, chunkChars: number): string[] {
  const { heading, body } = liftHeading(section);
  const budget = heading ? chunkChars - heading.length - 2 : chunkChars;

  const paras = body.split(/\n\s*\n/);
  const out: string[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer.trim()) out.push(buffer.trim());
    buffer = "";
  };

  for (const para of paras) {
    if (para.length > budget) {
      flush();
      for (const piece of splitSentences(para, budget)) out.push(piece);
      continue;
    }
    if (buffer.length + para.length + 2 > budget) flush();
    buffer += (buffer ? "\n\n" : "") + para;
  }
  flush();

  return heading ? out.map((piece) => `${heading}\n\n${piece}`) : out;
}

/** Split a leading ATX heading line off its body. */
function liftHeading(section: string): { heading: string | null; body: string } {
  const newline = section.indexOf("\n");
  const first = newline === -1 ? section : section.slice(0, newline);
  if (!/^#{1,6}\s/.test(first.trim())) return { heading: null, body: section };
  return { heading: first.trim(), body: newline === -1 ? "" : section.slice(newline + 1).trim() };
}

function splitSentences(text: string, chunkChars: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+[\s]*|[^.!?]+$/g) ?? [text];
  const out: string[] = [];
  let buffer = "";

  for (const sentence of sentences) {
    if (sentence.length > chunkChars) {
      if (buffer.trim()) out.push(buffer.trim());
      buffer = "";
      // A "sentence" this long is a table row, a base64 blob or prose with no
      // punctuation. Nothing softer is left to cut on.
      for (let i = 0; i < sentence.length; i += chunkChars) {
        out.push(sentence.slice(i, i + chunkChars).trim());
      }
      continue;
    }
    if (buffer.length + sentence.length > chunkChars && buffer.trim()) {
      out.push(buffer.trim());
      buffer = "";
    }
    buffer += sentence;
  }
  if (buffer.trim()) out.push(buffer.trim());
  return out.filter(Boolean);
}

/**
 * Prefix each passage with the tail of the one before it.
 *
 * Done here rather than during splitting so the boundary logic above stays
 * about structure. The tail is trimmed to a word boundary — half a word helps
 * nobody and embeds badly.
 */
function withOverlap(chunks: string[]): string[] {
  if (chunks.length <= 1) return chunks;
  return chunks.map((text, i) => {
    if (i === 0) return text;
    const prev = chunks[i - 1]!;
    let tail = prev.slice(Math.max(0, prev.length - CHUNK_OVERLAP_CHARS));
    const space = tail.indexOf(" ");
    if (space > 0) tail = tail.slice(space + 1);
    return tail.trim() ? `${tail.trim()}\n\n${text}` : text;
  });
}
