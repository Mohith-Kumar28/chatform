"""Generate the SQL that republishes the Gandhari Vidya intake with a working age branch.

Run from the repo root:

    python3 tooling/repairs/2026-09-12-gandhari-age-branch.py

Reads `2026-09-12-gandhari-age-branch.json` (the document to publish, already
validated against the engine) and writes the `.sql` beside it. That SQL, not
this script, is the record of what was applied.

The script exists for one reason: the new version has to carry the checksum
`publishFingerprint` would have given it — sha256 over `canonicalJson(doc)`, a
newline, and the plan id. A hand-typed checksum would leave the builder
claiming unpublished changes forever, because `hasUnpublishedChanges` compares
against exactly that hash. `json.dumps(sort_keys=True, separators=(",", ":"),
ensure_ascii=False)` produces the same bytes as the TypeScript canonicaliser
for a parsed document: sorted keys, no whitespace, non-ASCII left as itself.
"""

import hashlib
import json
import pathlib
import time
import uuid

FORM = "frm_a3068404f79c"
ORG = "org_d40ea4bb"
# The account that published v4; a republish of their form stays theirs.
AUTHOR = "KH6iGhRgHVop6pJWw4KYAyyvwHF8g5ea"
PLAN = "business"
VERSION = 5
NOTE = "Age branch rewritten as one 6-25 route"

here = pathlib.Path(__file__).parent
doc = (here / "2026-09-12-gandhari-age-branch.json").read_text()
canonical = json.dumps(json.loads(doc), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
checksum = hashlib.sha256(f"{canonical}\n{PLAN}".encode("utf-8")).hexdigest()

now = int(time.time() * 1000)
ver_id = "ver_" + uuid.uuid4().hex[:12]
act_id = "fac_" + uuid.uuid4().hex[:12]
q = lambda s: "'" + str(s).replace("'", "''") + "'"

sql = f"""-- Republish "Gandhari Vidya Intake & Interest Form" ({FORM}, {ORG}) with an
-- age branch that routes the people it was written for.
--
-- v4 held three routes off "What is the participant's age?", read in order:
--
--     1. >= 6   -> q_awareness        (the eligible path)
--     2. <  6   -> q_knows_referral   (the referral path)
--     3. >  25  -> q_knows_referral
--
-- The first match wins, so route 1 answered for the over-25s as well and route
-- 3 could never run: a 40-year-old was carried through as eligible.
--
-- The draft held a later, unpublished edit that was worse: the ">= 6" route
-- deleted and the other two loosened to "> 6" and "< 25", both pointing at the
-- referral question, which sent EVERYONE there. That draft is replaced here,
-- not published; it is kept beside this file as
-- 2026-09-12-gandhari-age-branch.previous-draft.json.
--
-- v{VERSION} says the range in one route, which the builder can now express:
--
--     1. >= 6 AND <= 25 -> q_awareness
--        otherwise      -> q_knows_referral   (falls through, as it always did)
--
-- Checked against the engine before writing: 3, 5 -> referral; 6, 7, 23, 25 ->
-- awareness; 26, 40, 99 -> referral.
--
-- Not fixed here, because the answer is the author's: "Referral Contact
-- Details" carries two unconditional routes (rl_1b4ee8a6 -> q_curiosity_focus,
-- rl_f55cd179 -> end_referral_thanks). The first wins, so the referral
-- thank-you ending has never been reached. The new `unreachable_route` lint
-- reports it in the builder.
--
-- Generated {time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now / 1000))} by
-- tooling/repairs/2026-09-12-gandhari-age-branch.py. Applied with:
--   pnpm --filter @repo/api exec wrangler d1 execute chatform --remote \\
--     --file ../../tooling/repairs/2026-09-12-gandhari-age-branch.sql

INSERT INTO form_versions (id, form_id, version, schema_json, theme_json, settings_json, checksum, note, published_at, created_by, created_at)
SELECT {q(ver_id)}, {q(FORM)}, {VERSION}, {q(doc)}, theme_json, settings_json, {q(checksum)}, {q(NOTE)}, {now}, created_by, {now}
  FROM forms WHERE id = {q(FORM)};

-- The draft becomes what was published, so the builder opens on the live flow
-- rather than on the half-finished edit it replaced.
UPDATE forms
   SET working_schema = {q(doc)},
       working_revision = working_revision + 1,
       status = 'published',
       active_version_id = {q(ver_id)},
       updated_at = {now}
 WHERE id = {q(FORM)};

-- Every edit still marked unpublished belongs to this version now, exactly as
-- `stampVersionStatement` does it on the publish path.
UPDATE form_activity SET form_version_id = {q(ver_id)}
 WHERE form_id = {q(FORM)} AND form_version_id IS NULL;

INSERT INTO form_activity (id, form_id, organization_id, form_version_id, kind, actor_type, actor_id, actor_label, source, summary, changes, change_count, created_at, updated_at)
VALUES ({q(act_id)}, {q(FORM)}, {q(ORG)}, {q(ver_id)}, 'published', 'user', {q(AUTHOR)}, NULL, 'builder', {q(f"Published version {VERSION} — {NOTE}")}, NULL, 0, {now}, {now});
"""

(here / "2026-09-12-gandhari-age-branch.sql").write_text(sql)
print(f"version  {ver_id}\nchecksum {checksum}\ndoc      {len(doc)} bytes")
