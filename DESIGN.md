# chatform — Product & Frontend Design Spec

**Version:** 1.0 · **Status:** Approved for implementation · **Scope:** Frontend + product design only

chatform is a Typeform/Youform competitor where the form-filling surface is an **agentic AI chatbot**, not a classic form. Respondents are greeted by a conversational agent that asks questions one at a time in natural language, validates answers conversationally, branches conditionally, and accepts uploads, payments, and signatures. Builders get a Youform-class dashboard plus developer affordances: conditional flow editor, headless API, API keys, and an embeddable widget.

---

## 0. Product principles (design north stars)

1. **One thing at a time.** The chat shows exactly one question; the builder shows exactly one block's settings. Nothing competes.
2. **Warm, not childish.** Cream paper, ink text, orange accent, soft shadows. Playful in empty states and microcopy; serious in tables and billing.
3. **Conversations are the data.** Every response is stored and displayed as a transcript first, fields second. Results screens show the chat, not just a grid.
4. **Optimistic everything.** Builder interactions feel instant locally; persistence is debounced and conflict-safe. No spinners on drag.
5. **Developer-first without no-code tax.** Every power feature (logic, API, embed) has a no-code path AND a programmatic path. Neither blocks the other.
6. **Speed budget.** Hosted form `/f/[slug]` TTI < 1.5s on mid-tier Android; widget core ≤ 60KB gzip; builder route chunks lazy-loaded per tab.

---

## 1. Information architecture & route map

Next.js App Router with three route groups. One deployable Next app (`apps/web`) serves marketing, app, and hosted forms.

### 1.1 Route map

| Route | Group | Layout | Purpose |
|---|---|---|---|
| `/` | `(marketing)` | Marketing shell | Landing: hero with live chat demo, social proof, pricing teaser |
| `/pricing` | `(marketing)` | Marketing shell | Plan comparison table, FAQ accordion |
| `/features` | `(marketing)` | Marketing shell | Feature deep-dives anchored sections |
| `/templates` | `(marketing)` | Marketing shell | Public template gallery (marketing copy) |
| `/templates/[slug]` | `(marketing)` | Marketing shell | Template detail: description, preview via real chat runtime, "Use this template" → signup |
| `/docs`, `/docs/[...slug]` | `(marketing)` | Docs shell (3-col) | MDX docs: guides, headless API reference (generated from OpenAPI), widget SDK |
| `/blog/[slug]` *(phase 6)* | `(marketing)` | Marketing shell | Content marketing |
| `/login`, `/signup` | `(auth)` | Auth shell | Better Auth email+OAuth (Google, GitHub); split layout w/ product shot |
| `/dashboard` | `(app)` | App shell | Home: form cards grid, workspace switcher, search/sort |
| `/forms` | `(app)` | App shell | Alias of dashboard home (canonical list view) |
| `/forms/new` | `(app)` | App shell | Creation modal/page: blank · from template · AI generate |
| `/forms/[id]/build` | `(app)` | Builder shell | 3-pane builder, blocks + live chat preview + settings |
| `/forms/[id]/logic` | `(app)` | Builder shell | @xyflow/react conditional flow graph |
| `/forms/[id]/theme` | `(app)` | Builder shell | Theme studio w/ live preview |
| `/forms/[id]/settings` | `(app)` | Builder shell | General/access/notifications/hidden fields/meta/danger |
| `/forms/[id]/share` | `(app)` | Builder shell | Link, QR, embed generator, custom domain |
| `/forms/[id]/integrate` | `(app)` | Builder shell | Webhooks, Sheets, Zapier/Make, Slack, notifications, API |
| `/forms/[id]/results` | `(app)` | Builder shell | Sub-tabs: Submissions / Summary / Analytics |
| `/templates` *(app-scoped)* | `(app)` | App shell | "Use template" picker when creating inside app |
| `/account` | `(app)` | Settings shell | Profile, password, sessions, danger zone (delete account) |
| `/workspace/settings` | `(app)` | Settings shell | Workspace name, slug, branding, defaults |
| `/team` | `(app)` | Settings shell | Members, roles, invites |
| `/billing` | `(app)` | Settings shell | Plans, Stripe checkout portal, invoices |
| `/usage` | `(app)` | Settings shell | Quota meters: submissions, AI messages, seats |
| `/api-keys` | `(app)` | Settings shell | Developer keys CRUD, scopes, last-used |
| `/f/[slug]` | `(public)` | Bare (no chrome) | Hosted conversational form page |
| `/f/[slug]/end` | `(public)` | Bare | Thank-you/completion screen state (also rendered inline) |
| `/embed/[slug]` | `(public)` | Bare | Widget iframe target (`?type=popup\|inline\|sidewidget\|fullpage`) |
| `/embed.js` | route handler | — | Tiny loader script (see §5.7) |

### 1.2 Navigation model

