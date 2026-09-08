-- The one workspace every organization already has, given a name people will see.
--
-- `workspaces` and `forms.workspace_id` have existed since the first migration,
-- but nothing ever created a second row and nothing ever displayed the first —
-- `requireWorkspace` made one called 'Default' on demand and every form in the
-- account hung off it. Now that the switcher lists them, 'Default' is the label
-- a user reads on their own forms the first time they open the dashboard.
--
-- Only the untouched rows are renamed. `name = 'Default'` and `slug = 'default'`
-- together are the fingerprint of a row this codebase wrote unattended; anything
-- else was typed by somebody and is theirs.
UPDATE workspaces
   SET name = 'My Workspace', slug = 'my-workspace'
 WHERE name = 'Default'
   AND slug = 'default'
   AND NOT EXISTS (
     SELECT 1 FROM workspaces other
      WHERE other.organization_id = workspaces.organization_id
        AND other.slug = 'my-workspace'
   );
