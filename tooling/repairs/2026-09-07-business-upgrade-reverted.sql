-- Repair: org_d40ea4bb paid for Business and was left on Pro.
--
-- 2026-09-06 23:17:33  change-plan moved sub_0NmrYOfkCIgjEqQGP8SQc to the Business
--                      monthly product; subscription.updated + plan_changed wrote
--                      plan_id = 'business' correctly.
-- 2026-09-06 23:17:54  subscription.renewed (the proration invoice) resolved the plan
--                      from the ORIGINAL checkout's metadata — planId: "pro" — and put
--                      plan_id straight back to 'pro'.
-- 2026-09-06 23:17:55  payment.succeeded, $73.22.
--
-- The handler bug is fixed in apps/api/src/routes/billing.ts (plan now resolves from
-- dodo_product_id). This restores the one account it already cost.
--
-- Apply:  pnpm --filter @repo/api exec wrangler d1 execute chatform --remote \
--           --file ../../tooling/repairs/2026-09-07-business-upgrade-reverted.sql
-- Then:   pnpm --filter @repo/api exec wrangler kv key delete ent:org_d40ea4bb \
--           --namespace-id a72116dbd29c4e07b7d887272c1e999e --remote
--         (or just wait out the 300s entitlements cache)

UPDATE subscriptions
   SET plan_id = 'business',
       cycle = 'monthly',
       updated_at = unixepoch() * 1000
 WHERE dodo_subscription_id = 'sub_0NmrYOfkCIgjEqQGP8SQc'
   AND organization_id = 'org_d40ea4bb'
   AND dodo_product_id = 'pdt_0NmHTTdrTzJ7AbZaoXpXh';
