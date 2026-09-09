-- Puts the founder accounts' orgs on the Business plan for real, via a manually
-- inserted `subscriptions` row (no Dodo checkout) — the manual-attribution path
-- docs/BILLING-RUNBOOK.md §4 also documents ("Attribute it manually with an
-- INSERT INTO subscriptions"). Business is the top plan tier and already grants
-- every feature key that exists, so this alone is enough: no entitlement_overrides
-- needed, and none are left lying around on top of it.
--
-- `planId`/`planName` (what the dashboard's Upgrade button and plan pill actually
-- read) come only from `subscriptions`, never from entitlement_overrides — see
-- effectivePlan() in packages/entitlements/src/resolve.ts. That's why an
-- overrides-only grant left the UI still showing "Upgrade" even with every
-- feature unlocked underneath.
--
-- Apply with:
--   pnpm --filter @repo/api exec wrangler d1 execute chatform --remote --file ../../tooling/grant-founder-access.sql
-- Then bust the cache (or wait up to 300s) for each org id printed by the final SELECT:
--   pnpm --filter @repo/api exec wrangler kv key delete --binding KV_CONFIG "ent:<org_id>" --remote

-- Remove any stale entitlement_overrides from the earlier attempt, so nothing is
-- layered on top of the real subscription.
DELETE FROM entitlement_overrides WHERE reason = 'founder account';

INSERT INTO subscriptions (
  id, organization_id, plan_id, dodo_subscription_id, cycle, status,
  current_period_start, current_period_end, seats, created_at, updated_at
)
SELECT
  'sub_' || lower(hex(randomblob(8))),
  m.organization_id,
  'business',
  'internal_manual_' || m.organization_id,
  'yearly',
  'active',
  unixepoch() * 1000,
  (unixepoch() + 10 * 365 * 24 * 60 * 60) * 1000,
  5,
  unixepoch() * 1000,
  unixepoch() * 1000
  FROM members m
  JOIN users u ON u.id = m.user_id
 WHERE u.email IN ('mdayanbag@gmail.com', 'murugan28aug@gmail.com', 'mohithkumar808@gmail.com')
   AND m.role LIKE '%owner%'
ON CONFLICT (dodo_subscription_id) DO UPDATE SET
  plan_id = excluded.plan_id, status = excluded.status,
  current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
  seats = excluded.seats, updated_at = excluded.updated_at;

SELECT DISTINCT u.email, m.organization_id
  FROM members m JOIN users u ON u.id = m.user_id
 WHERE u.email IN ('mdayanbag@gmail.com', 'murugan28aug@gmail.com', 'mohithkumar808@gmail.com') AND m.role LIKE '%owner%';
