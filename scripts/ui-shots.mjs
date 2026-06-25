/**
 * UI smoke-test + screenshot tool (Phase 3, UI-first).
 *
 * Walks every screen on mock data, captures screenshots, runs a few keyboard
 * assertions (review + study loops), and FAILS (exit 1) on any console/page
 * error. Use it to re-verify the UI after changes and to regenerate the shots
 * attached to the Progress Log.
 *
 * Prereq: the dev server must be running →  npm run dev   (http://localhost:1420)
 * Usage:  npm run ui:shots                # writes to ./screenshots
 *         node scripts/ui-shots.mjs <dir> # custom output dir
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] ?? "screenshots";
const BASE = process.env.ARBORA_UI_URL ?? "http://localhost:1420";
mkdirSync(OUT, { recursive: true });

const errors = [];
const asserts = [];
const browser = await chromium.launch();

function wire(page, tag) {
  page.on("console", (m) => m.type() === "error" && errors.push(`[${tag}] ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
}
async function ctxPage(viewport, init) {
  const ctx = await browser.newContext({ viewport: viewport ?? { width: 1280, height: 900 } });
  if (init) await ctx.addInitScript(init);
  return { ctx, page: await ctx.newPage() };
}
const skip = () => localStorage.setItem("arbora.onboarded", "1");
const display = (d) => localStorage.setItem("arbora.display", JSON.stringify(d));
async function shot(page, name) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}
function check(label, ok) {
  asserts.push(`${ok ? "ok " : "FAIL"}  ${label}`);
}

// ── Onboarding (no skip flag) ──────────────────────────────────────────────
{
  const { ctx, page } = await ctxPage();
  wire(page, "onboarding");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await shot(page, "10-onboarding");
  await ctx.close();
}

// ── Main flow ──────────────────────────────────────────────────────────────
{
  const { ctx, page } = await ctxPage(undefined, skip);
  wire(page, "main");

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator("a svg").first().waitFor({ timeout: 5000 }).catch(() => {});
  await shot(page, "01-home");

  await page.goto(`${BASE}/subject/sub-bio/sources`, { waitUntil: "networkidle" });
  await shot(page, "02a-sources");
  await page.getByRole("button", { name: "Add source" }).first().click();
  await shot(page, "03-add-source");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Generate content/i }).click();
  await shot(page, "04-generate");
  await page.keyboard.press("Escape");

  await page.goto(`${BASE}/subject/sub-bio/content`, { waitUntil: "networkidle" });
  await shot(page, "02b-content");
  await page.goto(`${BASE}/subject/sub-bio/study`, { waitUntil: "networkidle" });
  await shot(page, "02c-study-tab");
  await page.goto(`${BASE}/subject/sub-hist/sources`, { waitUntil: "networkidle" });
  await shot(page, "02d-sources-empty");

  await page.goto(`${BASE}/subject/sub-bio/review`, { waitUntil: "networkidle" });
  await page.locator("text=0 / 4 reviewed").waitFor({ timeout: 5000 });
  await shot(page, "05-review");
  await page.keyboard.press("a");
  check("review: key A keep → 1/4", await page.locator("text=1 / 4 reviewed").isVisible().catch(() => false));

  await page.goto(`${BASE}/subject/sub-bio/study/session`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Show answer" }).waitFor({ timeout: 5000 });
  await page.keyboard.press(" ");
  check("study: Space flips → ratings", await page.getByRole("button", { name: /Again/ }).isVisible().catch(() => false));
  await shot(page, "06-study-session");
  const before = (await page.locator("text=/\\d+ \\/ \\d+/").first().textContent())?.trim();
  await page.keyboard.press("3");
  await page.waitForTimeout(400);
  const after = (await page.locator("text=/\\d+ \\/ \\d+/").first().textContent())?.trim();
  check(`study: key 3 advances (${before} → ${after})`, before !== after);

  await page.goto(`${BASE}/subject/sub-bio/plan`, { waitUntil: "networkidle" });
  await shot(page, "07-plan");
  await page.goto(`${BASE}/subject/sub-bio/dashboard`, { waitUntil: "networkidle" });
  await shot(page, "08-dashboard");
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await shot(page, "09-settings");
  await ctx.close();
}

// ── Dark + reduced motion ───────────────────────────────────────────────────
{
  const { ctx, page } = await ctxPage(undefined, () => {
    localStorage.setItem("arbora.onboarded", "1");
    localStorage.setItem("arbora.display", JSON.stringify({ theme: "dark", contrast: "normal", fontScale: 16, reducedMotion: true, focusMode: false }));
  });
  wire(page, "dark");
  await page.goto(`${BASE}/subject/sub-bio/dashboard`, { waitUntil: "networkidle" });
  await shot(page, "11-dark-dashboard");
  await page.goto(`${BASE}/subject/sub-bio/review`, { waitUntil: "networkidle" });
  await shot(page, "12-dark-review");
  await ctx.close();
}

// ── Responsive (sidebar collapse) + high contrast + font 18 ─────────────────
{
  const { ctx, page } = await ctxPage({ width: 860, height: 900 }, () => {
    localStorage.setItem("arbora.onboarded", "1");
    localStorage.setItem("arbora.display", JSON.stringify({ theme: "light", contrast: "high", fontScale: 18, reducedMotion: false, focusMode: false }));
  });
  wire(page, "responsive");
  await page.goto(`${BASE}/subject/sub-bio/dashboard`, { waitUntil: "networkidle" });
  await shot(page, "13-responsive-hc-font18");
  await ctx.close();
}

await browser.close();

console.log("Assertions:");
for (const a of asserts) console.log("  " + a);
console.log(`\nConsole/page errors: ${errors.length ? "\n  " + errors.join("\n  ") : "none"}`);
const failed = errors.length > 0 || asserts.some((a) => a.startsWith("FAIL"));
console.log(`\nScreenshots → ${OUT}`);
process.exit(failed ? 1 : 0);
