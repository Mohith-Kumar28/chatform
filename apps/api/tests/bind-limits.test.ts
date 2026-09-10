import { describe, it, expect } from "vitest";
import { BIND_CHUNK, D1_MAX_BOUND_PARAMS, bindChunks, holesFor } from "../src/lib/d1-bindings.js";

/**
 * The limit no local test can reach.
 *
 * D1 binds at most a hundred parameters per statement — per statement, so a
 * batch does not help — and the D1 in this pool and in miniflare does not
 * enforce it. An `IN (…)` built from a page of rows is therefore correct in
 * every test and `too many SQL variables` in production, which is exactly how
 * `purgeOrgObjects` shipped a delete that destroyed a workspace's R2 objects
 * and then threw before removing the rows that pointed at them.
 *
 * So this suite does not exercise the database. It reads the source and refuses
 * a placeholder list whose length nothing bounds.
 */

/**
 * The sources as text, inlined by vite at transform time.
 *
 * Not `node:fs`: these tests run in the Workers pool, which has no filesystem
 * to read — which is also the reason a scan like this is the only place the
 * rule can live.
 */
const SOURCES = import.meta.glob("../src/**/*.ts", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

/**
 * Placeholder lists whose bound is somewhere other than `bindChunks`, each with
 * the reason it cannot exceed the ceiling. A new entry here is a claim someone
 * has to defend in review; a new list *not* here fails this test.
 */
const BOUNDED_ELSEWHERE: Record<string, string> = {
  "lib/exports.ts": "`statuses` is a validated enum — five values at most",
  "lib/webhooks.ts": "the retry sweep selects `LIMIT 50`",
  "lib/sweeps.ts": "SEND_CHUNK is 25, and the knowledge sweep takes 20 forms",
  "lib/followups.ts": "CATCHUP_CHUNK is 25",
  "lib/form-activity.ts": "actor ids come from one page of activity rows",
  "lib/knowledge/vectorize-store.ts": "ids come from one page of vector matches",
  "routes/audit.ts": "actor ids come from one page of audit rows",
  "routes/v1/forms.ts": "`formIds` pinned on an API key, capped at mint time",
  "routes/v1/responses.ts": "`requested` is a validated status enum — five values at most",
};

describe("D1 bound-parameter ceiling", () => {
  it("is a hundred, and BIND_CHUNK leaves room beneath it", () => {
    expect(D1_MAX_BOUND_PARAMS).toBe(100);
    // Room for the form id, status and timestamps a statement binds beside its list.
    expect(BIND_CHUNK).toBeLessThanOrEqual(D1_MAX_BOUND_PARAMS / 2);
  });

  it("never hands back a slice too big to bind", () => {
    const ids = Array.from({ length: 512 }, (_, i) => `id_${i}`);
    const chunks = bindChunks(ids);
    expect(chunks.flat()).toEqual(ids);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(BIND_CHUNK);
    expect(holesFor(chunks[0]!).split(",")).toHaveLength(BIND_CHUNK);
    expect(bindChunks([])).toEqual([]);
  });

  /**
   * The one that would have caught the export writer: it named five hundred
   * submissions in a single `IN (…)`, five times the ceiling, and every test
   * passed.
   */
  it("builds no placeholder list that nothing bounds", () => {
    const offenders: string[] = [];
    expect(Object.keys(SOURCES).length).toBeGreaterThan(40);
    for (const [path, source] of Object.entries(SOURCES)) {
      const rel = path.replace("../src/", "");
      if (rel === "lib/d1-bindings.ts") continue;
      const lines = source.split("\n");
      lines.forEach((line, i) => {
        if (!/map\(\(\) => "\?"\)/.test(line)) return;
        // `holesFor` is only ever handed a `bindChunks` slice, so a list built
        // near either word is bounded by construction.
        const nearby = lines.slice(Math.max(0, i - 2), i + 2).join(" ");
        if (/chunk|holesFor\(/.test(nearby)) return;
        if (rel in BOUNDED_ELSEWHERE) return;
        offenders.push(`${rel}:${i + 1} builds a placeholder list with no stated bound`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