- **Marketing shell:** sticky top nav (logo, Features, Templates, Pricing, Docs, Sign in, CTA `Button`), footer sitemap. shadcn: `NavigationMenu`, `Sheet` (mobile), `Button`.
- **App shell (Youform-proven):** top bar, not sidebar. Left → logo + `DropdownMenu` workspace switcher (avatar, name, plan badge, switch/create workspace). Center → global search trigger opening `Command` palette (`⌘K`: jump to form, create, actions). Right → usage pill (e.g., `847/1000 responses` → links `/usage`), notifications popover, `Avatar` menu (Account, Team, Billing, API keys, Dark mode toggle, Log out).
- **Builder shell:** secondary top bar replaces app nav: back chevron → dashboard, form title inline-edit `Input` (borderless until hover), status badge (`Draft/Live/Closed`), tab strip `Tabs`: **Build · Logic · Theme · Integrate · Share · Results · Settings** (Youform's order preserved; Logic inserted after Build), right side: autosave indicator + Preview button (opens `/f/[slug]?preview=1` in new tab) + Publish `Button` (primary).
- **Settings shells** (workspace/team/billing/api-keys/account): left vertical menu (`Sidebar` component collapsed variant or `nav` list), right content pane. Mirrors Youform settings pages.

### 1.3 Route group tree

```
apps/web/src/app/
├── (marketing)/            # site chrome
│   ├── page.tsx  pricing/  features/  templates/  docs/
├── (auth)/                 # centered card chrome
│   └── login/  signup/
├── (app)/                  # requires session (middleware)
│   ├── layout.tsx          # top bar + Command palette + Toaster
│   ├── dashboard/  forms/  templates/
│   ├── account/  team/  billing/  usage/  api-keys/  workspace/
│   └── forms/[id]/
│       ├── layout.tsx      # builder top bar + tabs
│       ├── build/ logic/ theme/ settings/ share/ integrate/
│       └── results/
├── (public)/               # zero chrome, theme-injected
│   └── f/[slug]/  embed/[slug]/
└── api/[[...route]]/route.ts   # Hono mount (REST + OpenAPI)
```

Middleware: auth guard for `(app)`; slug→form resolution cached at edge for `/f/*`; `?preview=1` bypasses access rules for owner sessions.

---

## 2. Admin dashboard — screen-by-screen spec

Convention per screen: **Layout → Components (shadcn) → States → Interactions.**

### 2.1 Dashboard home (`/dashboard`)

**Layout**
- Top bar (§1.2).
- Content header row: H1 "Forms", count subtitle ("12 forms · 3,204 responses"), right-aligned: search `Input` (icon), sort `Select` (Recently updated · Most responses · A–Z · Created), filter `ToggleGroup` (`All | Live | Drafts | Closed`), primary `Button` "+ New form".
- Body: responsive card grid `grid-cols-1 sm:2 lg:3 xl:4`, gap-4.

**Form card** (`Card`, rounded-xl, shadow-xs, hover:shadow-md + translateY(-2px) transition)
- Thumb area h-28: mini chat mockup rendered statically from first 2 blocks (bot bubble + user chip) tinted with the form's theme color — instantly scannable, no screenshots needed.
- Body: title (truncate), meta row: response count `Badge` variant outline · status dot (green Live / gray Draft / amber Closed) · "Edited 2h ago".
- Hover reveals quick actions row: `Share` icon-button (copies link + toast), `Results` icon-button.
- `DropdownMenu` (⋯): Duplicate, Move to workspace, Close/Open, Archive, Delete (`AlertDialog` confirm, typed-name not required).

**Components:** Card, DropdownMenu, AlertDialog, Input, Select, ToggleGroup, Badge, Skeleton, Sonner toast, Empty, Command (palette).

**States**
- *Empty:* centered illustration (duotone doodle of a chat bubble wearing a hard hat), "Your workspace is empty", sub "Create your first form or start from a template.", buttons: New form (primary) / Browse templates (outline).
- *Loading:* 8 × card-shaped `Skeleton`s preserving grid.
- *Error:* `Alert` destructive banner at top + retry button; stale cards remain if refetch fails.
- *Search empty:* Empty component "No forms match 'x'" + clear filters link.

**Interactions:** ⌘K opens command palette (forms ranked by recency); optimistic archive/delete with undo toast (5s); card click → builder Build tab (last visited tab remembered per user).

### 2.2 New form (`/forms/new`)

Full-screen `Dialog` (or route) with three large selectable cards: **Blank** (starts with Greeting + one question), **From template** (searchable gallery grid, same cards as public templates), **Generate with AI** (opens AI Generate modal, §2.12). Recent templates row on top if returning user.

### 2.3 Builder — Build tab (`/forms/[id]/build`)

The flagship screen. Fixed-height flex row under builder top bar; panes independently scrollable.

```
┌──────────────┬───────────────────────────────────┬──────────────────────┐
│ BLOCKS       │  PREVIEW            [🖥 📱] [zoom] │  BLOCK SETTINGS      │
│              │                                   │                      │
│ ⊞ Add block  │  ┌─ device frame ──────────────┐  │  Question            │
│              │  │ 🤖 Hi! I'm Ava 👋           │  │  [textarea_________] │
│ ① Greeting   │  │    What's your name?        │  │                      │
│ ② Name    ⠿  │  │ ┌──────────────────┐        │  │ Description (opt.)   │
│ ③ Email   ⠿  │  │ │ Type your answer │  ➤     │  │  [input____________] │
│ ④ Plan?   ⠿  │  │ └──────────────────┘        │  │                      │
│ ⑤ Rating  ⠿  │  │         [ Maya ]            │  │ Required  [toggle]   │
│ ⑥ Ending     │  └─────────────────────────────┘  │  ─ Placeholder …     │
│              │                                   │  ─ Validation ▾      │
│ ⌂ Endings(2) │  ▸ Test-run from here             │  ─ Branching ▾ (2)   │
└──────────────┴───────────────────────────────────┴──────────────────────┘
```

**Left pane (280px, bg-muted/40):**
- "Add block" button → `Popover` (w-72) with `Command` search + grouped list:
  - *Basic:* Short text, Long text, Email, Number, Phone, URL, Date, Single choice, Multi choice, Rating (stars), Opinion scale, NPS
  - *Rich:* File upload, Image upload, Payment, Signature, Address, Statement (no answer)
  - *Flow:* Greeting, Ending screen, Hidden field
  - *AI:* AI question (LLM-validated free text), Appointment (later phase)
  Each item = icon + label + kbd shortcut hint. Clicking appends after selected block and selects it.
- Block list: virtualized rows (icon, index number, title-or-placeholder truncated, type glyph). Active row highlighted (bg-accent, left 2px orange bar). Drag handle on hover → reorder via `@dnd-kit/core` sortable (auto-scroll near edges). Drop between blocks animates gap open (150ms). Right-click / `DropdownMenu`: Duplicate, Delete, Add branching rule.
- Footer: Endings collapsible section listing ending screens (Default + custom).

**Center pane (flex-1, bg dotted pattern like xyflow Background):**
- Device toggle `ToggleGroup` (desktop/mobile widths 100%/390px frame with phone bezel styling) — tablet intentionally omitted v1.
- **Live chat preview:** renders the *real* chat runtime (§3, package `@chatform/chat-runtime`) in `mode="preview"`: bot greets, respondent can actually type/click through; answers come from local state, nothing persists. "Test-run from here" link restarts preview at selected block with prefilled fake context. Reset button (↺). This guarantees builder preview ≡ production behavior — single source of truth.
- Preview chrome minimal: rounded-xl container, shadow-inner, theme applied.

**Right pane (360px):** settings for selected block. Sections as `Accordion` (Content open by default):

- **Content:** question text `Textarea` (autosize, markdown bold/link supported, char counter), description/help `Input`, placeholder `Input`. For choice blocks: **Options editor** — vertical list rows (drag handle ⠿, input, ✕ remove, radio/check indicator matching type), "+ Add option", "Bulk edit" opens `Dialog` with one-option-per-line textarea, "Shuffle order" `Switch`.
- **Validation** (`AccordionSection`): Required `Switch` + required-error message input (default conversational: "Hmm, this one's required — mind giving it another go?"); type-specific: min/max length, min/max number, regex pattern + human-readable error, date min/max, file types + max size MB + max count.
- **Branching quick-rules:** compact list "If answer … then jump to …": operator `Select` (is / is not / contains / any of / > / < / is answered), value input or option picker, target block `Select` (block list + endings). "+ Add rule". Note linking to Logic tab: "Complex logic? Open the flow diagram →".
- **Media:** attach image/video URL or upload (shown inside bot bubble before question), alt text.
- **AI behavior** (AI question & always-on extraction): extraction hint ("a company name"), max retries before hybrid fallback (§3.9), tone override select (Friendly/Neutral/Formal).

**States:** Loading = 3-pane skeletons; Error = full-pane retry; Deleted-block edge case → select next block automatically. Unsaved-changes guard on route leave (`beforeunload` + in-app dirty check).

### 2.4 Logic tab (`/forms/[id]/logic`)

**Layout:** full-bleed canvas (xyflow fills space minus top bar), floating panels overlay.

- **Canvas:** `ReactFlow` v12, `Background` dots, `Controls` (bottom-left: zoom, fit, lock), `MiniMap` pannable zoomable (bottom-right, muted colors, mask orange for selected).
- **Nodes (custom):**
  - `StartNode`: greeting block, single source handle bottom.
  - `BlockNode`: rounded-xl card (w-56) — type icon in colored chip, question title clamp-2, answer-type caption, badge showing option count; source handle bottom; target handle top; warning ring (amber pulse) if unreachable.
  - `EndingNode`: distinct shape (rounded-full border-dashed) with ending-screen label ("Thanks! 🎉").
  - Selected node: orange ring + opens right drawer.
- **Edges:** `smoothstep`, default gray; conditional edges colored by target option (stable hash → chart palette) with `EdgeLabelRenderer` pill labels ("is 'Team plan'"). Multiple conditions from one block fan out; fall-through/default edge dashed labeled "otherwise".
- **Add-condition panel** (right `Sheet`, 380px, opens on node click or "+ rule"): For selected block — list of existing outgoing rules; add rule: When [option/value/operator] → Go to [block/ending]; visual conflict warnings (two overlapping rules → `Alert` warning inline); delete rule.
- **Toolbar** (top of canvas, floating glass panel): Undo/Redo (history from builder store), Auto-tidy (dagre ELK layout pass, animated node repositioning), Zoom %, "Save" button showing pending-change count → becomes "Saving…" → "Saved ✓". Autosave also applies here after 800ms idle; explicit save flushes.
- Interactions: drag from node source handle to another node target creates connection → if block is choice-type with unassigned options, auto-suggests rule ("Connect as: [option dropdown]"); dropping on empty canvas opens quick-create menu (new block/ending at that point). Double-click canvas → add-block popover pinned there. Keyboard: Delete removes node+edges (confirm if >1 edge lost), Cmd+Z/Y undo redo, F fit view.

**States:** Loading skeleton canvas; Error banner; read-only mode for viewers (role-based) with banner "Read-only".

### 2.5 Theme tab (`/forms/[id]/theme`)

**Layout:** left controls (360px) / center live preview (chat runtime, desktop+mobile frames side-by-side on xl).

Control groups (`Accordion`):
- **Colors:** primary color (12 preset swatches incl. brand orange + native color input), background style `Select` (Solid / Soft gradient / Image URL / Pattern: dots-grid-lines) + image upload; chat surface tint toggle; dark-mode chat `Switch`.
- **Typography:** font pairing `Select` — curated Google fonts rendered in their own face in the dropdown: Inter, Plus Jakarta Sans, Bricolage Grotesque, DM Sans, Nunito, Lora, Space Grotesk; size scale slider (Cozy/Comfortable/Roomy).
- **Bubbles:** bot bubble style `Select` (Soft card — bordered white · Flat — tinted no-border · Elevated — shadow-md); user bubble follows primary; corner radius `Slider` 0–24px; bubble tail `Switch`; avatar: emoji picker popover or image upload (48px circle), "Hide avatar" toggle.
- **Branding:** hide "Powered by chatform" `Switch` (Pro badge), custom thank-you redirect URL.
- **Advanced (collapsed):** custom CSS `Textarea` (scoped under `[data-cf-chat]`, sanitized server-side), CSS vars cheat-sheet link.

Every change applies instantly to preview via zustand theme store (debounced persist 800ms). "Reset to defaults" with `AlertDialog`.

### 2.6 Settings tab (`/forms/[id]/settings`)

Left menu (`nav` list w/ active state) + right content pane. Groups:

- **General:** name, slug (input with availability check, prefix shown `chatform.ai/f/`), description, category select, language (chat UI strings localized), timezone.
- **Access** (all `Switch` + conditional inputs):
  - Schedule: open/close dates (`Calendar` popovers) + closed-message text.
  - Response cap: max submissions + "closed" behavior.
  - Password gate: password input + hint field.
  - Cloudflare Turnstile: site key input + test widget preview.
  - Require sign-in (Google/email) before start.
  - Duplicate prevention: method checkboxes (browser fingerprint / email dedupe / hidden-field identity) with explanation text each.
- **Notifications:** "Email me on new response" switch + recipient emails multi-input (chips); digest mode (instant/daily/weekly); respondent confirmation email toggle + editable subject/body (variables insert menu: `{{answer:Name}}`, tokens).
- **Hidden fields & variables:** table of hidden fields (key, default value, capture-from-URL toggle) + UTM auto-capture switches; computed variables (later phase).
- **Meta & OG:** title, description, OG image upload w/ preview card (renders like a Slack/Twitter unfurl), noindex toggle.
- **Danger zone** (destructive border card): Transfer to workspace, Duplicate form, Reset responses (`AlertDialog` typed confirmation "DELETE"), Delete form permanently.

### 2.7 Share tab (`/forms/[id]/share`)

Two-column: left actions / right live QR+preview.

- **Link card:** readonly input `https://chatform.ai/f/team-check` + Copy `Button` (check morph on success), Edit slug link → Settings, short-link toggle `s.cf.io/x7k`.
- **QR card:** generated QR (orange modules on cream) sized 160px, Download PNG/SVG `DropdownMenu`, accent-color picker.
- **Embed generator** (`Card` with segmented control): type `Tabs`: Inline · Popup · Sidewidget · Fullpage. Options per type (position corner select, trigger: button/auto-delay seconds/exit-intent, width×height sliders, auto-open once-per-visitor toggle, custom launcher emoji/text). Below: code block (`ScrollArea`, mono, syntax-highlighted) regenerating live, e.g.
  ```html
  <script src="https://cdn.chatform.io/embed.js"
    data-form="team-check" data-type="sidewidget"
    data-position="right" defer></script>
  ```
  + React/npm tab (`npm i @chatform/react`). Copy buttons per format.
- **Custom domain:** input, DNS verification steps (`Alert` with CNAME record to copy), status badge flow: Pending → Verifying (spinner) → Verified ✓ (green) / Failed with troubleshooting expandable.

### 2.8 Integrate tab (`/forms/[id]/integrate`)

Grid of integration `Card`s (icon, name, one-liner, connect state badge). Click → `Sheet` (480px) with config:

- **Webhooks:** endpoint list (URL, events toggles: `response.created`, `response.completed`, `session.started`; secret regenerate; delivery log table: timestamp/event/status code/latency/retry button; "Send test" button).
- **Google Sheets:** Connect (OAuth), spreadsheet picker, column mapping (auto-mapped by question title, editable selects), sync status + "Resync all".
- **Zapier / Make:** connect instructions + "Use this form's trigger URL" copy field.
- **Slack:** channel select, message template with variable chips, test ping.
- **Email notifications:** mirrors Settings > Notifications (shared store).
- **REST API card:** link to docs, sample curl with this form's ID prefilled + personal-key CTA → `/api-keys`.

### 2.9 Results tab (`/forms/[id]/results`)

Top: `Tabs` Submissions | Summary | Analytics; global filter bar (date range `Calendar` range popover presets: 7d/30d/90d/custom, device `Select`, completion status `Select`); export CSV `Button` (respects filters, streams).

**Submissions:**
- Data table: columns = submitted-at, duration, status (Completed/Partial `Badge`), device icon, first 3 questions as condensed columns + column visibility `DropdownMenu`, row actions. Virtualized for 10k+ rows (`@tanstack/react-virtual`), infinite scroll + "Load more". Row selection checkboxes → bulk delete/archive.
- **Row click → Transcript viewer:** right `Sheet` (560px, full-height):
  - Header: respondent meta (device, location, referrer, started/completed time), star flag toggle, delete.
  - Body: **the actual conversation** rendered by chat-runtime in read-only mode — bubbles, uploaded images as thumbnails (lightbox on click), payment as "Paid $49 ✓" system line, signature thumbnail.
  - Right rail within sheet: extracted fields key-value list (copy-all JSON button), hidden fields/UTM captured.
- Partial-response banner: "This respondent abandoned at Q4 · 62% through".

**Summary:** per-question card stack (order = form order). Each card: question title + type icon + n responses; chart chosen by type via shadcn Charts (`ChartContainer` + Recharts): Single choice → donut `PieChart` w/ legend percentages; Multi → horizontal `BarChart`; Rating/NPS/Scale → histogram bars + average stat; Text → top-terms chips + searchable answer list (virtualized); Date/file/payment → stat lines. "Filter results by this answer" action on chart segments → cross-filters submissions table (breadcrumb chips above, removable).

**Analytics:**
- KPI row (4 stat cards): Views, Starts, Submissions, Completion rate (with delta vs previous period arrow).
- Trend: stacked `AreaChart` views/starts/submissions over time (brush for zoom).
- **Drop-off funnel:** horizontal `BarChart` per block — x = remaining respondents; hovered bar highlights corresponding block tooltip with its question; below-average segments tinted rose.
- Distribution row: device `PieChart`, median time-to-complete stat, top referrers table.
- All charts share the filter bar state; empty range → Empty state.

### 2.10 AI Generate modal (global to `/forms/new` and builder toolbar "✨ Generate")

Full `Dialog` (max-w-2xl), 3 stages:

1. **Prompt:** textarea ("A feedback form for my yoga studio — friendly tone, ask about classes, instructors, booking experience…"), example prompt chips (CSAT · Lead gen · Event RSVP · Job application), options row: # questions `Select` (5–15), tone `Select`, language `Select`. Generate `Button` (sparkles icon).
2. **Progress:** animated step list with streaming status text: "Understanding your goal…" → "Drafting 8 questions…" → "Designing branching logic…" → "Ready." Each step check-marks in sequence; cancel button aborts SSE stream.
3. **Review diff:** two-pane compare — left current structure (if any), right generated blocks list; each row checkbox-checked with +/- gutter coloring (additions orange, modifications violet); branch rules summarized as indented chips ("If NPS ≥ 9 → ask testimonial consent"); "Regenerate" ghost button re-runs with same prompt; **Apply** merges into builder, toast "Generated 8 questions · Undo".

### 2.11 API keys page (`/api-keys`)

- Explainer `Alert` (info): what keys can do + docs link + rate limits table (per-plan).
- Keys table: name, `sk_live_••••3f9a` masked prefix mono, scopes badges, created, **last used** (relative + IP), revoke icon → `AlertDialog`.
- "Create key" → Dialog: name input, scope checkboxes grouped (`forms:read/write`, `responses:read`, `sessions:create`, `webhooks:manage`, `usage:read`), expiry optional date. On create: secret revealed ONCE in `Alert` warning-styled card w/ copy button + "I've stored it safely" confirm checkbox before closing.
- Empty state: terminal-style illustration + "Your first key" walkthrough (3 numbered steps).

### 2.12 Usage & billing

- **Usage:** three meter cards (submissions, AI messages, seats) — radial progress + "used/quota" + resets-on date; 90-day stacked bar history chart; per-form breakdown table sorted desc; over-quota state turns meter rose + upgrade CTA.
- **Billing:** current plan card (name, price, renewal, manage-in-Stripe button), plan comparison `Table` w/ per-plan CTA (Current/Upgrade), invoices table (date, amount, status badge, PDF link), payment method row (brand •••• last4, update → Stripe portal).

### 2.13 Team & account

- **Team:** members table (avatar, name, email, role `Select` Owner/Admin/Editor/Viewer, ⋯ remove), invite dialog (email + role, generates invite link w/ copy), pending invites section, role-permission matrix expandable.
- **Account:** profile (name, avatar upload), email + change flow, password, connected OAuth accounts list, active sessions table (revoke others), delete-account danger zone.

---

## 3. The respondent chat experience (core differentiator)

One runtime (`@chatform/chat-runtime`) powers: builder preview, hosted `/f/[slug]`, embedded iframe widget, and transcript playback (read-only). Server is the turn engine: client sends answers, server decides next question, streams bot prose over SSE.

### 3.1 Stage anatomy (hosted `/f/[slug]`)

- Full-viewport themed surface (cream default), content column max-w-2xl centered vertically-ish (messages grow upward from lower third — Typeform-like focus), generous padding.
- Top-right floating controls (appear on hover/focus): progress "3/12", restart ↺ (confirm `AlertDialog` inline), sound off (future), powered-by mark.
- Bottom: composer docked, safe-area padded on mobile.
- No nav chrome, no branding beyond avatar + subtle wordmark footer.

### 3.2 Message flow & rendering

- **Greeting:** on load, bot avatar + typing dots (600–900ms artificial delay, skipped if reduced-motion... no—delay kept but shortened) → greeting streams in (~40 chars/s, skippable on tap). If form has intro media/image, it appears as a rich bubble.
- **Bot messages:** left-aligned, avatar 32px, bubble per theme (soft card default: white bg, warm border, radius-lg, tail toward avatar, shadow-xs). Streaming caret `▍` blinks while generating.
- **User messages:** right-aligned, primary-orange bubble, white ink, tail toward composer. Enter to send.
- **System lines** (centered, muted, xs): "— resumed draft —", payment confirmations, file notes.
- **aria-live="polite"** region mirrors streamed text for SR users; composer keeps persistent focus (questions announce without stealing focus).

### 3.3 Per-block-type renderers (composer + bubble behaviors)

| Type | In-chat UX | Details |
|---|---|---|
| Short text | inline `Input` in composer | autofocus; Enter submits |
| Long text | expanding textarea (max-h-40, autoscroll) | Shift+Enter newline; char counter appears near limit |
| Email/Phone/URL/Number | typed input w/ correct `inputMode`/`autocomplete` attrs | client pre-validation; server authoritative |
| Single choice | **quick-reply chips** above composer | up to 6 visible, horizontal wrap/scroll; keyboard 1–9 shortcuts (kbd hints on hover); selecting sends immediately |
| Multi choice | toggleable chips w/ ✓ fill + "Confirm" chip appears after ≥1 | Enter confirms too |
| Rating | interactive ★★★★★ row rendered INSIDE bot bubble area | hover fill animation (scale 1.15 stagger), click submits; half-stars off |
| Opinion scale / NPS | numbered pill buttons 1–10 / 0–10 with end labels | same chip mechanics |
| Date | `Popover` + `Calendar` (shadcn) anchored above composer | also accepts typed natural language ("next friday") parsed server-side w/ confirmation echo |
| File upload | paperclip button + drag-drop onto stage | progress ring bubble during upload → file-card bubble (icon, name, size) or image thumb (click lightbox); camera capture button on mobile |
| Image upload | same, previews large thumb | multi-image grid if allowed |
| Payment | secure bubble embedding Stripe Payment Element in isolated iframe | never touches our JS; success → system line "Paid $49.00 ✓" + receipt email note; test mode banner in preview |
| Signature | `Dialog` modal w/ pressure-friendly pad (pointer events), Clear/Confirm | result PNG thumb bubble, tap to re-open |
| Address | structured mini-card (street/city/zip fields) OR free-text per setting | autocomplete via provider later |
| Statement | bot message only, "Got it" continue chip | for disclosures/instructions |
| AI question | free text | server LLM validates/extracts; may ask clarifying follow-up (streamed) before accepting; retries capped → hybrid fallback |
| Hidden field | invisible; captured silently from URL/session | listed in transcripts only |

### 3.4 Conversational validation & error handling

- Never red-box-and-shame. Bot replies as a new message referencing context: *"Hmm, `maya#hot` doesn't look like a valid email — could you double-check it?"* (template per validation type + tone from theme/AI settings).
- Invalid attempt #1: conversational retry only. Attempt #2: retry + hint chip (e.g., "Format: you@mail.com"). Attempt #3 (**hybrid mode fallback**, configurable per form/block): bot posts helper card — a proper labeled `Input` + inline error + Submit button — while keeping chat framing ("Or type it here 👇"). Works for email/number/date/URL; choice blocks never degrade (chips are already structured).
- Upload failures: bubble turns destructive-bordered with "Retry upload" chip; original file kept staged.
- Network loss: composer disabled → inline banner "Reconnecting… your answers so far are safe" (session persisted server-side per message).

### 3.5 Progress, control, resume

- Progress: slim 3px bar under top controls + "3 of 12" pill; percentage derived from weighted position in active branch path (server-computed; branches make linear counts wrong otherwise).
- Back: ← button beside composer (and "back" quick-reply on mobile) removes last user exchange, restores previous question with prior answer prefilled in composer. Server session supports rewind (answers array popped).
- Restart: confirm dialog wipes session, fresh start.
- **Resume banner:** returning visitor with unfinished session sees, above greeting, a slim card: "👋 You were halfway through this — 4 answers saved." [Continue] [Start over]. Powered by anonymous session token in localStorage + server session TTL 30 days.
- **Thank-you ending:** bot final message (configurable, emoji/markdown), optional confetti burst (canvas-confetti, brand colors, skipped on reduced-motion), CTAs (buttons/links/social share), response reference ID ("Receipt #CF-4821"), auto-redirect if configured. Multiple endings from logic → different screens.

### 3.6 Accessibility

- Full keyboard operability: Tab reaches composer/chips/modals in DOM order; chips have roving tabindex + arrow-key navigation; Enter/Space activate; Esc closes modals returns focus to composer.
- SR: polite live region streams bot text; each question announces as heading level 2; widgets have aria-labels ("Rate 4 out of 5 stars"); upload progress announced; error messages tied via `aria-describedby`.
- Focus-visible rings (orange) everywhere; contrast AA minimum including user-bubble white-on-orange (verified against palette); prefers-reduced-motion disables confetti/streaming animation (text appears whole)/dot bounce.
- Touch targets ≥ 44px; chat usable at 200% zoom and with dynamic type.

### 3.7 Mobile layout

- Hosted: single column full-screen; messages area scrolls under translucent top bar (progress collapses to bar only); composer sticky bottom with `env(safe-area-inset-bottom)`; keyboard-aware via `visualViewport` resize listener (composer lifts, messages pin to bottom); chips become horizontally scrollable row; signature/payment dialogs go full-screen sheets.
- Tap targets relaxed spacing; long-press composer for paste helpers on iOS.

### 3.8 Theme application

Theme JSON (from form record) compiles to CSS custom properties scoped on `[data-cf-chat]`: `--cf-primary`, `--cf-bg`, `--cf-bot-bubble`, `--cf-user-bubble`, `--cf-radius`, `--cf-font`, etc. Runtime consumes only these vars — same mechanism in preview/widget/hosted guarantees WYSIWYG. Dark chat mode swaps var set; host page `<meta theme-color>` synced.

### 3.9 Embeddable widget

- **Launcher:** floating circular button (56px, primary color, chat icon ↔ ✕ morph), position configurable (corners), unread dot + optional teaser bubble ("Questions? Chat with us 👋") after delay. Respects z-index 2147483000, doesn't trap scroll.
- **Panel:** desktop 380×640 rounded-2xl shadow-2xl sheet anchored to launcher (scale+fade+slide spring open ~250ms cubic-bezier(.32,.72,0,1)); mobile: full-width/height sheet sliding up. Contains the identical runtime; header strip (avatar, form title, minimize).
- Pre-chat gate optional: small "Before we start" card (name/email) defined as form's hidden/auth config.
- Events posted to parent via `postMessage`: `cf:ready`, `cf:start`, `cf:step(blockId)`, `cf:submit`, `cf:close` — enabling GTM/analytics triggers for hosts.

---

## 4. Design system

### 4.1 Color tokens (Tailwind v4 `@theme`, oklch)

Light (default — warm cream):

```css
--color-background:      oklch(0.984 0.007 95);  /* warm cream  */
--color-foreground:      oklch(0.255 0.010 65);  /* ink (stone-leaning) */
--color-card:            oklch(1 0 0);
--color-card-foreground: oklch(0.255 0.010 65);
--color-popover:         oklch(1 0 0);
--color-muted:           oklch(0.962 0.008 88);  /* sand */
--color-muted-foreground:oklch(0.520 0.014 68);
--color-secondary:       oklch(0.945 0.018 82);
--color-accent:          oklch(0.935 0.042 70);  /* peach wash */
--color-border:          oklch(0.905 0.011 80);
--color-input:           oklch(0.905 0.011 80);
--color-ring:            oklch(0.705 0.190 43);

--color-primary:         oklch(0.705 0.190 43);  /* chatform orange */
--color-primary-foreground: oklch(0.995 0.005 85);
--color-primary-hover:   oklch(0.655 0.195 41);
--color-primary-soft:    oklch(0.952 0.038 60);  /* tint bg */

--color-destructive:     oklch(0.585 0.215 27);
--color-success:         oklch(0.630 0.165 152);
--color-warning:         oklch(0.775 0.155 75);
--color-info:            oklch(0.620 0.135 250);

--color-chart-1..6: orange / teal / violet / amber / rose / sky;
```

Dark (class `.dark`, next-themes, warm charcoal — never blue-black):

```css
--color-background: oklch(0.205 0.008 65);  --color-card: oklch(0.245 0.009 63);
--color-foreground: oklch(0.950 0.008 88);  --color-muted: oklch(0.280 0.010 62);
--color-border: oklch(0.320 0.011 62);      --color-primary: oklch(0.750 0.170 50); /* lifted orange for contrast */
```

Chat-specific tokens: `--cf-chat-bg`, `--cf-bot-bubble-bg/border/radius`, `--cf-user-bubble-bg`, `--cf-composer-bg`, `--cf-chip-bg/border-hover`, mapped from theme JSON at runtime (§3.8).

shadcn mapping: standard `--background/--foreground/--primary/…` variables consumed via Tailwind v4 utilities (`bg-background`, `text-foreground`…). Base UI style: **new-york**, icons `lucide-react`.

### 4.2 Typography

Via `next/font/google`:

- **Display/headings & brand:** *Bricolage Grotesque* (variable) — warm, characterful, not corporate.
- **UI/body & chat:** *Inter* (variable) — neutral legibility at small sizes; `font-feature-settings: "cv11"` for single-story a in chat.
- **Mono (keys, embed code, IDs):** *JetBrains Mono*.

Scale (px/leading/tracking): display-xl 48/1.05/-0.02em (landing only) · display-lg 36/1.1/-0.01em · display 30/1.15 · h1 24/1.25/-0.01em · h2 20/1.3 · h3 16/1.4 · body 14/1.5 · body-lg 16/1.55 (chat messages use 15–16) · sm 13/1.45 · xs 12/1.4 · mono 13. Chat bubbles: 15.5px/1.55 for readability; question text may use Display font at 18px for personality (theme-dependent).

### 4.3 Spacing, radii, elevation

- Base 4px grid; section rhythm 24/32/48; builder pane gaps 0 (borders) with internal 16/24.
- Radii: `--radius: 0.75rem` base; buttons/inputs rounded-lg (calc from base), cards rounded-xl (1rem), modals rounded-2xl, chips rounded-full, bubbles `--cf-radius` (default 1.125rem) with tail corner 4px.
- Shadows (warm-tinted, layered): xs `0 1px 2px oklch(0.25 0.02 65 / 0.06)`; sm `0 1px 3px /0.07, 0 1px 2px /0.05`; md `0 4px 12px -2px /0.09`; lg `0 12px 32px -8px /0.14`; widget panel uses lg + ring 1px border/40.

### 4.4 Component language decisions

- Primary buttons: orange fill, white text, hover darkens + translateY(-1px)? No — keep static; press scales 0.98. Focus ring 2px offset.
- Cards: white on cream with border + shadow-xs; interactive cards lift (shadow-md, -2px) with 150ms ease-out.
- Badges: pill, soft backgrounds (primary-soft/accent/destructive/10%).
- Tables: header sticky, row hover bg-muted/50, dense 40px rows.
- Icons: lucide, 16px inline / 20px controls, stroke 1.75.
- Illustrations: single duotone style — ink strokes + orange/peach fills, hand-drawn wobble; used ONLY in empty states and marketing.

### 4.5 Motion guidelines

- Durations: micro 120ms, standard 180ms, entrances 220ms; easing `cubic-bezier(0.2, 0, 0, 1)` out; springs only for widget/sheets `cubic-bezier(0.32, 0.72, 0, 1)`.
- Chat: message enter = fade + translateY(8px) + scale(0.985), 200ms; typing dots = 3×6px circles, opacity/translateY loop 900ms staggered 150ms; streaming caret blink 800ms steps; chips enter staggered 30ms; new message auto-scroll smooth unless user scrolled up (then "jump to latest ↓" pill).
- Builder: block list reorder uses dnd-kit transforms (no transitions during drag, settle spring); right-panel content crossfades 120ms on selection change; xyflow edges draw-in on first load 400ms staggered.
- Reduced motion: all transform/loop animations collapse to opacity-only or none.
- Never animate: tables, billing, settings toggles beyond standard switch.

### 4.6 Empty states inventory

Dashboard (hard-hat bubble), Forms search, Blocks list (never empty — seeded), Results (bot holding clipboard: "No responses yet — share your form"), Analytics filtered-empty, API keys (terminal), Integrations disconnected, Transcripts partial. Each: illustration 96px, title (sentence case, warm tone), one-line sub, single CTA.

---

## 5. Frontend architecture

### 5.1 Monorepo

pnpm workspaces + Turborepo:

```
apps/
  web/        Next.js 16 (App Router) — marketing + app + hosted /f + /embed iframe app
  widget/     Vite build → iframe bundle (chat runtime shell) served from CDN
packages/
  chat-runtime/  framework-agnostic TS chat engine + React adapter (@chatform/chat-runtime)
  api-client/    hc<AppType> typed client + React Query hooks (@chatform/api-client)
  ui/            shared primitives extending shadcn (FormCard, StatCard…) — thin!
  config/        tsconfig, eslint, tailwind preset (tokens §4.1)
```

Rule: `ui` stays thin; screens compose raw shadcn directly. `chat-runtime` has zero deps on web app; consumed by web (preview + /f + transcripts) and `widget`.

### 5.2 Rendering & data fetching (Hono RPC + React Query)

- API: Hono app mounted at `app/api/[[...route]]/route.ts`; `export type AppType = typeof routes` from a shared `packages/api-schema` (zod validators shared both sides; hono-openapi emits OpenAPI → docs).
- Client singleton: `hc<AppType>("")` with `credentials: "include"`; wrapper adds typed error envelope handling (`{ error: { code, message } }` → `ApiError` class with codes like `VERSION_CONFLICT`, `QUOTA_EXCEEDED`).
- React Query v5 defaults: `staleTime 30_000`, retry 1 (not on 4xx), `refetchOnWindowFocus` true for lists only.
- Query key factory: `qk.forms(wsId, filters)`, `qk.form(id)`, `qk.blocks(id)`, `qk.responses(formId, query)`, `qk.analytics(formId, range)`, `qk.usage()`.
- Server Components fetch via direct internal call (server hc instance, no HTTP hop) and hydrate with `HydrationBoundary` for fast first paint on dashboards/results; client takes over for interactivity.
- Mutations: centralized hooks (`useUpdateBlock`, `useReorderBlocks`, `useCreateKey`…) each defining `onMutate` optimistic patch + snapshot rollback + `invalidateKeys` on settle.

### 5.3 Builder state (zustand)

```ts
// stores/builder.ts — slices: blocks[], selectionId, history(past/future),
// dirty:Set<blockId>, previewDevice, themeDraft, saveStatus
```

- `zustand` + immer + temporal middleware for undo/redo (cap 100 entries; coalesce drag ops into one history unit).
- Store is the single writer: components dispatch actions (`moveBlock`, `updateBlock(id, patch)`, `addRule`); a persistence middleware diffs against last-saved snapshot and schedules debounced PATCH (§5.4). React Query cache holds server truth; store hydrates on mount, pushes on save.
- Selection-driven right panel subscribes with shallow selector — no re-render storms during drags.

### 5.4 Autosave & version conflicts

- Debounce 800ms after last mutation (flush on blur/tab-hide/unload via `sendBeacon`-style flush).
- PATCH `/forms/:id` carries `{ baseVersion }`; DB bumps version monotonically. On `409 VERSION_CONFLICT`: autosave pauses → `AlertDialog` "Someone (or another tab) changed this form" with **Reload theirs / Keep mine (force-push)** and a mini diff summary (blocks added/removed counts). Presence awareness (v2): broadcast cursor via websocket later.
- Indicator states in builder bar: dot-gray "Saved 12:04" · spinner "Saving…" · amber dot "Unsaved changes" · red "Offline — will retry".
- Logic tab shares the same pipeline; explicit Save button just flushes immediately (graph edits are chunkier).

### 5.5 Chat session protocol

- `POST /v1/sessions {slug}` → `{ sessionId, turn: { botMessages[], block, expects } }`
- `POST /v1/sessions/:id/messages { value | files[] }` → `{ turn }` (bot prose streamed via SSE below; structural payload in JSON envelope)
- `GET /v1/sessions/:id/stream` (SSE): events `token`, `turn`, `error`, `ping` (15s heartbeat). Same endpoint powers third-party headless builds → documented publicly.
- Client hook `useChatSession(slug)`: manages idempotent send queue, optimistic user bubbles (pending tick → sent), SSE consumption, reconnect.

### 5.6 SSE resilience

`EventSourceStream` wrapper: exponential backoff 500ms→8s (jitter ±30%), resumable via `Last-Event-ID`; on reconnect, server replays undelivered tokens or collapses to full current message; heartbeat timeout 20s forces reopen; hard failure → poll fallback `GET /sessions/:id/state` every 3s until SSE re-establishes. Exposed status machine: `connecting | open | degraded | offline` driving the reconnect banner (§3.4).

### 5.7 Widget isolation & embed.js loader

- `apps/widget` builds standalone bundle (iframe strategy — bulletproof CSS/JS isolation, no shadow-DOM portal pain): served at `https://cdn.chatform.io/w/{version}/index.html#/embed/{slug}?type=…`. Target ≤ 60KB gzip shell + runtime chunk loaded lazily post-open (launcher itself needs almost nothing).
- Parent↔iframe bridge (`postMessage`, strict origin allowlist): `cf:open/close/toggle`, `cf:resize(height)` (inline mode), analytics events out, `prefill`/`hiddenFields` in via query or JS API.
- **embed.js** (<3KB, no deps, ES5-safe): parses `data-*` attributes or `window.ChatformQueue` pre-config; injects launcher button + iframe lazily (on intent/hover to protect host LCP); exposes `window.Chatform = { open(), close(), toggle(), on(event, cb), setLocale(), refresh() }`; handles exit-intent/scroll triggers; CSP-friendly (no eval, nonce guidance in docs).
- **Self-host paths:** (a) npm `@chatform/react` — React component wrapping chat-runtime for in-app embedding with props (`formSlug`, `theme`, callbacks) — for customers who want native feel; (b) vanilla `@chatform/js` SDK driving the headless REST/SSE for fully custom UIs; both documented in `/docs` alongside script-tag path.

### 5.8 Cross-cutting

- Auth: Better Auth (email+password, Google/GitHub OAuth, org/workspace plugin); middleware guards `(app)`; sessions in httpOnly cookies; CSRF double-submit for mutations.
- Feature flags: simple server-side plan gates (`planFeatures` map) surfaced through `usePlan()` — Pro-gated controls render enabled with upsell popover rather than hidden (discoverability).
- i18n scaffolding from day 1 (`next-intl`), en shipped first; chat UI strings already keyed per form language (§2.6).
- Observability: Sentry + web-vitals RUM; chat funnel events (`session_started`, `block_answered`, `dropoff`) to internal analytics store powering Results.
- Testing: Vitest + Testing Library for runtime/store logic; Playwright e2e golden paths (build→publish→respond→results; embed handshake; SSE reconnect simulation); Chromatic on storybook for ui + chat bubbles.

---

## 6. Implementation phases (frontend)

Each phase ships behind the matching backend capability. Acceptance criteria are demo-able checks.

**Phase 0 — Foundations (wk 1–2)**
Deliverables: monorepo scaffold, Tailwind v4 token preset + fonts, shadcn init (new-york) + theming (light/dark), app shells ((marketing)/(app)/(auth) layouts), auth flows, Command palette, Toaster, CI (typecheck/lint/storybook), Storybook for tokens.
✅ AC: login→dashboard round-trip; ⌘K navigates; dark mode persists; tokens lint-enforced (no raw hex in app code).

**Phase 1 — Forms CRUD + Dashboard (wk 3–4)** *(needs: forms API)*
Dashboard home (cards/search/sort/filter/empty/loading/error), create modal (blank/template), rename/delete/duplicate optimistic, workspace switcher, basic settings tab (general), publish toggle.
✅ AC: create form in <5s; delete undo works across reload; 60fps scroll at 200 forms (virtualized if needed).

**Phase 2 — Builder MVP + hosted chat v1 (wk 5–8)** *(needs: blocks + session APIs)*
Build tab 3 panes (add-block popover, dnd-kit reorder, right-panel Content/Validation for text/email/choice/rating/date/scale), zustand store + autosave + conflict dialog, live preview via chat-runtime, hosted `/f/[slug]`: greeting→questions→ending, chips, typed inputs, conversational validation, progress/back/restart/resume, theme vars applied.
✅ AC: build a 5-question lead form entirely mouse-only in <2min; preview ≡ hosted behavior; autosave survives kill-tab; SSE drop mid-form recovers with zero answer loss (Playwright network-chop test).

**Phase 3 — Logic graph + rich blocks + Theme studio (wk 9–11)**
Logic tab (nodes/edges/condition Sheet/auto-tidy/save states), branching honored by engine, Theme tab (colors/fonts/bubbles/avatar/bg + live dual preview), rich blocks: file/image upload, signature modal, payment (Stripe test mode), statement/endings editor, hybrid fallback UI.
✅ AC: build NPS→conditional-testimonial→ending flow visually; upload 10MB file on throttled 3G profile succeeds with progress+retry; payment completes in preview sandbox; theme changes reflect in opened hosted tab after republish.

**Phase 4 — Results & analytics (wk 12–13)** *(needs: responses + rollups)*
Submissions table (virtualized, filters, bulk ops), transcript viewer sheet, Summary per-question charts, Analytics KPIs/trend/drop-off, CSV export, cross-filter breadcrumbs.
✅ AC: 10k responses scroll jank-free; transcript pixel-matches live chat styling; CSV matches filtered view row-for-row; drop-off bar maps 1:1 to block list.

**Phase 5 — Developers: widget + API keys + integrations UI (wk 14–16)** *(needs: keys, webhook dispatch)*
embed.js + iframe widget app (popup/sidewidget/inline/fullpage), postMessage bridge + resize, `@chatform/react` npm alpha, API keys page (create/reveal-once/scopes/last-used/revoke), Integrate tab (webhooks config + delivery log + test send, Sheets connect/map, Zapier/Make/Slack cards), custom domain UI w/ verify states.
✅ AC: script-tag embed works on a plain HTML page + WordPress sandbox; launcher→panel <300ms perceived (launcher instant, panel streams in); revoked key rejected within 60s; webhook delivery log shows test event <2s.

**Phase 6 — AI Generate + polish (wk 17–19)**
AI Generate modal (prompt→stream progress→diff review→apply+undo), usage meters + over-quota states, billing pages (Stripe checkout/portal/invoices), team invites/roles UI, a11y audit fixes (axe + manual SR pass), performance pass (route budgets, widget size audit), marketing landing w/ interactive chat demo.
✅ AC: generate 8-question flow and apply in <45s incl. review; keyboard-only user completes a full form (recorded proof); widget total ≤60KB gzip pre-open; Lighthouse a11y ≥95 on app routes, ≥98 on /f.

**Ongoing (post-v1):** realtime collaboration cursors in builder, appointment block, multilingual forms UI, response tagging/notes, template marketplace publishing flow, Slack-native approvals.
