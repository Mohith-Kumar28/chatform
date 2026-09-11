import { sha256Hex } from "@repo/form-schema";
import type { Bindings } from "../env.js";

/**
 * The person behind a response, recognised across every form on the platform.
 *
 * Nothing in this database used to represent a respondent. Identity was copied
 * onto each `submissions` row and never joined, so one person answering three
 * forms was three unrelated tuples and "how many people" was not a question the
 * schema could answer at any scope. This is the join key those copies never had.
 *
 * ── What recognition is made of ──
 *
 * A visit hands us up to three identifiers, and any one of them is enough:
 *
 *   device    the browser fingerprint, hashed under one platform-wide salt
 *   identity  a verified sign-in, as `<provider>:<subject>`
 *   email     the address they gave, lowercased
 *
 * They are stored in `respondent_keys`, one row each, and the composite primary
 * key on `(kind, value)` is the whole mechanism: **one identifier names one
 * person, platform-wide**. When a visit arrives carrying two identifiers that
 * currently name two different people, those two people were always the same
 * person and the rows merge. That is how a laptop, a phone and a sign-in
 * collapse into one respondent.
 *
 * ── Why the device key is derived again here ──
 *
 * `submissions.fingerprint` is salted with `forms.fingerprint_salt`, which makes
 * it deliberately incomparable between forms, and it keeps doing that job for
 * the resubmission gate and the follow-up cap. A platform-wide record needs the
 * opposite property, so the same browser fingerprint is hashed again under the
 * signing salt. Same input, two derivations, two different questions.
 */

