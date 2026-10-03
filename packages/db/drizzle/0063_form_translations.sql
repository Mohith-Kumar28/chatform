-- A form in more than one language.
--
-- A translation memory rather than a translated copy of each form: one row per
-- (form, language, source string). The key is the source text itself, hashed,
-- so nothing here names a block or an option. Edit a question and it stops
-- matching its old row and is translated again; leave it alone and the row is
-- reused across every version the form is ever published as. That is what lets
-- translations stay out of the form document, where they would have changed
-- every checksum and every "unpublished changes" verdict.
--
-- form_id = '' holds chatform's own interface text (Send, Skip, the error
-- under a field), shared by every form in that language.
--
-- `edited` marks a row an author corrected by hand, which is never overwritten
-- by a later automatic translation of the same source.

CREATE TABLE `form_translations` (
  `form_id` text NOT NULL,
  `lang` text NOT NULL,
  `source_hash` text NOT NULL,
  `source` text NOT NULL,
  `text` text NOT NULL,
  `edited` integer NOT NULL DEFAULT 0,
  `updated_at` integer NOT NULL,
  PRIMARY KEY (`form_id`, `lang`, `source_hash`)
);

-- A form that is finally deleted takes its translations with it.
CREATE TRIGGER `trg_forms_delete_translations` AFTER DELETE ON `forms`
BEGIN
  DELETE FROM `form_translations` WHERE `form_id` = OLD.`id`;
END;
