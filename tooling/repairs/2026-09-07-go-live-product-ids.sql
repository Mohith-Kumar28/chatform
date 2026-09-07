-- Point the plan catalogue at Dodo LIVE products.
--
-- Production has been transacting in Dodo test mode: the ids in `plans` were the
-- test-mode products, so `dodoBase()` (test host unless DODO_ENVIRONMENT === "live")
-- and the catalogue agreed with each other and nobody noticed. Live mode had no
-- products at all until 2026-09-07.
--
-- ORDER MATTERS. These ids only resolve against the live API, so this file and the
-- DODO_ENVIRONMENT / DODO_API_KEY switch are one change in two places:
--
--   1. wrangler secret put DODO_API_KEY          (live key)
--   2. wrangler secret put DODO_WEBHOOK_SECRET   (live endpoint's signing secret)
--   3. wrangler secret put DODO_ENVIRONMENT      -> live
--   4. this file
--   5. GET /api/billing/config-check              (should report ok)
--
-- Run 4 immediately after 3. In between, checkout 404s: live key against test ids.
-- Nothing is lost either way — there are no live customers yet.
--
-- Rollback, if the live switch has to be undone, is the same file with the test ids:
--   pro      monthly pdt_0NmHTTaWTtrASRA1M25Y5   yearly pdt_0NmHTTc5x2DkD86HlMs0B
--   business monthly pdt_0NmHTTdrTzJ7AbZaoXpXh   yearly pdt_0NmHTTgFZ3u00c4cDafet
--
-- Apply:  pnpm --filter @repo/api exec wrangler d1 execute chatform --remote \
--           --file ../../tooling/repairs/2026-09-07-go-live-product-ids.sql

UPDATE plans
   SET dodo_product_monthly_id = 'pdt_0Nn4KGcrS5d4iD9eiA0IB',
       dodo_product_yearly_id  = 'pdt_0Nn4KGZpLCUKGSUmbIDmx'
 WHERE id = 'pro';

UPDATE plans
   SET dodo_product_monthly_id = 'pdt_0Nn4KGWKVfzZ3VQYnyGB1',
       dodo_product_yearly_id  = 'pdt_0Nn4KGTVzrxr6gR7CWHEP'
 WHERE id = 'business';
