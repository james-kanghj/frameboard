// /apps/web/scripts/capture-screenshots.mjs
//
// One-shot tool that opens the live Frameboard deployment in headless
// Chromium and saves screenshots under docs/screenshots/ for use in the
// README. Re-run any time the UI changes meaningfully:
//
//   pnpm --filter @frameboard/web exec node scripts/capture-screenshots.mjs

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../../../docs/screenshots");

const BASE = "https://frameboard.pages.dev";
const WS_Q2 = "b91950ea-d759-4efd-b478-f8a2a4f16c40";

const shots = [
  {
    name: "01-board-hero",
    url: `${BASE}/workspaces/${WS_Q2}`,
    viewport: { width: 1280, height: 1100 },
  },
  {
    name: "02-scatter-view",
    url: `${BASE}/workspaces/${WS_Q2}?view=scatter`,
    viewport: { width: 1280, height: 1000 },
  },
  {
    name: "03-workspaces-list",
    url: `${BASE}/workspaces`,
    viewport: { width: 1280, height: 720 },
  },
  {
    name: "04-filter-search",
    url: `${BASE}/workspaces/${WS_Q2}?q=integration`,
    viewport: { width: 1280, height: 900 },
  },
];

await mkdir(OUT_DIR, { recursive: true });

// Warm up the Render free-tier backend so the first navigation doesn't
// stall on a cold start.
await fetch("https://frameboard-api.onrender.com/healthz").catch(() => {});

const browser = await chromium.launch();
try {
  for (const shot of shots) {
    const ctx = await browser.newContext({ viewport: shot.viewport });
    const page = await ctx.newPage();
    await page.goto(shot.url, { waitUntil: "networkidle", timeout: 60_000 });
    // Small delay so any client-side hydration / chart layout settles.
    await page.waitForTimeout(600);
    const outPath = path.join(OUT_DIR, `${shot.name}.png`);
    await page.screenshot({ path: outPath, fullPage: false });
    console.log(`✓ ${shot.name}.png`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(`\nSaved to: ${OUT_DIR}`);
