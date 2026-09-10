-- Schedule the reminders that two earlier states of the form never wrote.
--
-- Form: frm_a90fed423354 "Campus Catalyst 2026 - Internal SIH Hackathon
-- Registration" (org_d40ea4bb). A live event: registration closes 16 September,
-- so a nudge is still worth sending to everyone who signed in and stopped.
--
-- Seventeen abandoned responses carry a `meta.followUpSkip` and no row in
-- `followups` at all, in two cohorts:
--
--   disabled    (10 rows, 09 Sept 17:28 UTC -> 10 Sept 04:01 UTC)
--               `settings.followUp.enabled` was false when they abandoned. The
--               author turned the sequence on at ~04:30 UTC on the 10th, and
--               enabling it does not reach backwards.
--
--   no_answers  (7 rows, 10 Sept 04:34 UTC -> 07:42 UTC)
--               The bug fd95735 fixed. `scheduleInner` tested "no answers"
--               before it resolved the address, so a respondent who cleared the
--               Google sign-in gate and then answered nothing was dropped —
--               despite the sign-in having just handed us a verified address.
--               Fixed and deployed between 07:42 and 09:43 UTC; every response
--               abandoned after that scheduled correctly.
--
-- Both cohorts pass every gate in `scheduleInner` as the form stands today,
-- checked by hand before writing this:
--
--   published version    ver_989bbb0f1cb7 (v35), followUp.enabled = true
--   entitlement          org is on `business`, subscription active
--   postal address       set on the organization
--   opt-out              followup_opt_out = 0 on every session
--   address              respondent_email present on all 17 -> source `identity`
--   suppressions         the table holds no row for this org and none global
--   holdout              holdoutPercent = 0, so no arm to assign
--   close_at             null, so no step can land after the door is locked
--
-- WHAT IS DELIBERATELY NOT THE ORIGINAL SCHEDULE
--
-- The configured sequence is abandonment + 4h and + 24h. Every one of those
-- times is already in the past, so writing them as configured would have the
-- next sweep enqueue both steps of all seventeen in the same tick — two
-- messages arriving together, which reads as a mistake to the person receiving
-- them. Step 1 therefore goes out on the next sweep and step 2 twenty hours
-- later, which is the gap the author configured between them.
--
-- Scoped so a re-run is a no-op and so responses still arriving are left alone:
-- `NOT EXISTS (... followups ...)` skips anything already scheduled, and
-- `ON CONFLICT (submission_id, step) DO NOTHING` is the second lock on that.
--
-- Apply:  pnpm --filter @repo/api exec wrangler d1 execute chatform --remote \
--           --file ../../tooling/repairs/2026-09-10-followup-backfill-sih.sql

-- Step 1: due immediately; the */5 cron picks it up on the next tick.
INSERT INTO followups
  (id, submission_id, form_id, organization_id, channel, address, address_source,
   step, status, reason, scheduled_at, created_at)
SELECT 'flw_' || lower(hex(randomblob(10))),
       s.id, s.form_id, s.organization_id, 'email',
       lower(trim(s.respondent_email)), 'identity',
       1, 'scheduled', NULL,
       CAST(strftime('%s','now') AS INTEGER) * 1000,
       CAST(strftime('%s','now') AS INTEGER) * 1000
  FROM submissions s
 WHERE s.form_id = 'frm_a90fed423354'
   AND s.status = 'abandoned'
   AND s.is_test = 0
   AND s.respondent_email IS NOT NULL
   AND instr(s.respondent_email, '@') > 1
   AND json_extract(s.meta, '$.followUpSkip') IN ('disabled', 'no_answers')
   AND NOT EXISTS (SELECT 1 FROM followups fu WHERE fu.submission_id = s.id)
   AND COALESCE((SELECT cs.followup_opt_out FROM chat_sessions cs WHERE cs.id = s.session_id), 0) = 0
   AND NOT EXISTS (
         SELECT 1 FROM email_suppressions es
          WHERE es.address = lower(trim(s.respondent_email))
            AND (es.organization_id IS NULL OR es.organization_id = s.organization_id))
    ON CONFLICT (submission_id, step) DO NOTHING;

-- Step 2: twenty hours after step 1, the interval the sequence configures.
INSERT INTO followups
  (id, submission_id, form_id, organization_id, channel, address, address_source,
   step, status, reason, scheduled_at, created_at)
SELECT 'flw_' || lower(hex(randomblob(10))),
       s.id, s.form_id, s.organization_id, 'email',
       f1.address, 'identity',
       2, 'scheduled', NULL,
       f1.scheduled_at + 20 * 3600 * 1000,
       CAST(strftime('%s','now') AS INTEGER) * 1000
  FROM submissions s
  JOIN followups f1 ON f1.submission_id = s.id AND f1.step = 1
 WHERE s.form_id = 'frm_a90fed423354'
   AND json_extract(s.meta, '$.followUpSkip') IN ('disabled', 'no_answers')
   AND NOT EXISTS (SELECT 1 FROM followups fu WHERE fu.submission_id = s.id AND fu.step = 2)
    ON CONFLICT (submission_id, step) DO NOTHING;

-- Clear the excuse, exactly as the success path of `scheduleInner` does: these
-- responses are scheduled now, so the results table must stop explaining why
-- they were not.
UPDATE submissions
   SET meta = json_remove(COALESCE(meta, '{}'), '$.followUpSkip')
 WHERE form_id = 'frm_a90fed423354'
   AND json_extract(meta, '$.followUpSkip') IN ('disabled', 'no_answers')
   AND EXISTS (SELECT 1 FROM followups fu WHERE fu.submission_id = submissions.id);
