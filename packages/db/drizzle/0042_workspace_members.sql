-- Per-workspace access. An organization's owners and admins still reach every
-- workspace; everyone else reaches only the workspaces listed here, with the
-- role written on the row. Keyed on the membership, not the user, so removing
-- someone from the organization removes every grant with it.
CREATE TABLE `workspace_members` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL,
  `member_id` text NOT NULL,
  `role` text NOT NULL CHECK (`role` IN ('editor', 'viewer')),
  `created_by` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `uq_workspace_members` ON `workspace_members` (`workspace_id`, `member_id`);
CREATE INDEX `idx_workspace_members_member` ON `workspace_members` (`member_id`);

-- The workspaces an invitation will grant once it is accepted.
CREATE TABLE `invitation_workspaces` (
  `invitation_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `role` text NOT NULL CHECK (`role` IN ('editor', 'viewer')),
  PRIMARY KEY (`invitation_id`, `workspace_id`),
  FOREIGN KEY (`invitation_id`) REFERENCES `invitations`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);

-- Nobody loses access on the day this ships: every non-admin member gets every
-- workspace in their organization, at the role they already held org-wide.
-- `member` was Better Auth's default and has always meant editor here.
INSERT INTO `workspace_members` (`id`, `workspace_id`, `member_id`, `role`, `created_by`, `created_at`)
SELECT 'wm_' || lower(hex(randomblob(12))), w.id, m.id,
       CASE WHEN m.role = 'viewer' THEN 'viewer' ELSE 'editor' END,
       NULL, CAST(strftime('%s', 'now') AS integer) * 1000
  FROM `members` m
  JOIN `workspaces` w ON w.organization_id = m.organization_id
 WHERE m.role IN ('editor', 'viewer', 'member');

-- Invitations still waiting get the same, so accepting one keeps meaning what
-- it meant when it was sent.
INSERT INTO `invitation_workspaces` (`invitation_id`, `workspace_id`, `role`)
SELECT i.id, w.id, CASE WHEN i.role = 'viewer' THEN 'viewer' ELSE 'editor' END
  FROM `invitations` i
  JOIN `workspaces` w ON w.organization_id = i.organization_id
 WHERE i.status = 'pending' AND i.role IN ('editor', 'viewer', 'member');
