# Graph Report - chatform  (2026-08-28)

## Corpus Check
- 308 files · ~261,697 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2853 nodes · 5745 edges · 177 communities (145 shown, 32 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 36 edges (avg confidence: 0.7)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f088fc28`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- dashboard/dashboard.ts
- routes/ai.ts
- generated.schemas.ts
- (marketing)/page.tsx
- billing/billing.ts
- resolve.ts
- draft-normalize.ts
- blocks.ts
- 2. Admin dashboard — screen-by-screen spec
- app/layout.tsx
- Billing, Plans & Entitlements — Research + Implementation Plan
- cn
- public/public.ts
- scripts
- block-inspector.tsx
- SessionDO
- form-schema/src/index.ts
- lib/respondent-auth.ts
- routes/billing.ts
- results-client.tsx
- dashboard-content.tsx
- v1/v1.ts
- workflow-client.tsx
- billing/page.tsx
- workspace-switcher.tsx
- authorize.ts
- schema.ts
- entitlements.ts
- useBuilderStore
- 0000_common_trish_tilby.sql
- chat-client.tsx
- session-do.ts
- routes/public.ts
- FormDoc
- utils.ts
- customFetch
- compilerOptions
- dependencies
- use-chat.ts
- withQueryKey
- CHATFORM — ENGINEERING HANDOFF
- evaluate.ts
- gates.test.ts
- devDependencies
- form-schema/package.json
- block-list.tsx
- Builder Redesign — Youform-style UI/UX + Agentic Chat
- Known risks
- Billing runbook
- db/package.json
- compilerOptions
- entitlements/package.json
- provision-dodo.py
- form-generation.tsx
- share-client.tsx
- dodo.ts
- components.json
- dependencies
- CHATFORM — Implementation Plan
- scripts
- files
- tooling/package.json
- permissions.ts
- health/health.ts
- compilerOptions
- PART TWO — FRONTEND
- devDependencies
- auth.ts
- ai-bar.tsx
- share-tab.tsx
- BillingPage
- pricing/page.tsx
- tsconfig.react-lib.json
- compilerOptions
- validators.ts
- upgrade-dialog.tsx
- BuilderHeader
- db/tsconfig.json
- PART ONE — BACKEND
- scripts
- origins.ts
- api/tsconfig.json
- token-contrast.test.ts
- entitlements/tsconfig.json
- form-schema/tsconfig.json
- REBUILD.md
- Shared contract — `packages/form-schema` v2
- tooling/tsconfig.json
- product-tour.tsx
- getGetPFormsBySlugConfigQueryOptions
- getGetV1ChatSessionsBySidQueryOptions
- api/package.json
- opengraph-image.tsx
- twitter-image.tsx
- qrSvg
- getApiBillingConfigCheck
- useGetApiBillingEntitlements
- getApiBillingUsage
- getApiAuditLogsExport
- getApiAuthProviders
- useGetApiFormsByIdAnalytics
- useGetApiFormsByIdSubmissions
- getApiFormsByIdSubmissionsExport
- getApiWebhooks
- getApiWebhooksByIdDeliveries
- getGetV1FormsByIdQueryOptions
- getGetV1FormsQueryOptions
- Phase 0 — Repo hygiene and safety net (blocking, do first)
- Phase 15 — audit: what was wired, what only looked wired
- README.md
- postApiBillingPortal
- postApiBillingPreviewChange
- deleteApiFormsById
- deleteApiKeysById
- getApiFormsById
- postApiAiEditForm
- postApiAiGenerateForm
- postApiAiGenerateFormStream
- postApiFormsByIdPreviewSessions
- postApiFormsByIdPublish
- postApiTemplatesBySlugUse
- postPFormsBySlugSessions
- postPSessionsByIdUploadsByFileIdConfirm
- postPSessionsByIdUploadsIntent
- postV1ChatSessionsBySidMessages
- postV1FormsByIdChatSessions
- main
- Phase 14 — explicit submit, resubmit, and respondent authentication
- postApiBillingCheckout
- drizzle-orm
- hono
- @hono/zod-openapi
- @hono/zod-validator
- @scalar/hono-api-reference
- zod
- AGENTS.md
- eslint.config.mjs
- clsx
- cmdk
- @dagrejs/dagre
- date-fns
- @dnd-kit/core
- @dnd-kit/utilities
- lucide-react
- motion
- next
- next-themes
- qrcode-generator
- radix-ui
- react-dom
- remark-gfm
- @repo/form-schema
- sonner
- tailwind-merge
- @tanstack/react-query-devtools
- @tanstack/react-table
- @xyflow/react
- postcss.config.mjs
- eslint.base.js
- 0002_white_naoko.sql
- { signIn, signUp, signOut, useSession, useActiveOrganization, useListOrganizations }

## God Nodes (most connected - your core abstractions)
1. `cn()` - 187 edges
2. `customFetch()` - 67 edges
3. `FormDoc` - 56 edges
4. `SessionDO` - 51 edges
5. `Bindings` - 42 edges
6. `Block` - 42 edges
7. `Button()` - 40 edges
8. `useBuilderStore` - 37 edges
9. `scripts` - 28 edges
10. `FeatureKey` - 22 edges

## Surprising Connections (you probably didn't know these)
- `StoredSession` --references--> `AnswerMap`  [EXTRACTED]
  apps/api/src/do/session-do.ts → packages/form-schema/src/answers.ts
- `NormalizedBlock` --references--> `Block`  [EXTRACTED]
  apps/api/src/lib/draft-normalize.ts → packages/form-schema/src/blocks.ts
- `ToolContext` --references--> `FormDoc`  [EXTRACTED]
  apps/api/src/do/agent-tools.ts → packages/form-schema/src/form-doc.ts
- `DoSessionMeta` --references--> `RespondentIdentity`  [EXTRACTED]
  apps/api/src/do/session-do.ts → packages/form-schema/src/respondent.ts
- `SessionDO` --references--> `EvalState`  [EXTRACTED]
  apps/api/src/do/session-do.ts → packages/form-schema/src/engine/evaluate.ts

## Import Cycles
- None detected.

## Communities (177 total, 32 thin omitted)

### Community 0 - "dashboard/dashboard.ts"
Cohesion: 0.01
Nodes (181): DeleteApiFormsByIdMutationError, DeleteApiFormsByIdMutationResult, DeleteApiFormsByIdMutationVariables, deleteApiFormsByIdResponse, deleteApiFormsByIdResponse200, deleteApiFormsByIdResponseSuccess, DeleteApiKeysByIdMutationError, DeleteApiKeysByIdMutationResult (+173 more)

### Community 1 - "routes/ai.ts"
Cohesion: 0.06
Nodes (64): AppType, createApp(), Bindings, Env, ApiKeyRow, generateApiKey(), verifyApiKey(), AuthzVars (+56 more)

### Community 2 - "generated.schemas.ts"
Cohesion: 0.03
Nodes (73): DeleteApiFormsById200, DeleteApiKeysById200, DeleteApiWebhooksById200, GetApiAuditLogs200, GetApiAuditLogs200EntriesItem, GetApiAuditLogsParams, GetApiAuthOk200, GetApiAuthProviders200 (+65 more)

### Community 3 - "(marketing)/page.tsx"
Cohesion: 0.05
Nodes (49): metadata, AgentPanelPreview(), BentoCard(), BentoGrid(), ChatDemo(), Rendered, DemoTurn, HERO_SCRIPT (+41 more)

### Community 4 - "billing/billing.ts"
Cohesion: 0.03
Nodes (69): GetApiBillingConfigCheckQueryError, GetApiBillingConfigCheckQueryResult, getApiBillingConfigCheckResponse, getApiBillingConfigCheckResponse200, getApiBillingConfigCheckResponseSuccess, GetApiBillingEntitlementsQueryError, GetApiBillingEntitlementsQueryResult, getApiBillingEntitlementsResponse (+61 more)

### Community 5 - "resolve.ts"
Cohesion: 0.07
Nodes (47): brandingHiddenFor(), checkDocLimits(), clampForRuntime(), DocLimitProblem, note(), stripForPublish(), anonymousEntitlements(), MeterResult (+39 more)

### Community 6 - "draft-normalize.ts"
Cohesion: 0.07
Nodes (49): buildFlowGeneratorPrompt(), AgentTurnResult, chatModel(), DEFAULT_MODEL, DraftBlockPreview, EditDraft, extractAnswer(), ExtractionEnvelope (+41 more)

### Community 7 - "blocks.ts"
Cohesion: 0.06
Nodes (40): AddressField, AgentHints, BLOCK_TYPES, BlockBase, BlockInput, BlockType, ContactField, MatrixColumn (+32 more)

### Community 8 - "2. Admin dashboard — screen-by-screen spec"
Cohesion: 0.04
Nodes (47): 0. Product principles (design north stars), 1.1 Route map, 1.2 Navigation model, 1.3 Route group tree, 1. Information architecture & route map, 2.10 AI Generate modal (global to `/forms/new` and builder toolbar "✨ Generate"), 2.11 API keys page (`/api-keys`), 2.12 Usage & billing (+39 more)

### Community 9 - "app/layout.tsx"
Cohesion: 0.05
Nodes (34): monorepoRoot, nextConfig, generateMetadata(), getConfig(), PublicFormPage(), bricolage, inter, jetbrains (+26 more)

### Community 10 - "Billing, Plans & Entitlements — Research + Implementation Plan"
Cohesion: 0.04
Nodes (46): 0. Decisions already taken, 10. Delivery phases, 11. Open items and risks, 12. Progress log, 13. Final state, 1.1 Youform (the model we are cloning), 1.2 Typeform (the same playbook, run harder), 1.3 Dodo Payments — what the API actually looks like (+38 more)

### Community 11 - "cn"
Cohesion: 0.08
Nodes (33): Logo(), LogoMark(), COLUMNS, MarketingFooter(), LINKS, MarketingNav(), MarketingMotionConfig(), Avatar() (+25 more)

### Community 12 - "public/public.ts"
Cohesion: 0.04
Nodes (45): GetPFormsBySlugConfig404, PostPFormsBySlugSessions200, PostPFormsBySlugSessions403, PostPFormsBySlugSessions404, PostPFormsBySlugSessionsBody, PostPSessionsByIdUploadsByFileIdConfirm200, PostPSessionsByIdUploadsIntent200, PostPSessionsByIdUploadsIntentBody (+37 more)

### Community 13 - "scripts"
Cohesion: 0.04
Nodes (45): orval, dependencies, orval, devDependencies, @cloudflare/vitest-pool-workers, turbo, typescript, vitest (+37 more)

### Community 14 - "block-inspector.tsx"
Cohesion: 0.09
Nodes (31): LockedControl(), BrandField(), Section(), CheckboxGroup(), Field(), ListEditor(), NumberField(), SelectField() (+23 more)

### Community 15 - "SessionDO"
Cohesion: 0.16
Nodes (4): SessionDO, summarizeAnswer(), SSEEnvelope, questionText()

### Community 16 - "form-schema/src/index.ts"
Cohesion: 0.08
Nodes (34): EscalatePayload, QuestionPayload, ServerEvent, AgentTab(), uid(), ThemePanel(), QuestionState, BlockMedia (+26 more)

### Community 17 - "lib/respondent-auth.ts"
Cohesion: 0.08
Nodes (36): app, queue(), scheduled(), pruneGateLog(), AuthResult, b64urlToBytes(), b64urlToJson(), getGoogleKey() (+28 more)

### Community 18 - "routes/billing.ts"
Cohesion: 0.09
Nodes (37): base64(), DodoWebhookEvent, eventTarget, sign(), statusForFailure(), toEpochMs(), TOLERANCE_SECONDS, VerifyFailure (+29 more)

### Community 19 - "results-client.tsx"
Cohesion: 0.11
Nodes (32): StrippedSetting, AiCapBanner(), Warning, WARNINGS, CustomDomainField(), FirstPartialToast(), Gate(), GateProps (+24 more)

### Community 20 - "dashboard-content.tsx"
Cohesion: 0.10
Nodes (25): DashboardContent(), FormCard(), FormRow, relativeTime(), Sort, PreviewChat(), Device, PreviewDialog() (+17 more)

### Community 21 - "v1/v1.ts"
Cohesion: 0.05
Nodes (41): GetV1Forms200Item, GetV1FormsById404, PostV1ChatSessionsBySidMessagesBody, PostV1FormsByIdChatSessions200, PostV1FormsByIdChatSessionsBody, GetV1ChatSessionsBySidQueryError, GetV1ChatSessionsBySidQueryResult, getV1ChatSessionsBySidResponse (+33 more)

### Community 22 - "workflow-client.tsx"
Cohesion: 0.08
Nodes (31): branchNodeHeight(), DEFAULT_SIZE, layoutGraph(), SIZES, applyNodeChangesShallow(), BlockType, BranchCase, BranchCaseRow() (+23 more)

### Community 23 - "billing/page.tsx"
Cohesion: 0.15
Nodes (20): KeyRow, GAUGES, Invoice, METERS, MemberRow, TemplateRow, EVENTS, WebhookRow (+12 more)

### Community 24 - "workspace-switcher.tsx"
Cohesion: 0.09
Nodes (22): AppNav(), NAV, AuthGuard(), DashboardShell(), UsagePill(), UserMenu(), WorkspaceSwitcher(), OPTIONS (+14 more)

### Community 25 - "authorize.ts"
Cohesion: 0.14
Nodes (33): assertFeature(), assertPermission(), checkDocumentLimit(), Ctx, deny(), entitlementsFor(), GaugeLimitKey, Handler (+25 more)

### Community 26 - "schema.ts"
Cohesion: 0.06
Nodes (33): accounts, aiGenerations, analyticsRollupDaily, apiKeys, auditLogs, chatMessages, chatSessions, dodoCustomers (+25 more)

### Community 27 - "entitlements.ts"
Cohesion: 0.13
Nodes (28): cacheKey(), checkQuota(), getAllUsage(), getEntitlements(), getUsage(), governingLimit(), invalidateEntitlements(), loadOverrides() (+20 more)

### Community 28 - "useBuilderStore"
Cohesion: 0.12
Nodes (17): BlockList(), BuildToolbar(), SaveIndicator(), DesignSheet(), BlockInspector(), IntegrateClient(), BuildTab(), IntegrateTab() (+9 more)

### Community 29 - "0000_common_trish_tilby.sql"
Cohesion: 0.12
Nodes (32): `accounts`, `ai_generations`, `analytics_rollup_daily`, `api_keys`, `audit_logs`, `chat_messages`, `chat_sessions`, `dodo_customers` (+24 more)

### Community 30 - "chat-client.tsx"
Cohesion: 0.09
Nodes (22): QuestionPreview(), StaticComposer(), ChatBoot(), AlreadySubmittedCard(), Bubble(), Composer(), modKeyLabel(), placeholderFor() (+14 more)

### Community 31 - "session-do.ts"
Cohesion: 0.11
Nodes (26): buildAgentTools(), ToolContext, ToolOutcome, DoSessionMeta, nextInSequence(), StoredSession, asideText(), clarifyText() (+18 more)

### Community 32 - "routes/public.ts"
Cohesion: 0.10
Nodes (23): derive(), fromHex(), hashPassword(), isHashedPassword(), timingSafeEqual(), toHex(), verifyPassword(), CreateSessionResponse (+15 more)

### Community 33 - "FormDoc"
Cohesion: 0.09
Nodes (26): AgentContext, buildEditPrompt(), BuilderTurn, buildRetryObjective(), buildStablePrefix(), buildSystemPrompt(), buildTurnSuffix(), TONE_GUIDE (+18 more)

### Community 34 - "utils.ts"
Cohesion: 0.11
Nodes (19): Section, SECTIONS, DateComposer(), RatingComposer(), ScaleComposer(), SignatureComposer(), CONTACT_LABELS, FieldsComposer() (+11 more)

### Community 35 - "customFetch"
Cohesion: 0.07
Nodes (29): ApiKeysPage(), TemplatesPage(), CommandPalette(), FormRow, ITEM, deleteApiWebhooksById(), getDeleteApiWebhooksByIdMutationOptions(), getDeleteApiWebhooksByIdUrl() (+21 more)

### Community 36 - "compilerOptions"
Cohesion: 0.07
Nodes (28): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+20 more)

### Community 37 - "dependencies"
Cohesion: 0.07
Nodes (27): dependencies, better-auth, class-variance-authority, @dnd-kit/sortable, driver.js, immer, react, react-markdown (+19 more)

### Community 38 - "use-chat.ts"
Cohesion: 0.12
Nodes (24): AuthCard(), GoogleButton(), GsiId, loadGsi(), Window, AuthState, backoffMs(), ChatMessage (+16 more)

### Community 39 - "withQueryKey"
Cohesion: 0.08
Nodes (26): getApiAuditLogs(), getApiAuthOk(), getApiForms(), getApiKeys(), getApiTemplates(), getGetApiAuditLogsQueryKey(), getGetApiAuditLogsQueryOptions(), getGetApiAuditLogsUrl() (+18 more)

### Community 40 - "CHATFORM — ENGINEERING HANDOFF"
Cohesion: 0.08
Nodes (25): 10. M6 core VERIFIED (2026-08-24 later), 11. M8 developer API VERIFIED E2E (2026-08-24), 12. M8 COMPLETE + M9 core (2026-08-24 final), 13. M7 file uploads COMPLETE + VERIFIED (2026-08-24 final), 14. UI COMPLETION PASS (2026-08-24 final), 15. FRONTEND COMPLETION PASS (2026-08-24 final), 16. YOUFORM PARITY PASS (2026-08-24), 17. COMPETITOR PARITY AUDIT FIXES (2026-08-24) (+17 more)

### Community 41 - "evaluate.ts"
Cohesion: 0.17
Nodes (22): AnswerMap, FileDescriptor, allowedNextRefs(), applyLogicRules(), blockIndex(), BranchResult, evalCondition(), evalGroup() (+14 more)

### Community 42 - "gates.test.ts"
Cohesion: 0.20
Nodes (16): auth(), DB(), publishWithBrandingOff(), seedPlans(), seedSubmissions(), setPlan(), setRole(), app (+8 more)

### Community 43 - "devDependencies"
Cohesion: 0.08
Nodes (25): devDependencies, eslint, eslint-config-next, jsqr, @opennextjs/cloudflare, @repo/config, tailwindcss, @tailwindcss/postcss (+17 more)

### Community 44 - "form-schema/package.json"
Cohesion: 0.08
Nodes (24): dependencies, zod, devDependencies, eslint, @repo/config, @types/node, typescript, vitest (+16 more)

### Community 45 - "block-list.tsx"
Cohesion: 0.14
Nodes (16): BLOCK_GROUPS, BLOCK_LIBRARY, BlockGroup, BlockTone, TONE_ACCENT, TONE_CLASSES, BlockPicker(), defaultBlock() (+8 more)

### Community 46 - "Builder Redesign — Youform-style UI/UX + Agentic Chat"
Cohesion: 0.09
Nodes (22): A1. Route the builder out of the app shell, A2. One header component for all views, A3. Build + Workflow relationship (fix the confusion), A4. Settings tab → Youform-style sub-nav, A5. Results tab → Youform-style, A6. Share + Integrate polish, A7. Theme tab → "Design", A8. Tour updates (+14 more)

### Community 47 - "Known risks"
Cohesion: 0.09
Nodes (23): Bugs found by actually using it, Bugs found while building it, Bugs found while testing this pass, Deferred, deliberately, Known risks, Latency, Phase 10 — the skipped-question bug, and latency, Phase 11 — respondent experience (+15 more)

### Community 48 - "Billing runbook"
Cohesion: 0.09
Nodes (21): 10. Where things live, 1.0 The fast path, 1.1 Create the products in Dodo, 1.2 Set the environment variables, 1.3 Point the webhook at us, 1.4 Seed the plans and link the products, 1.5 Confirm, 1.6 Switch on the free revenue (+13 more)

### Community 49 - "db/package.json"
Cohesion: 0.09
Nodes (21): drizzle-kit, dependencies, @cloudflare/workers-types, drizzle-orm, devDependencies, drizzle-kit, @repo/config, typescript (+13 more)

### Community 50 - "compilerOptions"
Cohesion: 0.10
Nodes (20): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, incremental, isolatedModules, lib (+12 more)

### Community 51 - "entitlements/package.json"
Cohesion: 0.10
Nodes (20): devDependencies, eslint, @repo/config, @types/node, typescript, vitest, exports, eslint (+12 more)

### Community 52 - "provision-dodo.py"
Cohesion: 0.26
Nodes (16): d1(), die(), Dodo, ensure_collection(), ensure_products(), ensure_webhook(), link_plans(), main() (+8 more)

### Community 53 - "form-generation.tsx"
Cohesion: 0.13
Nodes (16): CreateFormDialog(), DraftedQuestion, FormGenerationProgress(), GenerationResult, Marker(), Stage, STAGE_COPY, STAGE_ORDER (+8 more)

### Community 54 - "share-client.tsx"
Cohesion: 0.13
Nodes (10): emailSnippet(), EMBED_DESCRIPTIONS, embedSnippet(), EmbedStyle, Mode, ShareClient(), OPTIONS, SNIPPETS (+2 more)

### Community 55 - "dodo.ts"
Cohesion: 0.15
Nodes (16): call(), changePlan(), ChangePlanArgs, ChangePlanResult, ChangePreview, CheckoutArgs, CheckoutSession, createCheckoutSession() (+8 more)

### Community 56 - "components.json"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 57 - "dependencies"
Cohesion: 0.12
Nodes (17): ai, dependencies, ai, better-auth, hono-openapi, @hono/standard-validator, @openrouter/ai-sdk-provider, @repo/db (+9 more)

### Community 58 - "CHATFORM — Implementation Plan"
Cohesion: 0.12
Nodes (16): 10. Status log, 1. Research highlights (what we copy), 2. Locked stack, 3. Monorepo layout, 4.1 Form definition (`@repo/form-schema`) — one Zod schema, five consumers (builder, AI generator, agent, renderer, API), 4.2 D1 schema (~30 tables — full DDL in ARCHITECTURE.md §1), 4.3 Agentic interview loop (SessionDO) — the core differentiator, 4.4 Analytics (+8 more)

### Community 59 - "scripts"
Cohesion: 0.13
Nodes (14): name, packageManager, private, scripts, build, cf:build, cf:deploy, cf:preview (+6 more)

### Community 60 - "files"
Cohesion: 0.13
Nodes (14): exports, ./tsconfig/base, ./tsconfig/next, ./tsconfig/react-lib, ./tsconfig/worker, files, tsconfig.base.json, name (+6 more)

### Community 61 - "tooling/package.json"
Cohesion: 0.13
Nodes (14): dependencies, @repo/entitlements, devDependencies, tsx, typescript, @repo/entitlements, typescript, name (+6 more)

### Community 62 - "permissions.ts"
Cohesion: 0.14
Nodes (13): ActionOf, admin, ALL, ASSIGNABLE_ROLES, editor, member, owner, Resource (+5 more)

### Community 63 - "health/health.ts"
Cohesion: 0.20
Nodes (13): GetHealth200, getGetHealthQueryKey(), getGetHealthQueryOptions(), getGetHealthUrl(), getHealth(), GetHealthQueryError, GetHealthQueryResult, getHealthResponse (+5 more)

### Community 64 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, allowJs, jsx, lib, module, noEmit, target, extends (+5 more)

### Community 65 - "PART TWO — FRONTEND"
Cohesion: 0.14
Nodes (14): F10. Data layer — stop bypassing orval, F11. Responsive, a11y, performance, F12. Testing, F13. Frontend wiring for new backend events, F1. Design system foundation, F2. Component layer, F3. Information architecture, F4. Build tab — the block inspector (+6 more)

### Community 66 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @cloudflare/vitest-pool-workers, @cloudflare/workers-types, @repo/config, typescript, vitest, wrangler, @cloudflare/vitest-pool-workers (+5 more)

### Community 67 - "auth.ts"
Cohesion: 0.24
Nodes (10): Auth, createAuth(), createDefaultOrg(), googleAuthConfigured(), ac, roles, dashboardRouter, requireSession() (+2 more)

### Community 68 - "ai-bar.tsx"
Cohesion: 0.22
Nodes (11): AiBar(), historyKey(), loadHistory(), Message(), saveHistory(), Turn, blockMeta, BY_TYPE (+3 more)

### Community 69 - "share-tab.tsx"
Cohesion: 0.26
Nodes (6): BuilderShell(), ShareTab(), noopSubscribe(), useClientValue(), useHydrated(), useGetApiFormsById()

### Community 70 - "BillingPage"
Cohesion: 0.20
Nodes (11): BillingPage(), getApiBillingInvoices(), getGetApiBillingInvoicesQueryKey(), getGetApiBillingInvoicesQueryOptions(), getGetApiBillingInvoicesUrl(), getPostApiBillingChangePlanMutationOptions(), getPostApiBillingChangePlanUrl(), postApiBillingChangePlan() (+3 more)

### Community 71 - "pricing/page.tsx"
Cohesion: 0.25
Nodes (10): Catalogue, formatLimit(), GROUPS, PlanRow, PricingPage(), getApiBillingPlans(), getGetApiBillingPlansQueryKey(), getGetApiBillingPlansQueryOptions() (+2 more)

### Community 72 - "tsconfig.react-lib.json"
Cohesion: 0.18
Nodes (10): compilerOptions, jsx, lib, noEmit, extends, DOM, DOM.Iterable, ES2022 (+2 more)

### Community 73 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, jsx, lib, noEmit, types, extends, @cloudflare/workers-types/2023-07-01, ES2022 (+2 more)

### Community 74 - "validators.ts"
Cohesion: 0.29
Nodes (10): AnswerValue, countryDial(), fail(), FREEMAIL, isFileDescriptorArray(), ok(), rotr(), SHA256_K (+2 more)

### Community 75 - "upgrade-dialog.tsx"
Cohesion: 0.38
Nodes (8): headlineFor(), UpgradeDialog(), dollars(), HIGHLIGHTS, PlanCard(), usePostApiBillingCheckout(), yearlyPerMonthCents(), yearlySavingPercent()

### Community 76 - "BuilderHeader"
Cohesion: 0.24
Nodes (9): BuilderHeader(), BUILD_VIEWS, BUILDER_SEGMENTS, BUILDER_TABS, BuilderSegment, isBuilderSegment(), tabMatches(), useCanRedo() (+1 more)

### Community 77 - "db/tsconfig.json"
Cohesion: 0.20
Nodes (9): compilerOptions, noEmit, types, extends, include, @cloudflare/workers-types/2023-07-01, @repo/config/tsconfig/base, src (+1 more)

### Community 78 - "PART ONE — BACKEND"
Cohesion: 0.20
Nodes (10): B1. Tenancy and authorization — **ship in phase 0**, B2. The agent, part 1 — real tool-calling loop, B3. The agent, part 2 — knowledge base and goal, B4. The agent, part 3 — free-text understanding, B5. SessionDO correctness, B6. Email — Resend (currently zero senders), B7. Webhooks, integrations, limits, analytics, B8. Endpoints to add (frontend depends on these) (+2 more)

### Community 79 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, d1:migrate:local, d1:migrate:remote, deploy, dev, test, test:watch (+1 more)

### Community 80 - "origins.ts"
Cohesion: 0.44
Nodes (5): isSecureOrigin(), needsCrossSiteCookies(), returnOrigin(), safeHost(), webOrigins()

### Community 81 - "api/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, noEmit, rootDir, extends, include, src, @repo/config/tsconfig/worker, worker-configuration.d.ts

### Community 82 - "token-contrast.test.ts"
Cohesion: 0.29
Nodes (5): contrast(), CSS, luminance(), Oklch, STATUSES

### Community 83 - "entitlements/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, @repo/config/tsconfig/base, src

### Community 84 - "form-schema/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, @repo/config/tsconfig/base, src

### Community 85 - "REBUILD.md"
Cohesion: 0.29
Nodes (6): chatform — Rebuild Plan (Youform parity + agentic differentiator), Constraints inherited from HANDOFF.md §2 — do not violate, Context, Execution sequence, Locked decisions (this session), Verification

### Community 86 - "Shared contract — `packages/form-schema` v2"
Cohesion: 0.29
Nodes (7): S1. Form-level agent config — `settings.ts`, S2. Per-block agent hints + Youform-parity fields — `blocks.ts`, S3. Migration chain — new `packages/form-schema/src/migrations.ts`, S4. Extraction schemas — new `packages/form-schema/src/extraction.ts`, S5. Tests, S6. Regenerate the API contract, Shared contract — `packages/form-schema` v2

### Community 87 - "tooling/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, extends, include, @repo/config/tsconfig/base, *.ts

### Community 88 - "product-tour.tsx"
Cohesion: 0.53
Nodes (5): base, done(), markDone(), startTour(), useAutoTour()

### Community 89 - "getGetPFormsBySlugConfigQueryOptions"
Cohesion: 0.33
Nodes (6): getGetPFormsBySlugConfigQueryKey(), getGetPFormsBySlugConfigQueryOptions(), getGetPFormsBySlugConfigUrl(), getPFormsBySlugConfig(), useGetPFormsBySlugConfig(), withQueryKey()

### Community 90 - "getGetV1ChatSessionsBySidQueryOptions"
Cohesion: 0.33
Nodes (6): getGetV1ChatSessionsBySidQueryKey(), getGetV1ChatSessionsBySidQueryOptions(), getGetV1ChatSessionsBySidUrl(), getV1ChatSessionsBySid(), useGetV1ChatSessionsBySid(), withQueryKey()

### Community 91 - "api/package.json"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 92 - "opengraph-image.tsx"
Cohesion: 0.40
Nodes (3): alt, contentType, size

### Community 93 - "twitter-image.tsx"
Cohesion: 0.40
Nodes (3): alt, contentType, size

### Community 94 - "qrSvg"
Cohesion: 0.70
Nodes (3): QrPanel(), qrMatrix(), qrSvg()

### Community 95 - "getApiBillingConfigCheck"
Cohesion: 0.40
Nodes (5): getApiBillingConfigCheck(), getGetApiBillingConfigCheckQueryKey(), getGetApiBillingConfigCheckQueryOptions(), getGetApiBillingConfigCheckUrl(), useGetApiBillingConfigCheck()

### Community 96 - "useGetApiBillingEntitlements"
Cohesion: 0.40
Nodes (5): getApiBillingEntitlements(), getGetApiBillingEntitlementsQueryKey(), getGetApiBillingEntitlementsQueryOptions(), getGetApiBillingEntitlementsUrl(), useGetApiBillingEntitlements()

### Community 97 - "getApiBillingUsage"
Cohesion: 0.40
Nodes (5): getApiBillingUsage(), getGetApiBillingUsageQueryKey(), getGetApiBillingUsageQueryOptions(), getGetApiBillingUsageUrl(), useGetApiBillingUsage()

### Community 98 - "getApiAuditLogsExport"
Cohesion: 0.40
Nodes (5): getApiAuditLogsExport(), getGetApiAuditLogsExportQueryKey(), getGetApiAuditLogsExportQueryOptions(), getGetApiAuditLogsExportUrl(), useGetApiAuditLogsExport()

### Community 99 - "getApiAuthProviders"
Cohesion: 0.40
Nodes (5): getApiAuthProviders(), getGetApiAuthProvidersQueryKey(), getGetApiAuthProvidersQueryOptions(), getGetApiAuthProvidersUrl(), useGetApiAuthProviders()

### Community 100 - "useGetApiFormsByIdAnalytics"
Cohesion: 0.40
Nodes (5): getApiFormsByIdAnalytics(), getGetApiFormsByIdAnalyticsQueryKey(), getGetApiFormsByIdAnalyticsQueryOptions(), getGetApiFormsByIdAnalyticsUrl(), useGetApiFormsByIdAnalytics()

### Community 101 - "useGetApiFormsByIdSubmissions"
Cohesion: 0.40
Nodes (5): getApiFormsByIdSubmissions(), getGetApiFormsByIdSubmissionsQueryKey(), getGetApiFormsByIdSubmissionsQueryOptions(), getGetApiFormsByIdSubmissionsUrl(), useGetApiFormsByIdSubmissions()

### Community 102 - "getApiFormsByIdSubmissionsExport"
Cohesion: 0.40
Nodes (5): getApiFormsByIdSubmissionsExport(), getGetApiFormsByIdSubmissionsExportQueryKey(), getGetApiFormsByIdSubmissionsExportQueryOptions(), getGetApiFormsByIdSubmissionsExportUrl(), useGetApiFormsByIdSubmissionsExport()

### Community 103 - "getApiWebhooks"
Cohesion: 0.40
Nodes (5): getApiWebhooks(), getGetApiWebhooksQueryKey(), getGetApiWebhooksQueryOptions(), getGetApiWebhooksUrl(), useGetApiWebhooks()

### Community 104 - "getApiWebhooksByIdDeliveries"
Cohesion: 0.40
Nodes (5): getApiWebhooksByIdDeliveries(), getGetApiWebhooksByIdDeliveriesQueryKey(), getGetApiWebhooksByIdDeliveriesQueryOptions(), getGetApiWebhooksByIdDeliveriesUrl(), useGetApiWebhooksByIdDeliveries()

### Community 105 - "getGetV1FormsByIdQueryOptions"
Cohesion: 0.40
Nodes (5): getGetV1FormsByIdQueryKey(), getGetV1FormsByIdQueryOptions(), getGetV1FormsByIdUrl(), getV1FormsById(), useGetV1FormsById()

### Community 106 - "getGetV1FormsQueryOptions"
Cohesion: 0.40
Nodes (5): getGetV1FormsQueryKey(), getGetV1FormsQueryOptions(), getGetV1FormsUrl(), getV1Forms(), useGetV1Forms()

### Community 107 - "Phase 0 — Repo hygiene and safety net (blocking, do first)"
Cohesion: 0.40
Nodes (5): 0.1 `apps/web` is not actually in the repo — fix before writing any code, 0.2 Working docs, 0.3 Tenancy hotfix (do not defer to a "security phase"), 0.4 Verification gate, Phase 0 — Repo hygiene and safety net (blocking, do first)

### Community 108 - "Phase 15 — audit: what was wired, what only looked wired"
Cohesion: 0.40
Nodes (5): Other settings that did nothing, Phase 15 — audit: what was wired, what only looked wired, Still dead, and known, The AI builder produced plausible, broken flows, The gates were all inert — including the password

### Community 109 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 110 - "postApiBillingPortal"
Cohesion: 0.50
Nodes (4): getPostApiBillingPortalMutationOptions(), getPostApiBillingPortalUrl(), postApiBillingPortal(), usePostApiBillingPortal()

### Community 111 - "postApiBillingPreviewChange"
Cohesion: 0.50
Nodes (4): getPostApiBillingPreviewChangeMutationOptions(), getPostApiBillingPreviewChangeUrl(), postApiBillingPreviewChange(), usePostApiBillingPreviewChange()

### Community 112 - "deleteApiFormsById"
Cohesion: 0.50
Nodes (4): deleteApiFormsById(), getDeleteApiFormsByIdMutationOptions(), getDeleteApiFormsByIdUrl(), useDeleteApiFormsById()

### Community 113 - "deleteApiKeysById"
Cohesion: 0.50
Nodes (4): deleteApiKeysById(), getDeleteApiKeysByIdMutationOptions(), getDeleteApiKeysByIdUrl(), useDeleteApiKeysById()

### Community 114 - "getApiFormsById"
Cohesion: 0.50
Nodes (4): getApiFormsById(), getGetApiFormsByIdQueryKey(), getGetApiFormsByIdQueryOptions(), getGetApiFormsByIdUrl()

### Community 115 - "postApiAiEditForm"
Cohesion: 0.50
Nodes (4): getPostApiAiEditFormMutationOptions(), getPostApiAiEditFormUrl(), postApiAiEditForm(), usePostApiAiEditForm()

### Community 116 - "postApiAiGenerateForm"
Cohesion: 0.50
Nodes (4): getPostApiAiGenerateFormMutationOptions(), getPostApiAiGenerateFormUrl(), postApiAiGenerateForm(), usePostApiAiGenerateForm()

### Community 117 - "postApiAiGenerateFormStream"
Cohesion: 0.50
Nodes (4): getPostApiAiGenerateFormStreamMutationOptions(), getPostApiAiGenerateFormStreamUrl(), postApiAiGenerateFormStream(), usePostApiAiGenerateFormStream()

### Community 118 - "postApiFormsByIdPreviewSessions"
Cohesion: 0.50
Nodes (4): getPostApiFormsByIdPreviewSessionsMutationOptions(), getPostApiFormsByIdPreviewSessionsUrl(), postApiFormsByIdPreviewSessions(), usePostApiFormsByIdPreviewSessions()

### Community 119 - "postApiFormsByIdPublish"
Cohesion: 0.50
Nodes (4): getPostApiFormsByIdPublishMutationOptions(), getPostApiFormsByIdPublishUrl(), postApiFormsByIdPublish(), usePostApiFormsByIdPublish()

### Community 120 - "postApiTemplatesBySlugUse"
Cohesion: 0.50
Nodes (4): getPostApiTemplatesBySlugUseMutationOptions(), getPostApiTemplatesBySlugUseUrl(), postApiTemplatesBySlugUse(), usePostApiTemplatesBySlugUse()

### Community 121 - "postPFormsBySlugSessions"
Cohesion: 0.50
Nodes (4): getPostPFormsBySlugSessionsMutationOptions(), getPostPFormsBySlugSessionsUrl(), postPFormsBySlugSessions(), usePostPFormsBySlugSessions()

### Community 122 - "postPSessionsByIdUploadsByFileIdConfirm"
Cohesion: 0.50
Nodes (4): getPostPSessionsByIdUploadsByFileIdConfirmMutationOptions(), getPostPSessionsByIdUploadsByFileIdConfirmUrl(), postPSessionsByIdUploadsByFileIdConfirm(), usePostPSessionsByIdUploadsByFileIdConfirm()

### Community 123 - "postPSessionsByIdUploadsIntent"
Cohesion: 0.50
Nodes (4): getPostPSessionsByIdUploadsIntentMutationOptions(), getPostPSessionsByIdUploadsIntentUrl(), postPSessionsByIdUploadsIntent(), usePostPSessionsByIdUploadsIntent()

### Community 124 - "postV1ChatSessionsBySidMessages"
Cohesion: 0.50
Nodes (4): getPostV1ChatSessionsBySidMessagesMutationOptions(), getPostV1ChatSessionsBySidMessagesUrl(), postV1ChatSessionsBySidMessages(), usePostV1ChatSessionsBySidMessages()

### Community 125 - "postV1FormsByIdChatSessions"
Cohesion: 0.50
Nodes (4): getPostV1FormsByIdChatSessionsMutationOptions(), getPostV1FormsByIdChatSessionsUrl(), postV1FormsByIdChatSessions(), usePostV1FormsByIdChatSessions()

### Community 126 - "main"
Cohesion: 0.83
Nodes (3): Path, main(), read_vars()

### Community 127 - "Phase 14 — explicit submit, resubmit, and respondent authentication"
Cohesion: 0.50
Nodes (4): Finishing a form is now an act, Phase 14 — explicit submit, resubmit, and respondent authentication, Respondent authentication, Still open

### Community 128 - "postApiBillingCheckout"
Cohesion: 0.67
Nodes (3): getPostApiBillingCheckoutMutationOptions(), getPostApiBillingCheckoutUrl(), postApiBillingCheckout()

## Knowledge Gaps
- **1154 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+1149 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **32 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `(marketing)/page.tsx`, `block-inspector.tsx`, `form-schema/src/index.ts`, `results-client.tsx`, `dashboard-content.tsx`, `workflow-client.tsx`, `billing/page.tsx`, `workspace-switcher.tsx`, `useBuilderStore`, `chat-client.tsx`, `utils.ts`, `customFetch`, `block-list.tsx`, `form-generation.tsx`, `share-client.tsx`, `ai-bar.tsx`, `BillingPage`, `pricing/page.tsx`, `upgrade-dialog.tsx`, `BuilderHeader`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Why does `FormDoc` connect `FormDoc` to `routes/public.ts`, `routes/ai.ts`, `ai-bar.tsx`, `resolve.ts`, `draft-normalize.ts`, `share-tab.tsx`, `blocks.ts`, `evaluate.ts`, `gates.test.ts`, `block-inspector.tsx`, `SessionDO`, `form-schema/src/index.ts`, `results-client.tsx`, `dashboard-content.tsx`, `workflow-client.tsx`, `useBuilderStore`, `chat-client.tsx`, `session-do.ts`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `customFetch()` connect `customFetch` to `postApiBillingCheckout`, `dashboard/dashboard.ts`, `billing/billing.ts`, `public/public.ts`, `dashboard-content.tsx`, `v1/v1.ts`, `billing/page.tsx`, `useBuilderStore`, `FormDoc`, `withQueryKey`, `form-generation.tsx`, `health/health.ts`, `ai-bar.tsx`, `BillingPage`, `pricing/page.tsx`, `getGetPFormsBySlugConfigQueryOptions`, `getGetV1ChatSessionsBySidQueryOptions`, `getApiBillingConfigCheck`, `useGetApiBillingEntitlements`, `getApiBillingUsage`, `getApiAuditLogsExport`, `getApiAuthProviders`, `useGetApiFormsByIdAnalytics`, `useGetApiFormsByIdSubmissions`, `getApiFormsByIdSubmissionsExport`, `getApiWebhooks`, `getApiWebhooksByIdDeliveries`, `getGetV1FormsByIdQueryOptions`, `getGetV1FormsQueryOptions`, `postApiBillingPortal`, `postApiBillingPreviewChange`, `deleteApiFormsById`, `deleteApiKeysById`, `getApiFormsById`, `postApiAiEditForm`, `postApiAiGenerateForm`, `postApiAiGenerateFormStream`, `postApiFormsByIdPreviewSessions`, `postApiFormsByIdPublish`, `postApiTemplatesBySlugUse`, `postPFormsBySlugSessions`, `postPSessionsByIdUploadsByFileIdConfirm`, `postPSessionsByIdUploadsIntent`, `postV1ChatSessionsBySidMessages`, `postV1FormsByIdChatSessions`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _1154 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `dashboard/dashboard.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.01098901098901099 - nodes in this community are weakly interconnected._
- **Should `routes/ai.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05847781369379959 - nodes in this community are weakly interconnected._
- **Should `generated.schemas.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.02702702702702703 - nodes in this community are weakly interconnected._