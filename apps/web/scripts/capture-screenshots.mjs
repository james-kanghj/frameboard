// /apps/web/scripts/capture-screenshots.mjs
//
// Opens the deployed Frameboard in headless Chromium and saves
// screenshots under docs/screenshots/ for the README. Re-run any time
// the UI changes meaningfully:
//
//   BEARER=eyJhbGciOi... \
//   pnpm --filter @frameboard/web exec node scripts/capture-screenshots.mjs
//
// The BEARER env (the raw NextAuth session JWT, copyable from
// `https://<deploy>/api/token`) is required when the live deployment
// has auth enabled — without it the browser lands on /auth/signin and
// every workspace shot is a sign-in screen.
//
// Workspace IDs default to the production demo workspaces seeded for
// the maintainer's account. Override per environment with the WS_*
// envs below.

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../../../docs/screenshots");

const BASE = process.env.BASE ?? "https://frameboard.pages.dev";
const BEARER = process.env.BEARER ?? "";
const WS_RICE =
  process.env.WS_RICE ?? "abbd0746-7710-432d-a497-3c535d834273";
const WS_ICE =
  process.env.WS_ICE ?? "6c9f7bd8-8fe4-4f36-8023-a02ba29a26c3";
const WS_MOSCOW =
  process.env.WS_MOSCOW ?? "250b5dda-b9c7-4c4a-b028-a4cf8315e8ab";
const WS_VE =
  process.env.WS_VE ?? "5d4e6a3b-e664-44c3-8a93-ff5c565b2d52";

// Cookie name varies by scheme — Playwright treats https:// hosts as
// secure, so the live deployment expects the `__Secure-` prefix.
function buildSessionCookie() {
  if (!BEARER) return null;
  const url = new URL(BASE);
  const isSecure = url.protocol === "https:";
  return {
    name: isSecure ? "__Secure-authjs.session-token" : "authjs.session-token",
    value: BEARER,
    domain: url.hostname,
    path: "/",
    secure: isSecure,
    httpOnly: true,
    sameSite: "Lax",
  };
}

const shots = [
  {
    name: "01-board-hero",
    url: `${BASE}/workspaces/${WS_RICE}`,
    viewport: { width: 1280, height: 1100 },
  },
  {
    name: "02-scatter-view",
    url: `${BASE}/workspaces/${WS_RICE}?view=scatter`,
    viewport: { width: 1280, height: 1000 },
  },
  {
    name: "03-workspaces-list",
    url: `${BASE}/workspaces`,
    viewport: { width: 1280, height: 720 },
  },
  {
    name: "04-filter-search",
    url: `${BASE}/workspaces/${WS_RICE}?q=integration`,
    viewport: { width: 1280, height: 900 },
  },
  {
    name: "05-filter-buckets",
    url: `${BASE}/workspaces/${WS_RICE}?effort=quick&tag=feature`,
    viewport: { width: 1280, height: 800 },
  },
  {
    name: "06-tooltip-impact",
    url: `${BASE}/workspaces/${WS_RICE}?view=scatter`,
    viewport: { width: 1280, height: 900 },
    afterLoad: async (page) => {
      await page
        .getByRole("button", { name: "Impact — more info" })
        .first()
        .hover();
      await page.waitForTimeout(400);
    },
  },
  {
    name: "07-ice-board",
    url: `${BASE}/workspaces/${WS_ICE}`,
    viewport: { width: 1280, height: 900 },
  },
  {
    name: "08-moscow-board",
    url: `${BASE}/workspaces/${WS_MOSCOW}`,
    viewport: { width: 1280, height: 900 },
  },
  {
    name: "09-value-effort-board",
    url: `${BASE}/workspaces/${WS_VE}`,
    viewport: { width: 1280, height: 800 },
  },
  {
    name: "10-completed-visible",
    url: `${BASE}/workspaces/${WS_RICE}?completed=show`,
    viewport: { width: 1280, height: 1100 },
  },
  {
    name: "11-export-menu",
    url: `${BASE}/workspaces/${WS_RICE}`,
    viewport: { width: 1280, height: 720 },
    afterLoad: async (page) => {
      await page
        .getByRole("button", { name: /^Export/ })
        .first()
        .click();
      await page.waitForTimeout(300);
    },
  },
  {
    name: "12-members-modal",
    url: `${BASE}/workspaces/${WS_RICE}`,
    viewport: { width: 1280, height: 720 },
    afterLoad: async (page) => {
      // Wait for the MembersMenu button to finish its preload fetch
      // first — clicking before the initial listMembers() resolves
      // means the modal opens with a transient "Failed to fetch" /
      // "Loading…" combo on screen.
      await page.waitForLoadState("networkidle");
      await page
        .getByRole("button", { name: /^Members/ })
        .first()
        .click();
      // Then let the modal's own refetch settle so the list is
      // populated before we shoot.
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(300);
    },
  },
  {
    name: "13-framework-picker",
    url: `${BASE}/workspaces`,
    viewport: { width: 1280, height: 720 },
    afterLoad: async (page) => {
      // Open Create workspace modal, then expand the framework
      // listbox so all four options are visible.
      await page
        .getByRole("button", { name: /^Create workspace/ })
        .first()
        .click();
      await page.waitForTimeout(200);
      // Type a name so the modal looks lived-in.
      await page.getByLabel("Name").fill("New initiative");
      // Trigger has aria-haspopup=listbox.
      await page
        .locator('button[aria-haspopup="listbox"]')
        .first()
        .click();
      await page.waitForTimeout(300);
    },
  },
];

// `SHOTS=01-board-hero,07-ice-board` captures only those names.
const shotsFilter = process.env.SHOTS
  ? new Set(process.env.SHOTS.split(",").map((s) => s.trim()))
  : null;
const shotsToRun = shotsFilter
  ? shots.filter((s) => shotsFilter.has(s.name))
  : shots;

await mkdir(OUT_DIR, { recursive: true });

await fetch("https://frameboard-api.onrender.com/healthz").catch(() => {});

const browser = await chromium.launch();
try {
  const sessionCookie = buildSessionCookie();
  for (const shot of shotsToRun) {
    const ctx = await browser.newContext({ viewport: shot.viewport });
    if (sessionCookie) {
      await ctx.addCookies([sessionCookie]);
    }
    const page = await ctx.newPage();
    await page.goto(shot.url, { waitUntil: "networkidle", timeout: 60_000 });
    await page.addStyleTag({
      content: "nextjs-portal { display: none !important; }",
    });
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