/** `rsp_` and twenty hex characters, like every other id in this codebase. */
export function newRespondentId(): string {
  return `rsp_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

/**
 * The platform-wide device key for one browser fingerprint.
 *
 * Salted, so the column is not a list of raw fingerprints and a leaked row
 * cannot be matched against a fingerprint collected somewhere else. Hashing is
 * not anonymisation and is not pretending to be: the value is stable and is
 * exactly what links a person across forms, which is what it is for.
 */
export function deviceKeyFor(env: Bindings, fingerprint: string | null | undefined): string | null {
  const trimmed = fingerprint?.trim();
  if (!trimmed) return null;
  return sha256Hex(`${env.SIGNING_SALT}:rsp:${trimmed}`);
}

export interface RespondentSighting {
  /** Already hashed by `deviceKeyFor`. */
  deviceKey?: string | null;
  identity?: { provider: string; subject: string } | null;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
}

interface RespondentKey {
  kind: "device" | "identity" | "email";
  value: string;
}

/** The identifiers this sighting can be recognised by, in order of how much they prove. */
function keysOf(input: RespondentSighting): RespondentKey[] {
  const keys: RespondentKey[] = [];
  if (input.identity?.provider && input.identity.subject) {
    keys.push({ kind: "identity", value: `${input.identity.provider}:${input.identity.subject}` });
  }
  const email = input.email?.trim().toLowerCase();
  if (email) keys.push({ kind: "email", value: email });
  if (input.deviceKey) keys.push({ kind: "device", value: input.deviceKey });
  return keys;
}

/**
 * Which people these identifiers currently name.
 *
 * `OR`-ed pairs rather than a row-value `IN`, because there are at most three of
 * them and the pairs read as what they are. Each is an exact hit on the
 * composite primary key.
 */
async function ownersOf(env: Bindings, keys: RespondentKey[]): Promise<Map<string, string>> {
  const where = keys.map(() => "(kind = ? AND value = ?)").join(" OR ");
  const res = await env.DB.prepare(
    `SELECT kind, value, respondent_id FROM respondent_keys WHERE ${where}`,
  )
    .bind(...keys.flatMap((k) => [k.kind, k.value]))
    .all<{ kind: string; value: string; respondent_id: string }>();
  const found = new Map<string, string>();
  for (const r of res.results ?? []) found.set(`${r.kind}|${r.value}`, r.respondent_id);
  return found;
}

/**
 * Fold every losing row into the survivor.
 *
 * The survivor is the one seen first, so an id that has been around longest —
 * and is therefore the one most likely to be stamped on responses already, or
 * quoted somewhere outside this database — is the one that continues to exist.
 *
 * `respondent_keys` is repointed rather than followed at read time, so a key row
 * always names a live respondent and no lookup ever has to chase a chain of
 * tombstones. The tombstone is only for an id somebody else is still holding.
 */
async function mergeInto(env: Bindings, survivor: string, losers: string[]): Promise<void> {
  const now = Date.now();
  const statements = [
    env.DB.prepare(`UPDATE respondent_keys SET respondent_id = ?1 WHERE respondent_id IN (SELECT value FROM json_each(?2))`)
      .bind(survivor, JSON.stringify(losers)),
    env.DB.prepare(`UPDATE submissions SET respondent_id = ?1 WHERE respondent_id IN (SELECT value FROM json_each(?2))`)
      .bind(survivor, JSON.stringify(losers)),
    /*
      The survivor inherits the whole span, not just its own. Somebody first
      seen in March on a phone and in September on a laptop has been around
      since March, and the merge is the moment that becomes knowable.
    */
    env.DB.prepare(
      `UPDATE respondents SET
         first_seen_at = MIN(first_seen_at, COALESCE((SELECT MIN(first_seen_at) FROM respondents WHERE id IN (SELECT value FROM json_each(?2))), first_seen_at)),
         last_seen_at = MAX(last_seen_at, COALESCE((SELECT MAX(last_seen_at) FROM respondents WHERE id IN (SELECT value FROM json_each(?2))), last_seen_at)),
         display_name = COALESCE(display_name, (SELECT display_name FROM respondents WHERE id IN (SELECT value FROM json_each(?2)) AND display_name IS NOT NULL LIMIT 1)),
         email = COALESCE(email, (SELECT email FROM respondents WHERE id IN (SELECT value FROM json_each(?2)) AND email IS NOT NULL LIMIT 1)),
         phone = COALESCE(phone, (SELECT phone FROM respondents WHERE id IN (SELECT value FROM json_each(?2)) AND phone IS NOT NULL LIMIT 1))
       WHERE id = ?1`,
    ).bind(survivor, JSON.stringify(losers)),
    env.DB.prepare(
      `UPDATE respondents SET merged_into = ?1, last_seen_at = ?3 WHERE id IN (SELECT value FROM json_each(?2))`,
    ).bind(survivor, JSON.stringify(losers), now),
  ];
  await env.DB.batch(statements);
}

/**
 * Recognise this person, creating or merging as the identifiers require.
 *
 * Returns the respondent id, or null when the visit offered nothing to
 * recognise anybody by — a headless API caller who volunteered no identity and
 * has no browser. Null rather than a fresh row every time, because a table
 * where every anonymous request is a new "person" makes the count of people
 * meaningless, which is the number this exists to produce.
 *
 * Never throws. A response that failed to save because we could not work out
 * who its author was would be a much worse trade than an unattributed response.
 */
export async function resolveRespondent(
  env: Bindings,
  input: RespondentSighting,
): Promise<string | null> {
  const keys = keysOf(input);
  if (keys.length === 0) return null;

  try {
    const now = Date.now();
    const owners = await ownersOf(env, keys);
    const distinct = [...new Set(owners.values())];

    let id: string;
    if (distinct.length === 0) {
      id = newRespondentId();
      await env.DB.prepare(
        `INSERT INTO respondents (id, display_name, email, phone, first_seen_at, last_seen_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?5)`,
      )
        .bind(id, input.name ?? null, input.email?.trim().toLowerCase() ?? null, input.phone ?? null, now)
        .run();
    } else {
      /*
        The oldest wins. Sorting by `first_seen_at` and breaking ties on the id
        keeps the choice deterministic, so two concurrent visits that both
        decide to merge the same pair pick the same survivor and the second one
        is a no-op rather than a fight.
      */
      const rows = await env.DB.prepare(
        `SELECT id, first_seen_at FROM respondents WHERE id IN (SELECT value FROM json_each(?1)) ORDER BY first_seen_at ASC, id ASC`,
      )
        .bind(JSON.stringify(distinct))
        .all<{ id: string; first_seen_at: number }>();
      const ordered = (rows.results ?? []).map((r) => r.id);
      id = ordered[0] ?? distinct[0]!;
      const losers = ordered.slice(1);
      if (losers.length > 0) await mergeInto(env, id, losers);

      await env.DB.prepare(
        `UPDATE respondents SET
           last_seen_at = MAX(last_seen_at, ?2),
           display_name = COALESCE(display_name, ?3),
           email = COALESCE(email, ?4),
           phone = COALESCE(phone, ?5)
         WHERE id = ?1`,
      )
        .bind(id, now, input.name ?? null, input.email?.trim().toLowerCase() ?? null, input.phone ?? null)
        .run();
    }

    /*
      Attach whatever this visit proved that we did not already know — the
      second device, the sign-in on a browser we had only seen anonymously.
      `DO NOTHING` because another request may have written the same key a
      moment ago, and the row it wrote is as good as the one we would have.
    */
    const missing = keys.filter((k) => !owners.has(`${k.kind}|${k.value}`));
    if (missing.length > 0) {
      await env.DB.batch(
        missing.map((k) =>
          env.DB
            .prepare(
              `INSERT INTO respondent_keys (kind, value, respondent_id, created_at)
               VALUES (?1, ?2, ?3, ?4) ON CONFLICT (kind, value) DO NOTHING`,
            )
            .bind(k.kind, k.value, id, now),
        ),
      );
    }

    return id;
  } catch (err) {
    console.error("respondent_resolve_failed", err);
    return null;
  }
}
