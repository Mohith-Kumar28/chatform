-- The platform's own numbers, pre-aggregated.
--
-- Every other read path in this codebase is org-scoped by construction, which is
-- exactly right for customers and useless for the one question the founders have:
-- how is the whole thing doing. Answering that live would mean a cross-tenant
-- GROUP BY over `submissions` on every page load, and D1 has a per-query budget
-- that such a scan will eventually blow. So the counting happens on the cron and
-- the console reads rows.
--
-- `platform_metrics_daily` is deliberately long and narrow — (date, metric,
-- dimension) → value. A new measure is a new row, never a migration, which
-- matters because the list of things worth watching changes far more often than
-- the schema should. `dimension` is '' for a plain daily total and carries the
-- breakout otherwise: a plan id, a block type, a model slug, a response source.
CREATE TABLE IF NOT EXISTS platform_metrics_daily (
  date      TEXT NOT NULL,
  metric    TEXT NOT NULL,
  dimension TEXT NOT NULL DEFAULT '',
  value     REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (date, metric, dimension)
) WITHOUT ROWID;
--> statement-breakpoint
-- Reading a whole metric across the range is the only access pattern that is not
-- already served by the primary key's leading `date`.
CREATE INDEX IF NOT EXISTS idx_pmd_metric_date ON platform_metrics_daily(metric, date);
--> statement-breakpoint

-- What people are actually asking in their forms.
--
-- Questions live inside `forms.working_schema` as a JSON document, so there is no
-- way to ask "which question is most common" in SQL. This table is that answer,
-- rebuilt daily by walking the documents in batches.
--
-- Keyed on the normalised text so "What's your email?" and "what's your email?"
-- are one row. `sample_text` keeps one real casing so the console can render
-- something a human wrote rather than a lowercased slug. `org_count` is what
-- makes a row safe to read as a product signal instead of a peek at one
-- customer's form: a question asked by thirty accounts is a pattern.
CREATE TABLE IF NOT EXISTS platform_question_stats (
  norm_text   TEXT PRIMARY KEY,
  sample_text TEXT NOT NULL,
  block_type  TEXT NOT NULL,
  form_count  INTEGER NOT NULL DEFAULT 0,
  org_count   INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_pqs_forms ON platform_question_stats(form_count DESC);
