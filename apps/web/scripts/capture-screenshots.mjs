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

// Defaults target the live deployment; override via env to capture from
// a local dev server before pushing changes that aren't deployed yet:
//
//   BASE=http://localhost:3000 \
//   WS_Q2=8e9b7d20-6af1-4243-ad04-4debbadbe1ab \
//     pnpm --filter @frameboard/web exec node scripts/capture-screenshots.mjs
const BASE = process.env.BASE ?? "https://frameboard.pages.dev";
const WS_Q2 = process.env.WS_Q2 ?? "b91950ea-d759-4efd-b478-f8a2a4f16c40";

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
  {
    name: "05-filter-buckets",
    // Effort + Tag chip filters active together — demonstrates all
    // three filter dimensions (Effort bucket, Score bucket sitting at
    // "Any", and Tag chip) visible in the filter bar at once.
    url: `${BASE}/workspaces/${WS_Q2}?effort=quick&tag=feature`,
    viewport: { width: 1280, height: 800 },
  },
  {
    name: "06-tooltip-impact",
    url: `${BASE}/workspaces/${WS_Q2}?view=scatter`,
    viewport: { width: 1280, height: 900 },
    // Open the Impact (i) tooltip so the 0.25→3 scale is visible in
    // the screenshot. Scatter view is used because it's shorter
    // vertically than the bars view, keeping the legend in frame.
    afterLoad: async (page) => {
      await page
        .getByRole("button", { name: "Impact — more info" })
        .first()
        .hover();
      await page.waitForTimeout(400);
    },
  },
];

// Optional whitelist: `SHOTS=01-board-hero,04-filter-search` captures
// only those names — useful when you only need a couple updated.
const shotsFilter = process.env.SHOTS
  ? new Set(process.env.SHOTS.split(",").map((s) => s.trim()))
  : null;
const shotsToRun = shotsFilter
  ? shots.filter((s) => shotsFilter.has(s.name))
  : shots;

await mkdir(OUT_DIR, { recursive: true });

// Warm up the Render free-tier backend so the first navigation doesn't
// stall on a cold start.
await fetch("https://frameboard-api.onrender.com/healthz").catch(() => {});

const browser = await chromium.launch();
try {
  for (const shot of shotsToRun) {
    const ctx = await browser.newContext({ viewport: shot.viewport });
    const page = await ctx.newPage();
    await page.goto(shot.url, { waitUntil: "networkidle", timeout: 60_000 });
    // Hide the Next.js dev-mode error/build indicator (only present
    // when capturing against `pnpm dev`) so it doesn't appear in
    // marketing screenshots. No-op on production builds.
    await page.addStyleTag({
      content: "nextjs-portal { display: none !important; }",
    });
    // Small delay so any client-side hydration / chart layout settles.
    await page.waitForTimeout(600);
    if (shot.afterLoad) {
      await shot.afterLoad(page);
    }
    const outPath = path.join(OUT_DIR, `${shot.name}.png`);
    await page.screenshot({ path: outPath, fullPage: false });
    console.log(`✓ ${shot.name}.png`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(`\nSaved to: ${OUT_DIR}`);
