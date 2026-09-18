# Link building plan — chatform.in

Written 2026-09-18. Everything here is something **you** do (accounts, listings,
emails); the code side is done or noted at the end. Work top to bottom.

## Where we are

**Foundation phase.** First commit 2026-08-24, so the domain is about four weeks
old. Google has **no pages indexed** — not even for "chatform", where four
unrelated products (chatform.com, .co, .org, .site) take every result. No
backlinks, no brand signals, no knowledge panel.

That decides the order: prove to Google that chatform.in is a real, distinct
entity first (profiles, directories), then earn links with content, and only
then do outreach. Outreach for a site Google has not indexed converts badly.

## Step 0 — this week, 30 minutes (blocks everything else)

1. **Google Search Console**: add the `chatform.in` domain property (DNS TXT
   record in Cloudflare), submit `https://chatform.in/sitemap.xml`, and use
   *URL inspection → Request indexing* on: `/`, `/conversational-forms`,
   `/form-templates`, `/compare`, `/typeform-alternative`, `/pricing`.
2. **Bing Webmaster Tools**: import from Search Console (one click). Bing also
   feeds ChatGPT search and DuckDuckGo.
3. Check the **Cloudflare managed robots.txt** (AI Crawl Control) — per the
   comment in `apps/web/src/app/robots.ts` it blocks GPTBot, ClaudeBot and
   Google-Extended at the edge. Allow at least the search/retrieval bots
   (OAI-SearchBot, ChatGPT-User, PerplexityBot, Claude-User) if you want to be
   cited in AI answers.

## Step 1 — weeks 1–2: entity stacking (~20 profiles)

Same name everywhere: **chatform** (lowercase), same one-line description, same
logo, link to `https://chatform.in`. Spread creation over two weeks, and post at
least once on each — an empty profile is a weak signal.

| Platform | Why | Notes |
|---|---|---|
| LinkedIn company page | Entity + founder link | Link your personal profile as founder |
| X / Twitter `@chatform…` | Entity | Pin a post with the demo |
| GitHub org | DR 96 | Publish `@chatform` SDKs / an example repo; README links home |
| Crunchbase | DR 91, dofollow | Free basic listing, founder = Mohith Kumar |
| Product Hunt (maker profile + upcoming page) | Launch later — see step 3 | |
| Indie Hackers product page | Founder community, dofollow profile | |
| Medium / dev.to | Repost the two engineering posts with canonical → chatform.in | |
| YouTube | 60-second demo video | Links in description |
| Wikidata | Highest leverage for a knowledge panel | Only once there is independent coverage to cite; otherwise it gets deleted |

**Send me every profile URL** — I'll add them to `sameAs` in the Organization
schema (`apps/web/src/lib/seo.ts`). That is what ties them to the site for
Google, and it is the strongest fix for the name collision.

## Step 2 — weeks 1–3: software and AI directories (15–20 listings)

Quality over count; 20 good listings beat 200 junk ones.

**Software review sites** (links + buyer traffic):
- **G2** and **Capterra** (free vendor listings; ask your first 5 happy users for reviews)
- **AlternativeTo** — list chatform as an alternative to Typeform, Tally, Google
  Forms, Jotform, SurveyMonkey, Fillout. People search these pages directly.
- **SaaSHub**, **SaaSworthy**, **GetApp** (via Capterra)

**AI tool directories** (chatform qualifies — AI-powered follow-ups):
- There's An AI For That, Futurepedia, Toolify, FutureTools, AI SuperHub
- **aiformbuilders.com** — a directory specifically for AI form builders
- Smol Launch (weekly launch, badge-verified dofollow on free tier)
- Skip paid-only and "reciprocal link required" directories.

**Launch sites** (one-time spikes of links and users):
- **Product Hunt** — launch on a Tuesday–Thursday once 10+ templates and the
  guides are live (they are). Tagline: *"Forms that ask the follow-up question"*.
- BetaList, Microlaunch, Uneed, Peerlist launchpad (Indian founder audience).

### Listing copy (reuse verbatim so it stays consistent)

**Tagline (60 chars):** Conversational forms that ask the follow-up question

**50 words:** chatform turns forms into conversations. It asks one question at a
time, reads each answer, and follows up when a reply is too vague to use. It
can answer respondents' questions from your notes (Pro), then carries on. Free
with unlimited responses; 35 templates for intake, applications, feedback and more.

**150 words:** add to the above —
Most forms lose people to length and get one-word answers to the questions that
matter. chatform fixes both: people see one question at a time, and an AI reads
free-text answers, asking again when "growth" or "n/a" is not an answer you can
use. Choice and consent answers are matched exactly and never sent to a model,
and a state machine owns the order, so nothing is skipped. When someone leaves
halfway, chatform keeps their answers and (on Pro) sends up to three reminders,
each linking back to the question they stopped on. Share a link, embed it, or
drive it headlessly through the API.

**Categories:** Form builder · Survey software · Conversational AI · Lead
generation · No-code.

## Step 3 — weeks 3–6: first real links (target 5–10)

