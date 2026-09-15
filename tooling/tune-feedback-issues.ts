#!/usr/bin/env tsx
/**
 * Measure how well bug reports are grouped into issues — before and after any
 * change to the matching prompt or its constants.
 *
 *   EMBED_URL=http://localhost:8799 OPENROUTER_API_KEY=… pnpm --filter @repo/tooling exec tsx tune-feedback-issues.ts
 *
 * Two reports, on a labelled set of realistic notes (English and Hinglish, with
 * deliberate same-component near misses — the hard cases in production):
 *
 * 1. **Similarity**: every pair's cosine score under the production embedding.
 *    This is why matching does not use a threshold — the two distributions
 *    overlap — and why it does use the embedding to shortlist: the right issue
 *    is almost always among the nearest few.
 * 2. **Simulation**: the notes arrive one at a time through the *shipped* prompt
 *    and constants (imported, not copied, from the API), and the result is
 *    scored — how many issues against the ideal, and whether any issue mixes two
 *    bugs. A wrong merge hides a bug inside another; it is the error that matters.
 *
 * Workers AI has no local emulation, so embeddings come from a tiny worker with
 * an `ai` binding under `wrangler dev` that answers `POST { texts }` with the
 * output of `@cf/baai/bge-m3`. The grouping model is called through OpenRouter,
 * as in production.
 */
import {
  ISSUE_CANDIDATES,
  ISSUE_DECIDE_SYSTEM,
  ISSUE_FLOOR,
  issueDecidePrompt,
} from "../apps/api/src/lib/feedback-issue-prompt.js";

const EMBED_URL = process.env.EMBED_URL;
const KEY = process.env.OPENROUTER_API_KEY;
const MODEL = "google/gemini-3.1-flash-lite";
if (!EMBED_URL) {
  console.error("Set EMBED_URL to a worker that embeds with @cf/baai/bge-m3 (see the header).");
  process.exit(1);
}

/** [bug, note]. Same bug label = should share an issue. */
const SET: [string, string][] = [
  ["picker-wont-open", "The date picker won't open when I tap it on my iPhone."],
  ["picker-wont-open", "Tapping the calendar does nothing, it never shows up."],
  ["picker-wont-open", "date of birth field — the calendar popup doesn't appear on safari"],
  ["picker-wont-open", "Calendar khul hi nahi raha date select karne ke liye"],

  ["picker-wrong-date", "I picked the 12th but it saved the 11th."],
  ["picker-wrong-date", "The date is off by one day after I choose it."],
  ["picker-wrong-date", "Selected date shows a different day in the summary."],

  ["phone-rejected", "It says my phone number is invalid but it's correct."],
  ["phone-rejected", "Won't accept +91 numbers, keeps saying enter a valid number."],
  ["phone-rejected", "mobile number field rejecting my number again and again"],
  ["phone-rejected", "Phone number accept nahi ho raha, invalid bol raha hai"],

  ["otp-missing", "The OTP never arrived on my phone."],
  ["otp-missing", "Didn't receive the verification code SMS even after resend."],
  ["otp-missing", "code nahi aaya abhi tak, waited 5 minutes"],

  ["google-signin", "Google sign in popup closes and nothing happens."],
  ["google-signin", "Stuck on continue with Google, it keeps loading."],
  ["google-signin", "Sign in with Google fails, it just goes back to the start."],

  ["slow-replies", "It takes a long time to load the responses after I answer."],
  ["slow-replies", "The bot is very slow to reply, waiting 20 seconds each time."],
  ["slow-replies", "it was smooth, but sometimes its taking some time to load the responces"],
  ["slow-replies", "Reply aane mein bahut time lag raha hai"],

  ["upload-fails", "My PDF won't upload, it gets stuck at 90%."],
  ["upload-fails", "File upload fails with an error for my resume."],
  ["upload-fails", "Can't attach the document, upload keeps failing."],

  ["send-dead", "The send button does nothing when I press it."],
  ["send-dead", "I type my answer and hit enter but it doesn't submit."],
  ["send-dead", "Can't send my answer, the button is not responding."],

  ["praise", "Really smooth experience, loved filling this in."],
  ["praise", "This was so much easier than a normal form, great job."],
];

type Vec = number[];
const dotOf = (a: Vec, b: Vec) => a.reduce((s, x, i) => s + x * b[i]!, 0);
const unit = (v: Vec) => {
  const n = Math.sqrt(dotOf(v, v)) || 1;
  return v.map((x) => x / n);
};

