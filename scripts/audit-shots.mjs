/**
 * Temporary audit walk (design pass, 2026-07-16): captures the screens that
 * render without Tauri IPC (global screens + modals + empty/error states) in
 * light and dark. Complements ui-shots.mjs, which needs live data.
 * Prereq: npm run dev. Usage: node scripts/audit-shots.mjs <outdir>
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] ?? "screenshots-audit";
const BASE = process.env.ARBORA_UI_URL ?? "http://localhost:1420";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function walk(tag, initTheme) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((theme) => {
    localStorage.setItem("arbora.onboarded", "1");
    localStorage.setItem("arbora.tutorialDone", "1");
    localStorage.setItem(
      "arbora.display",
      JSON.stringify({ theme, contrast: "normal", fontScale: 16, reducedMotion: false, focusMode: false }),
    );
  }, initTheme);
  const page = await ctx.newPage();
  const shot = async (name) => {
    await page.waitForTimeout(1100);
    await page.screenshot({ path: `${OUT}/${tag}-${name}.png` });
  };

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await shot("01-home");
  await page.goto(`${BASE}/calendar`, { waitUntil: "networkidle" });
  await shot("02-calendar");
  await page.goto(`${BASE}/todos`, { waitUntil: "networkidle" });
  await shot("03-todos");
  await page.goto(`${BASE}/notes`, { waitUntil: "networkidle" });
  await shot("04-notes");
  await page.goto(`${BASE}/drive`, { waitUntil: "networkidle" });
  await shot("05-drive");
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await shot("06-settings");
  // Quick note modal (global `/` shortcut)
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.keyboard.press("/");
  await shot("07-quicknote");
  await page.keyboard.press("Escape");
  // Subject workspace error state (no backend)
  await page.goto(`${BASE}/subject/sub-x/overview`, { waitUntil: "networkidle" });
  await shot("08-subject-error");
  await ctx.close();
}

await walk("light", "light");
await walk("dark", "dark");

// Onboarding + tutorial (fresh profile)
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1100);
  await page.screenshot({ path: `${OUT}/light-09-onboarding.png` });
  await ctx.close();
}

await browser.close();
console.log(`Screenshots → ${OUT}`);
