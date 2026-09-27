-- Why a model call failed, next to the `status = 'error'` that already said it
-- did. `credits_exhausted` | `rate_limited` | `timeout` | `provider_error` |
-- `no_output` | `unknown`; see apps/api/src/lib/ai-failure.ts. Respondents never
-- see these (every call falls back to the author's wording), so this is the
-- only place they show.
ALTER TABLE `ai_generations` ADD `error_code` text;
--> statement-breakpoint
ALTER TABLE `ai_generations` ADD `error_message` text;
--> statement-breakpoint
-- The per-form analytics count: failures for one form over a period.
CREATE INDEX `idx_ai_gen_form_errors` ON `ai_generations` (`form_id`,`created_at`) WHERE `status` = 'error';
--> statement-breakpoint
-- What Cloudflare Turnstile said when the session opened: `passed`, `unverified`
-- (no token, or Cloudflare could not be reached; let in and labelled), or `off`
-- (captcha disabled, or an API-key caller). NULL on sessions older than this.
ALTER TABLE `chat_sessions` ADD `bot_check` text;
