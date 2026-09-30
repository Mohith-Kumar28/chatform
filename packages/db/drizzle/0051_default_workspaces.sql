-- Every organization opens with a workspace now: sign-up and "New
-- organization" both create one (see `createDefaultOrg` and
-- `afterCreateOrganization` in apps/api/src/lib/auth.ts). This gives the
-- organizations made before that the same starting point, named after the
-- owner the way the "Name your workspace" screen used to suggest.
INSERT INTO `workspaces` (`id`, `organization_id`, `name`, `slug`, `created_by`, `created_at`)
SELECT
  'ws_' || lower(hex(randomblob(6))),
  o.`id`,
  CASE
    WHEN trim(coalesce(u.`name`, '')) = '' THEN 'My Workspace'
    ELSE substr(substr(trim(u.`name`), 1, instr(trim(u.`name`) || ' ', ' ') - 1) || '''s Workspace', 1, 60)
  END,
  'workspace',
  u.`id`,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM `organizations` o
LEFT JOIN `members` m ON m.`id` = (
  SELECT m2.`id` FROM `members` m2
   WHERE m2.`organization_id` = o.`id` AND m2.`role` = 'owner'
   ORDER BY m2.`created_at` LIMIT 1
)
LEFT JOIN `users` u ON u.`id` = m.`user_id`
WHERE NOT EXISTS (SELECT 1 FROM `workspaces` w WHERE w.`organization_id` = o.`id`);
