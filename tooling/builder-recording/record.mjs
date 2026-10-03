/**
 * Records the builder demo on the home page (components/marketing/builder-recording.tsx).
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

async function click(locator) {
  await moveTo(locator);
  await pause(180);
  mark("click", { x: at.x, y: at.y });
  await page.mouse.down();
  await pause(70);
  await page.mouse.up();
}

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
await pause(1800);

// 2. Walk the questions.
const questions = page.locator("button", { hasText: /space or rooms|budget|timeline/i });
for (let i = 0; i < Math.min(3, await questions.count()); i++) {
  await click(questions.nth(i));
  await pause(1100);
}

// 3. Add a rating question.
await click(page.getByRole("button", { name: "Add a question" }));
await pause(500);
mark("keys-start");
await page.keyboard.type("rat", { delay: 90 });
mark("keys-end");
await pause(400);
await click(page.getByRole("option", { name: /Rating/ }).or(page.getByRole("button", { name: /^Rating/ })).first());
await pause(1800);

// 4. Make it look like you.
await click(page.getByRole("button", { name: /^Design$/ }));
await pause(900);
await click(page.getByText("Violet Bloom", { exact: true }));
await pause(1400);
await click(page.getByText("Dark", { exact: true }).first());
await pause(2200);
await click(page.getByText("Light", { exact: true }).first());
await pause(1000);
await page.keyboard.press("Escape");
await pause(600);

// 5. Send it out.
await click(page.locator('a[href$="/share"]').first());
await page.waitForURL(/\/share/, { timeout: 30_000 });
await page.waitForLoadState("networkidle");
await pause(3000);

const video = page.video();
await ctx.close();
const path = await video.path();
const { writeFileSync } = await import("node:fs");
writeFileSync(path.replace(/\.webm$/, ".events.json"), JSON.stringify(events, null, 2));
console.log(path);
await browser.close();