### a) The hackathon (warmest link you have)
The university hackathon that ran its registration on chatform
(`frm_a90fed423354`) is a real customer on an academic domain. Ask the
organisers for a line on the event page or college site: *"Registrations
powered by chatform"*. An `.ac.in`/`.edu.in` link is worth more than every
directory above combined. Ask for a short quote too — it is your first
testimonial.

### b) "Built with" showcases (the tools chatform is made of)
These pages want real projects and link to them:
- **Fumadocs showcase** (fumadocs.dev/showcase — PR to the repo) — the docs site
- **React Flow / xyflow showcase** (reactflow.dev/showcase) — the template flow diagrams
- **Better Auth** and **Hono** showcases / "who uses" lists
- **OpenRouter app rankings** — the API already sends `HTTP-Referer` and
  `X-Title`, so chatform should appear on openrouter.ai's app pages; claim it.
- **Cloudflare Workers** built-with / customer stories (apply via the Workers Launchpad).

### c) Get into the existing "best form builder" lists
Lists already ranking for the category — ask to be added, pitching the one
thing almost none of their entries do (AI follow-ups on thin answers, plus
answering the respondent's questions; Jotform's AI Agents are the only other one):
- neomanex.com — "Best Conversational Form Builders 2026: 9 Tools Ranked"
- formester.com — "18 Best Conversational Form Builder Tools 2026" (vendor, but lists competitors)
- forms.app — "Best form builders for 2026: top 20+"
- zite.com — "7 Best AI Form Builders for 2026"
- involve.me — "11 Best AI Form Builders in 2026"
- perspective.co — "15 Best AI Form Builders for 2026"
- surveyninja.io — "Best Form Builders in 2026"
- Zapier — "Best free survey tools / form builders" (hard, but huge)
- From the keyword research (`docs/KEYWORD-RESEARCH.md`) — lists ranking for our
  target keywords, several of which add new tools: **Formgrid**, **Antforms**,
  **typeformalternative.com**, **involve.me** and **Qualaroo** (Typeform
  alternatives); **Zapier's Jotform alternatives**, **Zonka**, **AlternativeTo**
  (Jotform alternatives).

**Pitch (4–5 sentences, personalise line one):**
> Hi {name} — your {list title} is the one I send people to, especially the
> note on {specific entry}. I'm the founder of chatform, a conversational form
> builder that does something few tools on the list do: it reads free-text
> answers and asks a follow-up when one is too vague, and it can answer the
> respondent's own questions mid-form. It's free with unlimited responses.
> If it's useful, here's a 60-second demo: {link}. Happy to set you up with a
> Business account to test it properly.

### d) Resource pages (universities and nonprofits)
Search: `site:.edu "survey tools" OR "form builders" resources`,
`intitle:resources "online forms" nonprofit`, `libguides survey software`.
Example found: University of Montevallo LibGuide "Survey Software and
Resources". Pitch `/conversational-forms` and `/why-conversation-works` (the
peer-reviewed research page) — librarians link to sourced material, not to
product pages.

## Step 4 — months 2–3: linkable assets and PR

- **`/form-statistics`** (live) — nine popular form statistics traced to
  their original source, including the ones that are not real. Outreach target:
  every post that cites "conversational forms convert 40% better" or similar;
  tell them where the number actually comes from. Journalists and bloggers
  link to the page that settled a stat.
- **Hacker News / Reddit**: submit *"The model runs the conversation. It never
  owns it."* and the logic-linter post to HN (as normal posts, not Show HN).
  r/SaaS, r/nocode, r/Entrepreneur: answer questions about forms and surveys
  genuinely; link only when it is the answer.
- **Journalist requests** (Qwoted, Featured.com, Help a B2B Writer — HARO's
  successors): answer form/survey/UX queries within the hour, quoting the
  research page.
- **Guest posts** on DR 30–50 SaaS/marketing/UX blogs, e.g. "Why your intake
  form gets one-word answers", linking in-body to `/conversational-forms`.

## Pace and anchors

| Period | New referring domains | Mix |
|---|---|---|
| Month 1 | 15–25 | Profiles, directories |
| Months 2–3 | 5–10 | Lists, showcases, hackathon, first guest post |
| Months 4–6 | 8–15 | Guest posts, PR, statistics page |
| Month 7+ | 10–30 | Scale what worked |

Red flags to avoid: 50+ links in a month, paid link packages, PBNs, link
exchanges, and exact-match anchors. Aim for ~45% branded ("chatform",
"chatform.in"), ~20% naked URL, ~20% generic, ≤10% partial match
("conversational form builder"), ≤5% exact match.

## Product idea (not built — your call)

Free-plan embeds could carry a small visible *"Conversational form by
chatform"* link **in the host page's HTML** (outside the iframe). Today the
"Powered by chatform" credit lives inside the iframe or on chatform.in itself,
so it passes no link value. Typeform, Tally and Calendly all grew partly on
exactly this loop. It changes what customers' sites show, so it's a product
decision.

## Done in code

- Organization schema declares `alternateName: ["chatform.in", "chatform conversational forms"]` to separate us from the other Chatforms.
- `sameAs` is ready to fill as soon as the profiles in step 1 exist.
- Every page has a canonical, OG image, and a place in the sitemap and `llms.txt`.