async function decide(note: string, candidates: { id: string; title: string; examples: string[] }[]) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: ISSUE_DECIDE_SYSTEM },
        { role: "user", content: issueDecidePrompt(note, candidates) },
      ],
    }),
  });
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  try {
    return JSON.parse(j.choices?.[0]?.message?.content ?? "{}") as { match: string | null; title: string };
  } catch {
    return { match: null, title: "?" };
  }
}

async function main(): Promise<void> {
  const res = await fetch(EMBED_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ texts: SET.map(([, t]) => t) }),
  });
  if (!res.ok) {
    console.error(`Embedding worker answered ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const raw = ((await res.json()) as { data: Vec[] }).data;
  const norms = raw.map((v) => Math.sqrt(dotOf(v, v)));
  const vec = raw.map(unit);

  // ── 1. similarity ──
  const same: number[] = [];
  const cross: number[] = [];
  for (let i = 0; i < SET.length; i++) {
    for (let j = i + 1; j < SET.length; j++) {
      (SET[i]![0] === SET[j]![0] ? same : cross).push(dotOf(vec[i]!, vec[j]!));
    }
  }
  same.sort((a, b) => a - b);
  cross.sort((a, b) => b - a);
  console.log(`dimensions ${raw[0]!.length}, norms ${Math.min(...norms).toFixed(4)}–${Math.max(...norms).toFixed(4)}`);
  console.log(`same-bug pairs:      min ${same[0]!.toFixed(3)}  median ${same[same.length >> 1]!.toFixed(3)}`);
  console.log(`different-bug pairs: max ${cross[0]!.toFixed(3)}  median ${cross[cross.length >> 1]!.toFixed(3)}`);
  console.log(same[0]! < cross[0]! ? "→ overlapping: no threshold separates them, which is why the model decides.\n" : "→ separable by threshold.\n");

  if (!KEY) {
    console.log("Set OPENROUTER_API_KEY to run the simulation.");
    process.exit(0);
  }

  // ── 2. simulation through the shipped prompt ──

  // Interleaved arrival, like real traffic, but reproducible.
  // ORDER_SEED picks a different interleaving, to check the result is not an artefact of one order.
  const seed = Number(process.env.ORDER_SEED ?? 7919);
  const order = SET.map((_, i) => i).sort((a, b) => ((a * seed) % SET.length) - ((b * seed) % SET.length));
  const issues: { id: string; title: string; members: number[]; centroid: Vec }[] = [];
  const assigned = new Map<number, string>();
  for (const i of order) {
    const shortlist = issues
      .map((iss) => ({ iss, s: dotOf(vec[i]!, iss.centroid) }))
      .filter((x) => x.s >= ISSUE_FLOOR)
      .sort((a, b) => b.s - a.s)
      .slice(0, ISSUE_CANDIDATES);
    const decision = await decide(
      SET[i]![1],
      shortlist.map(({ iss }) => ({ id: iss.id, title: iss.title, examples: iss.members.slice(-2).map((m) => SET[m]![1]) })),
    );
    let target = shortlist.find(({ iss }) => iss.id === decision.match)?.iss;
    if (target) {
      target.members.push(i);
      target.centroid = unit(target.members.reduce((sum, m) => sum.map((x, d) => x + vec[m]![d]!), new Array(raw[0]!.length).fill(0)));
    } else {
      target = { id: `I${issues.length + 1}`, title: decision.title, members: [i], centroid: vec[i]! };
      issues.push(target);
    }
    assigned.set(i, target.id);
  }

  let pure = 0;
  for (const iss of issues) {
    const counts: Record<string, number> = {};
    iss.members.forEach((m) => (counts[SET[m]![0]] = (counts[SET[m]![0]] ?? 0) + 1));
    pure += Math.max(...Object.values(counts));
    console.log(`${iss.id.padEnd(4)} (${iss.members.length}) ${iss.title}  ← ${Object.entries(counts).map(([k, v]) => `${k}×${v}`).join(", ")}`);
  }
  const bugs = Array.from(new Set(SET.map(([b]) => b)));
  const splits = bugs
    .map((b) => [b, new Set(SET.flatMap(([l], i) => (l === b ? [assigned.get(i)] : []))).size] as const)
    .filter(([, n]) => n > 1);
  console.log(
    `\n${SET.length} reports → ${issues.length} issues (ideal ${bugs.length}) · every report in the right issue: ${pure}/${SET.length} · split: ${splits.map(([b, n]) => `${b}→${n}`).join(", ") || "none"}`,
  );
}

void main();
