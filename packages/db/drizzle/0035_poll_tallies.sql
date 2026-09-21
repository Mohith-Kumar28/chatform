-- How many people picked each option of a `poll` block.
--
-- A poll is the one question that answers back: tap an option and you are shown
-- how everybody else answered. That is a read on the respondent's path, taken
-- immediately after every poll answer, which is what rules out counting it from
-- the answers themselves. Deriving it there would mean scanning a form's whole
-- history and extracting JSON from every row to draw four bars, with the person
-- who just answered waiting for it.
--
-- So it is a counter, and like every counter it can drift. `submission_answers`
-- stays the source of truth and this is a cache that can be rebuilt from it.
-- Verified against production on 2026-09-21; it reproduced the live counts
-- exactly:
--
--   INSERT INTO poll_tallies (form_id, block_ref, option_id, count, updated_at)
--   SELECT a.form_id, a.block_ref, json_extract(a.value_json, '$'), COUNT(*),
--          unixepoch() * 1000
--     FROM submission_answers a
--     JOIN submissions s ON s.id = a.submission_id
--    WHERE a.form_id = ? AND a.block_type = 'poll' AND s.is_test = 0
--    GROUP BY 1, 2, 3;
--
-- A poll's `value_json` is a JSON string, so the `'$'` extraction is what turns
-- "\"opt_x\"" back into the option id the counter is keyed by.
--
-- ── Why block_ref and not a block id ──
--
-- A ref is the author's name for a question and survives republishing; a block
-- id does not have to. A poll that kept its ref across three published versions
-- is one poll, and its tally should not reset because the document was saved.
--
-- ── What is deliberately not here ──
--
-- No respondent id, so this cannot say who picked what: `submission_answers`
-- already answers that, for the one person allowed to ask it. And no row is
-- written by a preview or a test session, for the same reason neither writes a
-- response: an author trying their own form must not be able to stuff a poll
-- they are about to publish.
CREATE TABLE `poll_tallies` (
	`form_id` text NOT NULL,
	`block_ref` text NOT NULL,
	`option_id` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`form_id`, `block_ref`, `option_id`),
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade
);
