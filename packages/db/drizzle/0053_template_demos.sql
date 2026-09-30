-- Trying a template live on its public page (/form-templates/<slug>).
--
-- A visitor, signed in or not, can talk to any official template before
-- copying it. The conversation runs as a preview session (nothing reaches
-- submissions, analytics or anyone's quota), but a `chat_sessions` row still
-- needs a form and an organization to belong to. They belong to this system
-- organization, which nobody is a member of, and its one hidden form. The
-- document itself comes from `form_templates`, not from this row.

INSERT OR IGNORE INTO `organizations` (`id`, `name`, `slug`, `created_at`)
VALUES ('org_template_demos', 'Chatform template demos', 'chatform-template-demos', CAST(strftime('%s', 'now') AS INTEGER) * 1000);

INSERT OR IGNORE INTO `workspaces` (`id`, `organization_id`, `name`, `slug`, `created_at`)
VALUES ('ws_template_demos', 'org_template_demos', 'Template demos', 'template-demos', CAST(strftime('%s', 'now') AS INTEGER) * 1000);

INSERT OR IGNORE INTO `forms` (`id`, `organization_id`, `workspace_id`, `title`, `slug`, `status`, `working_schema`, `fingerprint_salt`, `created_at`, `updated_at`)
VALUES ('frm_template_demo', 'org_template_demos', 'ws_template_demos', 'Template demo', 'chatform-template-demo', 'draft', '{}', 'template-demo', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000);

-- Live tries per visitor per UTC day. The key is a salted hash of the
-- visitor's FingerprintJS device id when signed out, or of their user id when
-- signed in. Never an IP address: a campus or a mobile carrier puts thousands
-- of real people behind one.
CREATE TABLE `template_demo_quota` (
  `key_hash` text NOT NULL,
  `day` text NOT NULL,
  `count` integer DEFAULT 0 NOT NULL,
  PRIMARY KEY (`key_hash`, `day`)
);
