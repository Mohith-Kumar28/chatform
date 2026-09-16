-- Credit the reminders that history never credited.
--
-- `creditFollowUpRecovery` used to require a click: unless we had seen the
-- resume link opened, a completion belonged to nobody. Almost nobody finishes a
-- form in the tab they opened from an inbox — they read the mail on a phone and
-- answer on a laptop that evening — so the click was missing for most of the
-- responses reminders actually brought back, and `recovered_at` stayed null on
-- all of them.
--
-- The rule is now a window: a reminder gets the credit if the response was
-- finished within 24 hours of it going out (or of the link being opened, where
-- one was). Without this backfill the change would only apply to completions
-- from today onwards, and the analytics page would keep reporting the near-zero
-- recovery figure it reports now — which an author reads as the feature not
-- working rather than as the measurement having been replaced.
--
-- Nothing is invented here. Every row this credits has a real `sent_at`, and a
-- real completion inside the window after it; the only thing that was missing
-- was a click we had made mandatory.

UPDATE followups
   SET recovered_at = (
         SELECT s.completed_at FROM submissions s WHERE s.id = followups.submission_id
       )
 WHERE status = 'sent'
   AND recovered_at IS NULL
   -- Completed, and with a completion time to measure against. An abandoned or
   -- screened-out response is not a recovery, and neither is a completion whose
   -- timestamp predates the column.
   AND EXISTS (
         SELECT 1 FROM submissions s
          WHERE s.id = followups.submission_id
            AND s.status = 'completed'
            AND s.completed_at IS NOT NULL
       )
   -- The winning row for this response: the reminder whose last touch — the
   -- send, or the click if there was one — is the most recent of those inside
   -- the window. Exactly one, because three messages to one person recovered
   -- one response, not three, and this figure gets quoted.
   AND id = (
         SELECT x.id FROM followups x
           JOIN submissions s ON s.id = x.submission_id
          WHERE x.submission_id = followups.submission_id
            AND x.status = 'sent'
            AND max(coalesce(x.clicked_at, 0), coalesce(x.sent_at, 0))
                  BETWEEN s.completed_at - 86400000 AND s.completed_at
          ORDER BY max(coalesce(x.clicked_at, 0), coalesce(x.sent_at, 0)) DESC, x.step DESC
          LIMIT 1
       )
   -- And never a second credit for a response that already has one. Belt and
   -- braces: the clause above already picks one row, and re-running this file
   -- must stay a no-op.
   AND NOT EXISTS (
         SELECT 1 FROM followups y
          WHERE y.submission_id = followups.submission_id
            AND y.recovered_at IS NOT NULL
       );
