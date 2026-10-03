/**
 * Records the builder demo on the home page (components/marketing/builder-recording.tsx).
 *
 * The take: describe a form and the AI builds it, walk the questions, restyle
 * it, answer it in the preview, brief the agent, share and embed it, then read
 * the responses and the analytics. Everything after the AI builds the form is
 * shot on FORM, a local form seeded with sample responses, because a form made
 * a second ago has no results; encode.mjs cuts out the hop between the two.
 *
 * Runs against a LOCAL stack: `next dev` on :3000 and `wrangler dev` on :8787
 * with mail switched off (see the local-dev notes), signed in as a throwaway
 * account whose session is saved in STATE. It drives the real product (AI
 * generation included, so one run costs one generation), with a drawn cursor,
 * because a headless recording has none.
 *
 *   PLAYWRIGHT=/path/to/playwright/index.mjs STATE=/tmp/state.json node tooling/builder-recording/record.mjs
 *   then: node tooling/builder-recording/encode.mjs <the .webm it prints>
 *
 * Playwright is not a dependency of this repo; point PLAYWRIGHT at any install.
 */
const { chromium } = await import(process.env.PLAYWRIGHT ?? "playwright");

const ORIGIN = process.env.ORIGIN ?? "http://localhost:3000";
const STATE = process.env.STATE ?? "/tmp/lp/state.json";
const OUT = process.env.OUT ?? "/tmp/lp/rec";
const SIZE = { width: 1600, height: 900 };

/** A form with seeded sample responses, for the parts a brand-new form cannot show (results, analytics). */
const FORM = process.env.FORM ?? "frm_9fc8e90b56f4";
/** SKIP_GEN=1 leaves out the AI generation: a free dry run of everything after it. */
const SKIP_GEN = Boolean(process.env.SKIP_GEN);

const PROMPT =
  "A client intake form for my interior design studio: the space, the budget, the timeline, and photos if they have them. No more than 6 questions.";

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({
  viewport: SIZE,
  deviceScaleFactor: 1,
  storageState: STATE,
  recordVideo: { dir: OUT, size: SIZE },
});

// A cursor the video can see, following real mouse events, plus no dev overlay.
await ctx.addInitScript(() => {
  const install = () => {
    const style = document.createElement("style");
    style.textContent = `nextjs-portal{display:none!important}
      #rec-cursor{position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;
        transition:transform 90ms ease-out}
      #rec-cursor.down svg{transform:scale(.82)}`;
    document.head.append(style);
    const c = document.createElement("div");
    c.id = "rec-cursor";
    c.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.3));transition:transform 90ms"><path d="M5 3l14 8-6 1.5L10 19z" fill="#24211e" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
    document.body.append(c);
    addEventListener("mousemove", (e) => (c.style.transform = `translate(${e.clientX - 4}px, ${e.clientY - 2}px)`), true);
    addEventListener("mousedown", () => c.classList.add("down"), true);
    addEventListener("mouseup", () => c.classList.remove("down"), true);
  };
  if (document.body) install();
  else addEventListener("DOMContentLoaded", install);
});

const page = await ctx.newPage();
// The video starts with the page; every event is stamped against that, so
// encode.mjs can speed up the waits, zoom on typing and lay the sounds in sync.
const t0 = Date.now();
const events = [];
const mark = (type, extra = {}) => events.push({ t: (Date.now() - t0) / 1000, type, ...extra });
const pause = (ms) => page.waitForTimeout(ms);
let at = { x: SIZE.width / 2, y: SIZE.height / 2 };

async function moveTo(locator) {
  await locator.waitFor({ state: "visible", timeout: 60_000 });
  const box = await locator.boundingBox();
  const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const steps = Math.max(12, Math.round(Math.hypot(to.x - at.x, to.y - at.y) / 18));
  await page.mouse.move(to.x, to.y, { steps });
  at = to;
}

/** Click if it is there; a missing control is logged, not fatal, so one renamed button does not waste a take. */
async function tryClick(locator, name, wait = 900) {
  try {
    await locator.waitFor({ state: "visible", timeout: 6000 });
    await click(locator);
    await pause(wait);
    return true;
  } catch {
    console.error(`skipped: ${name}`);
    return false;
  }
}

/** Scroll like a hand on a trackpad: small steps, so the video sees it move. */
async function scroll(dy, ms = 900) {
  const steps = Math.max(8, Math.round(ms / 16));
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await pause(16);
  }
}

async function type(text, delay = 34) {
  mark("keys-start");
  await page.keyboard.type(text, { delay });
  mark("keys-end");
}

async function click(locator) {
  await moveTo(locator);
  await pause(180);
  mark("click", { x: at.x, y: at.y });
  await page.mouse.down();
  await pause(70);
  await page.mouse.up();
}

