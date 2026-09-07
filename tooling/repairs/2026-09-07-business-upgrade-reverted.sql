-- Repair: org_d40ea4bb paid for Business twice and was left on Pro both times.
--
-- 2026-09-06 23:17:33  change-plan → Business MONTHLY; subscription.updated wrote
--                      plan_id = 'business' correctly.
-- 2026-09-06 23:17:54  subscription.renewed resolved the plan from the ORIGINAL
--                      checkout's metadata — planId: "pro" — and put it straight back.
-- 2026-09-06 23:17:55  payment.succeeded, $73.22.
-- 2026-09-06 23:39:01  change-plan → Business YEARLY. Second attempt, same bug.
-- 2026-09-06 23:39:15  payment.succeeded, $679.73.
--
-- Dodo is billing pdt_0NmHTTgFZ3u00c4cDafet (Business yearly). We said Pro monthly.
-- The handler bug is fixed and deployed; this restores the row it already cost.
--
-- The product guard is not decoration. The first version of this file named the monthly
-- product, and by the time it ran the subscription had moved to yearly — so it matched
-- nothing and wrote nothing, which is exactly what it should do rather than grant a plan
-- on a stale assumption.
--
-- Apply:  pnpm --filter @repo/api exec wrangler d1 execute chatform --remote \
--           --file ../../tooling/repairs/2026-09-07-business-upgrade-reverted.sql
-- Then:   pnpm --filter @repo/api exec wrangler kv key delete ent:org_d40ea4bb \
--           --namespace-id a72116dbd29c4e07b7d887272c1e999e --remote

UPDATE subscriptions
   SET plan_id = 'business',
       cycle = 'yearly',
       updated_at = unixepoch() * 1000
 WHERE dodo_subscription_id = 'sub_0NmrYOfkCIgjEqQGP8SQc'
   AND organization_id = 'org_d40ea4bb'
   AND dodo_product_id = 'pdt_0NmHTTgFZ3u00c4cDafet';
