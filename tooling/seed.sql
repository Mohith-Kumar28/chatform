-- chatform local dev seed: test org + one published waitlist form
-- run: pnpm --filter @repo/api exec wrangler d1 execute chatform --local --file ../../tooling/seed.sql
INSERT INTO organizations (id, name, slug, created_at) VALUES ('org_test01','Test Org','test-org',1787544000000) ON CONFLICT DO NOTHING;
INSERT INTO users (id, name, email, created_at, updated_at) VALUES ('usr_test001','Test User','test@x.co',1787544000000,1787544000000) ON CONFLICT DO NOTHING;
INSERT INTO workspaces (id, organization_id, name, slug, created_at) VALUES ('ws_test0001','org_test01','Default','default',1787544000000) ON CONFLICT (organization_id, slug) DO NOTHING;
INSERT INTO forms (id, organization_id, workspace_id, title, slug, status, working_schema, fingerprint_salt, created_at, updated_at)
VALUES ('frm_test00001','org_test01','ws_test0001','Waitlist','test-waitlist','published','','salt123',1787544000000,1787544000000)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO form_versions (id, form_id, version, schema_json, checksum, created_at)
VALUES ('ver_test0001','frm_test00001',1,'{"schemaVersion":1,"title":"Product Waitlist","blocks":[{"id":"blk_welcome1","ref":"welcome","type":"welcome","title":"Hey! Want early access?","required":false},{"id":"blk_email001","ref":"q_email","type":"email","title":"What''s your email?","required":true},{"id":"blk_role001","ref":"q_role","type":"single_select","title":"What describes you?","required":true,"options":[{"id":"opt_founder1","label":"Founder"},{"id":"opt_dev00001","label":"Developer"}]},{"id":"blk_rate001","ref":"q_rate","type":"rating","title":"How excited are you?","required":true,"scale":5,"shape":"star"}],"endings":[{"id":"end_main001","ref":"end_thanks","title":"You''re in! 🎉","bodyMd":"See you soon.","redirectDelaySec":5,"showSummary":false}],"logic":[],"endingRules":[],"variables":[],"hiddenFields":[],"settings":{},"theme":{}}','abc',1787544000000)
ON CONFLICT (form_id, version) DO NOTHING;
UPDATE forms SET active_version_id='ver_test0001' WHERE id='frm_test00001' AND active_version_id IS NULL;