if (!SKIP_GEN) {
  await page.goto(`${ORIGIN}/dashboard`, { waitUntil: "networkidle", timeout: 180_000 });
  await page.mouse.move(at.x, at.y);
  await pause(1200);

  // 1. Describe it, and the AI builds it.
  await click(page.getByRole("button", { name: /New form/ }));
  await pause(900);
  const promptBox = page.getByPlaceholder(/Describe the form/);
  await click(promptBox);
  const pb = await promptBox.boundingBox();
  mark("type-start", { x: pb.x + pb.width / 2, y: pb.y + pb.height / 2 });
  await page.keyboard.type(PROMPT, { delay: 30 });
  mark("type-end");
  await pause(500);
  await click(page.getByRole("button", { name: /Generate/ }));
  mark("wait-start");
  await page.waitForURL(/\/forms\/[^/]+\/build/, { timeout: 120_000 });
  await page.waitForLoadState("networkidle");
  mark("wait-end");
  await pause(2200);
}

// The hop to the seeded form, cut from the edit.
mark("cut-start");
await page.goto(`${ORIGIN}/forms/${FORM}/build`, { waitUntil: "networkidle", timeout: 180_000 });
await page.mouse.move(at.x, at.y);
await pause(900);
mark("cut-end");
await pause(700);

// 2. Walk the questions.
for (const q of [/Which space or rooms/, /estimated total/, /existing photos/]) {
  await tryClick(page.locator("button", { hasText: q }).first(), `question ${q}`, 1000);
}

// 3. Make it look like you: a few themes, each with its own ground and type.
await tryClick(page.getByRole("button", { name: /^Design$/ }), "Design", 800);
await tryClick(page.getByText("Violet Bloom", { exact: true }), "Violet Bloom", 1100);
await tryClick(page.getByText(/Show all \d+/), "Show all", 500);
for (const theme of ["Notebook", "Neo Brutalism", "Retro Arcade", "Ocean Breeze"]) {
  const tile = page.getByText(theme, { exact: true });
  await tile.scrollIntoViewIfNeeded().catch(() => {});
  await pause(250);
  await tryClick(tile, theme, 1100);
}
await page.keyboard.press("Escape");
await pause(500);

// 4. Try it the way a respondent will: the real chat, typed and tapped.
if (await tryClick(page.getByRole("button", { name: "Preview the conversation" }), "Preview", 2600)) {
  const composer = page.getByPlaceholder(/type it out|Type your answer/).last();
  if (await tryClick(composer, "composer", 300)) {
    await type("Maya Chen, maya@northwind.co, +1 415 555 0134");
    await pause(400);
    await page.keyboard.press("Enter");
    await pause(4200);
    const option = (text) => page.locator("button", { hasText: text }).last();
    await tryClick(option("Living Room"), "Living Room", 450);
    await tryClick(option("Kitchen & Dining"), "Kitchen", 450);
    await tryClick(option("Continue"), "Continue", 3000);
    await tryClick(option("$25,000 to $50,000"), "budget", 2800);
  }
  await tryClick(page.getByRole("dialog").getByRole("button", { name: "Close" }).first(), "close preview", 700);
}

// 5. Brief the agent.
await tryClick(page.locator('a[href$="/settings"]').first(), "Settings", 1200);
await tryClick(page.locator('a[href$="/settings/agent"]').first(), "Agent", 1500);
for (const name of ["Goal", "Knowledge", "Guardrails"]) {
  await tryClick(page.getByRole("tab", { name, exact: true }).or(page.getByRole("button", { name, exact: true })).first(), name, 1500);
}

// 6. Send it out, and put it on a site.
await tryClick(page.locator('a[href$="/share"]').first(), "Share", 1800);
await tryClick(page.getByRole("button", { name: /Show QR code/ }), "QR", 1800);
await page.keyboard.press("Escape");
await pause(400);
await tryClick(page.locator('a[href$="/integrate"]').first(), "Integrate", 1800);
await tryClick(page.getByRole("button", { name: /^Side tab$/ }).or(page.getByText("Side tab", { exact: true })).first(), "Side tab", 1500);
await tryClick(page.getByRole("button", { name: /^Inline$/ }).or(page.getByText("Inline", { exact: true })).first(), "Inline", 1500);
await page.mouse.move(800, 600, { steps: 14 });
at = { x: 800, y: 600 };
await scroll(1500, 1500);
await pause(1500);

// 7. Read what came back.
await tryClick(page.locator('a[href$="/results"]').first(), "Results", 2200);
await page.mouse.move(700, 480, { steps: 14 });
at = { x: 700, y: 480 };
await pause(900);
const tab = (name) => page.getByRole("tab", { name }).first();
await tryClick(tab(/^Summary/), "Summary", 2400);
await page.mouse.move(800, 560, { steps: 10 });
at = { x: 800, y: 560 };
await scroll(900, 1400);
await pause(1200);
// Back to the top: the tabs have scrolled out of reach.
await scroll(-900, 700);
await pause(300);
await tryClick(tab(/^Analytics/), "Analytics", 2600);
await page.mouse.move(800, 560, { steps: 10 });
at = { x: 800, y: 560 };
await scroll(620, 1500);
await pause(1700);
await scroll(640, 1500);
await pause(1700);
await scroll(640, 1500);
await pause(2200);
await scroll(-2200, 1400);
await pause(1500);

const video = page.video();
await ctx.close();
const path = await video.path();
const { writeFileSync } = await import("node:fs");
writeFileSync(path.replace(/\.webm$/, ".events.json"), JSON.stringify(events, null, 2));
console.log(path);
await browser.close();
