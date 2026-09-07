import type { Block, FormDoc } from "@repo/form-schema";

/**
 * The form as a sheet of paper.
 *
 * A conversational form has no printable state of its own — it is one question
 * at a time, and the thing people want to hand round a room, send to legal, or
 * keep as a record is all of them at once. This renders that: title, then every
 * question in order with whatever a respondent would have to choose from.
 *
 * Printed through a hidden iframe rather than a popup, because a new window is
 * what popup blockers exist to stop, and the print dialog is the only reliable
 * way to reach "Save as PDF" on every platform without shipping a PDF library.
 */

/** A word for the kind of answer, for questions whose shape isn't obvious. */
const ANSWER_HINT: Partial<Record<Block["type"], string>> = {
  short_text: "Short answer",
  long_text: "Long answer",
  email: "Email address",
  phone: "Phone number",
  url: "Web address",
  number: "Number",
  date: "Date",
  scheduling: "Date and time",
  file_upload: "File upload",
  signature: "Signature",
  payment: "Payment",
  address: "Address",
  contact_info: "Contact details",
  nps: "Score from 0 to 10",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The choices, scale or blank line a respondent would be answering into. */
function answerArea(block: Block): string {
  const b = block as Block & {
    options?: { id: string; label: string }[];
    scale?: number;
    yesLabel?: string;
    noLabel?: string;
    columns?: { id: string; label: string }[];
    rows?: { id: string; label: string }[];
  };

  if (b.options?.length) {
    const boxes = b.options
      .map((o) => `<li><span class="box"></span>${escapeHtml(o.label)}</li>`)
      .join("");
    return `<ul class="choices">${boxes}</ul>`;
  }

  if (block.type === "yes_no") {
    return `<ul class="choices"><li><span class="box"></span>${escapeHtml(b.yesLabel ?? "Yes")}</li><li><span class="box"></span>${escapeHtml(b.noLabel ?? "No")}</li></ul>`;
  }

  if (block.type === "rating" || block.type === "opinion_scale") {
    const max = b.scale ?? 5;
    const steps = Array.from({ length: max }, (_, i) => `<span class="step">${i + 1}</span>`).join("");
    return `<div class="scale">${steps}</div>`;
  }

  if (block.type === "nps") {
    const steps = Array.from({ length: 11 }, (_, i) => `<span class="step">${i}</span>`).join("");
    return `<div class="scale">${steps}</div>`;
  }

  if (block.type === "matrix" && b.rows?.length && b.columns?.length) {
    const head = b.columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("");
    const body = b.rows
      .map(
        (r) =>
          `<tr><th scope="row">${escapeHtml(r.label)}</th>${b.columns!.map(() => `<td><span class="box"></span></td>`).join("")}</tr>`,
      )
      .join("");
    return `<table class="matrix"><thead><tr><td></td>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  if (block.type === "long_text") return `<div class="lines tall"></div>`;
  return `<div class="lines"></div>`;
}

function questionHtml(block: Block, index: number): string {
  const hint = ANSWER_HINT[block.type];
  return `
    <li class="q">
      <p class="q-title"><span class="n">${index}.</span> ${escapeHtml(block.title)}${
        block.required ? '<span class="req" aria-label="required">*</span>' : ""
      }</p>
      ${block.description ? `<p class="q-desc">${escapeHtml(block.description)}</p>` : ""}
      ${hint ? `<p class="q-hint">${hint}</p>` : ""}
      ${answerArea(block)}
    </li>`;
}

export function printableFormHtml(doc: FormDoc): string {
  // Statements and welcome screens ask nothing, so they are context rather than
  // numbered questions — and a sheet that numbers them is a sheet whose numbers
  // don't match the form.
  const questions = doc.blocks.filter((b) => b.type !== "statement" && b.type !== "welcome");
  const items = questions.map((b, i) => questionHtml(b, i + 1)).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(doc.title || "Form")}</title>
<style>
  @page { margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0; color: #1b1b1b;
    font: 11pt/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  h1 { font-size: 20pt; margin: 0 0 4pt; }
  .lede { color: #555; margin: 0 0 6pt; }
  .count { color: #777; font-size: 9pt; margin: 0 0 18pt; }
  ol { list-style: none; margin: 0; padding: 0; }
  .q { margin: 0 0 18pt; break-inside: avoid; }
  .q-title { font-weight: 600; margin: 0 0 2pt; }
  .n { color: #777; font-weight: 500; margin-right: 4pt; }
  .req { color: #c0392b; margin-left: 3pt; }
  .q-desc { color: #555; margin: 0 0 4pt; }
  .q-hint { color: #777; font-size: 9pt; margin: 0 0 4pt; }
  .choices { list-style: none; margin: 4pt 0 0; padding: 0; }
  .choices li { display: flex; align-items: center; gap: 7pt; margin: 0 0 4pt; }
  .box { display: inline-block; width: 11pt; height: 11pt; border: 1pt solid #999; border-radius: 2pt; }
  .scale { display: flex; gap: 6pt; margin-top: 4pt; }
  .step {
    width: 20pt; height: 20pt; border: 1pt solid #999; border-radius: 3pt;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 9pt; color: #777;
  }
  .lines { border-bottom: 1pt solid #ccc; height: 20pt; margin-top: 4pt; }
  .lines.tall { height: 56pt; border-bottom: 1pt solid #ccc; }
  .matrix { border-collapse: collapse; margin-top: 5pt; width: 100%; font-size: 9.5pt; }
  .matrix th, .matrix td { border: 1pt solid #ddd; padding: 4pt 6pt; text-align: left; }
  .matrix thead th { font-weight: 600; }
  .matrix td { text-align: center; }
  footer { color: #999; font-size: 8.5pt; margin-top: 20pt; }
</style>
</head>
<body>
  <h1>${escapeHtml(doc.title || "Untitled form")}</h1>
  ${doc.description ? `<p class="lede">${escapeHtml(doc.description)}</p>` : ""}
  <p class="count">${questions.length} question${questions.length === 1 ? "" : "s"}</p>
  <ol>${items}</ol>
  <footer>Printed from Chatform. Answers collected online at the form's link.</footer>
</body>
</html>`;
}

/**
 * Open the browser's print dialog on a printable copy of the form.
 *
 * The iframe is torn down after printing. `onafterprint` is not reliable across
 * browsers for a same-document print, so a timer backs it up — a stray hidden
 * iframe is harmless, but leaking one per click is not.
 */
export function printForm(doc: FormDoc): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0";
  document.body.appendChild(frame);

  const remove = () => frame.remove();

  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) return remove();
    win.addEventListener("afterprint", remove);
    win.focus();
    win.print();
    window.setTimeout(remove, 60_000);
  };

  frame.srcdoc = printableFormHtml(doc);
}
