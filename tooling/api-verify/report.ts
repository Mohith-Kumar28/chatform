/**
 * What the run has to say afterwards.
 *
 * Three outcomes, not two. `pass` and `fail` are obvious; `negative-only`
 * exists because three operations cannot be reached with a real payload from a
 * script — Google and Firebase respondent auth need identity tokens minted by
 * somebody else — and reporting those as failures would make the number lie in
 * the direction of alarm. They are reached, they refuse an invalid token the
 * way they document, and that is all a harness can honestly claim.
 *
 * The schema column is likewise three-valued. Only 22 of the 69 `/v1`
 * operations declare a 2xx JSON schema, so for the other 47 "matched the spec"
 * is a question with no answer. Printing the split is the point: it turns a
 * documentation gap into a number somebody can decide about.
 */
import type { CallRecord } from "./client.ts";

export type Outcome = "pass" | "fail" | "negative-only" | "skipped";

export interface OpResult {
  op: string;
  status: number;
  expected: string;
  ms: number;
  check: "schema-verified" | "shape-asserted" | "unchecked";
  outcome: Outcome;
  problems: string[];
  note?: string;
}

export interface Finding {
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
}

export function render(
  results: OpResult[],
  findings: Finding[],
  allOps: string[],
  records: CallRecord[],
  runId: string,
): string {
  const seen = new Map<string, OpResult>();
  for (const r of results) if (!seen.has(r.op) || r.outcome === "fail") seen.set(r.op, r);

  const missed = allOps.filter((op) => !seen.has(op));
  const tally = (o: Outcome) => [...seen.values()].filter((r) => r.outcome === o).length;
  const checks = (c: OpResult["check"]) => [...seen.values()].filter((r) => r.check === c).length;

  const lat = records.filter((r) => !r.incidental).map((r) => r.ms).sort((a, b) => a - b);
  const pct = (p: number) => (lat.length ? lat[Math.floor((lat.length - 1) * p)] : 0);

  const L: string[] = [];
  L.push(`# API verification run \`${runId}\``);
  L.push("");
  L.push(`Target: \`https://api.chatform.in\` (production). ${new Date().toISOString()}`);
  L.push("");
  L.push("## Coverage");
  L.push("");
  L.push(`| | |`);
  L.push(`| --- | --- |`);
  L.push(`| \`/v1\` operations in the spec | ${allOps.length} |`);
  L.push(`| reached by this run | ${seen.size} |`);
  L.push(`| never reached | ${missed.length} |`);
  L.push(`| pass | ${tally("pass")} |`);
  L.push(`| fail | ${tally("fail")} |`);
  L.push(`| negative-only | ${tally("negative-only")} |`);
  L.push(`| skipped | ${tally("skipped")} |`);
  L.push("");
  L.push(
    `Response checking: **${checks("schema-verified")}** verified against a schema the spec declares, ` +
      `**${checks("shape-asserted")}** against a hand-written expectation, ` +
      `**${checks("unchecked")}** not checked.`,
  );
  L.push("");
  L.push(`Latency across ${lat.length} calls: p50 ${pct(0.5)}ms, p95 ${pct(0.95)}ms, max ${lat.at(-1) ?? 0}ms.`);
  L.push("");

  if (missed.length) {
    L.push("## Never reached");
    L.push("");
    for (const op of missed) L.push(`- \`${op}\``);
    L.push("");
  }

  const failed = [...seen.values()].filter((r) => r.outcome === "fail");
  if (failed.length) {
    L.push("## Failures");
    L.push("");
    for (const r of failed) {
      L.push(`### \`${r.op}\``);
      L.push("");
      L.push(`Status ${r.status}, expected ${r.expected}.`);
      for (const p of r.problems) L.push(`- ${p}`);
      if (r.note) L.push(`- ${r.note}`);
      L.push("");
    }
  }

  if (findings.length) {
    L.push("## Findings");
    L.push("");
    for (const f of findings) {
      L.push(`### ${f.title}`);
      L.push("");
      L.push(`Severity: ${f.severity}.`);
      L.push("");
      L.push(f.detail);
      L.push("");
    }
  }

  L.push("## Every operation");
  L.push("");
  L.push("| Operation | Status | Expected | Check | Outcome | ms |");
  L.push("| --- | --- | --- | --- | --- | --- |");
  for (const op of allOps) {
    const r = seen.get(op);
    if (!r) {
      L.push(`| \`${op}\` | — | — | — | **not reached** | — |`);
      continue;
    }
    const mark = r.outcome === "fail" ? "**fail**" : r.outcome;
    L.push(`| \`${op}\` | ${r.status} | ${r.expected} | ${r.check} | ${mark} | ${r.ms} |`);
  }
  L.push("");
  return L.join("\n");
}
