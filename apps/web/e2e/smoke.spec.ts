// /apps/web/e2e/smoke.spec.ts

import { expect, test } from "@playwright/test";

import {
  getTestUserEmail,
  resetBackend,
  seedItem,
  seedScore,
  seedWorkspace,
} from "./helpers/test-utils";

test.beforeEach(async () => {
  await resetBackend(getTestUserEmail());
});

// ──────────────────────────────────────────────────────────────────── Test 1 ──

test("user can create a workspace and see it in the list", async ({ page }) => {
  await page.goto("/workspaces");

  // Empty state is visible on a freshly-reset account.
  await expect(
    page.getByRole("heading", { name: "No workspaces yet" }),
  ).toBeVisible();

  // Two "Create workspace" buttons exist on the empty page (header + empty
  // state CTA). Both open the same modal; .first() is sufficient.
  await page
    .getByRole("button", { name: "Create workspace" })
    .first()
    .click();

  // Modal fields use proper <label htmlFor> so getByLabel matches the input.
  await page.getByLabel("Name").fill("Smoke Test Workspace");

  // exact: true — otherwise "Create" matches the two "Create workspace"
  // CTAs (header + empty state) and Playwright's strict mode fails.
  await page.getByRole("button", { name: "Create", exact: true }).click();

  // After save the modal closes and router.refresh() refetches; the new
  // workspace card renders an <h2> with the workspace name.
  await expect(
    page.getByRole("heading", { name: "Smoke Test Workspace" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No workspaces yet" }),
  ).toBeHidden();
});

// ──────────────────────────────────────────────────────────────────── Test 2 ──

test("user can add backlog items to a board", async ({ page }) => {
  const workspaceId = await seedWorkspace("Item Adding Workspace");
  await page.goto(`/workspaces/${workspaceId}`);

  await expect(
    page.getByRole("heading", { name: "No items yet" }),
  ).toBeVisible();

  // The header's "Add item" button (no other button matches exactly until
  // the modal opens, where the submit button is also "Add item").
  await page.getByRole("button", { name: "Add item", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill("Ship dark mode");
  await dialog.getByRole("button", { name: "Add item" }).click();

  // First row appears with the title + unscored Score button. Use a row
  // accessible-name regex to scope subsequent assertions to this row.
  const firstRow = page.getByRole("row", { name: /Ship dark mode/ });
  await expect(firstRow).toBeVisible();
  await expect(firstRow.getByRole("button", { name: "Score" })).toBeVisible();

  // Add a second item.
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await dialog.getByLabel("Title").fill("Marketing site refresh");
  await dialog.getByRole("button", { name: "Add item" }).click();

  const secondRow = page.getByRole("row", { name: /Marketing site refresh/ });
  await expect(firstRow).toBeVisible();
  await expect(secondRow).toBeVisible();
  await expect(firstRow.getByRole("button", { name: "Score" })).toBeVisible();
  await expect(secondRow.getByRole("button", { name: "Score" })).toBeVisible();
});

// ──────────────────────────────────────────────────────────────────── Test 3 ──

test("user can score items inline and they sort by score", async ({ page }) => {
  const workspaceId = await seedWorkspace("Scoring Workspace");
  await seedItem(workspaceId, "Ship dark mode");
  await seedItem(workspaceId, "Marketing site refresh");
  await page.goto(`/workspaces/${workspaceId}`);

  // Score Ship dark mode → 1000 × 2 × 0.8 / 4 = 400.00
  await scoreRowInline(page, /Ship dark mode/, {
    reach: 1000,
    impact: 2,
    confidence: 0.8,
    effort: 4,
  });
  await expect(
    page.getByRole("row", { name: /Ship dark mode/ }),
  ).toContainText("400.00");

  // Score Marketing site refresh → 500 × 1 × 0.5 / 5 = 50.00
  await scoreRowInline(page, /Marketing site refresh/, {
    reach: 500,
    impact: 1,
    confidence: 0.5,
    effort: 5,
  });
  await expect(
    page.getByRole("row", { name: /Marketing site refresh/ }),
  ).toContainText("50.00");

  // Verify board sort: row 0 (rank 1) is the higher score; row 1 is the lower.
  const dataRows = page.locator("tbody tr");
  await expect(dataRows.nth(0)).toContainText("Ship dark mode");
  await expect(dataRows.nth(0)).toContainText("400.00");
  await expect(dataRows.nth(1)).toContainText("Marketing site refresh");
  await expect(dataRows.nth(1)).toContainText("50.00");
});

// ──────────────────────────────────────────────────────────────────── Test 4 ──

test("user can edit an item via the Edit modal", async ({ page }) => {
  const workspaceId = await seedWorkspace("Editing Workspace");
  const itemId = await seedItem(workspaceId, "Original title");
  await seedScore(itemId, {
    reach: 1000,
    impact: 2,
    confidence: 0.5,
    effort: 4,
  }); // initial score: 1000 × 2 × 0.5 / 4 = 250.00

  await page.goto(`/workspaces/${workspaceId}`);
  const row = page.getByRole("row", { name: /Original title/ });
  await expect(row).toContainText("250.00");

  await row.getByRole("button", { name: "Row actions" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();

  // Modal is pre-filled.
  const dialog = page.getByRole("dialog", { name: "Edit item" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Title")).toHaveValue("Original title");
  await expect(dialog.getByLabel("Reach")).toHaveValue("1000");
  await expect(dialog).toContainText("250.00"); // live score block

  // Change Title and Reach; new score = 2000 × 2 × 0.5 / 4 = 500.00
  await dialog.getByLabel("Title").fill("Updated title");
  await dialog.getByLabel("Reach").fill("2000");
  await expect(dialog).toContainText("500.00"); // live preview updates

  await dialog.getByRole("button", { name: "Save" }).click();

  // Success toast appears (auto-dismisses after 3.5s but well within window).
  await expect(page.getByText("Item updated")).toBeVisible();
  // Modal closes.
  await expect(dialog).toBeHidden();

  // After router.refresh, the row reflects new title + new score.
  const updatedRow = page.getByRole("row", { name: /Updated title/ });
  await expect(updatedRow).toBeVisible();
  await expect(updatedRow).toContainText("2000"); // Reach cell
  await expect(updatedRow).toContainText("500.00"); // new score
});

// ──────────────────────────────────────────────────────────────────── Test 5 ──

test("user can delete an item with confirmation", async ({ page }) => {
  const workspaceId = await seedWorkspace("Deleting Workspace");
  await seedItem(workspaceId, "Doomed item");
  await page.goto(`/workspaces/${workspaceId}`);

  const row = page.getByRole("row", { name: /Doomed item/ });
  await expect(row).toBeVisible();

  // window.confirm fires when the menu item is clicked; accept it.
  page.once("dialog", (d) => d.accept());

  await row.getByRole("button", { name: "Row actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();

  // Row gone; back to the empty state since this was the only item.
  await expect(row).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "No items yet" }),
  ).toBeVisible();
});

// ──────────────────────────────────────────────────────────── Inline helpers ──

async function scoreRowInline(
  page: import("@playwright/test").Page,
  rowName: RegExp,
  rice: { reach: number; impact: number; confidence: number; effort: number },
): Promise<void> {
  const row = page.getByRole("row", { name: rowName });

  await row.getByRole("button", { name: "Score" }).click();

  // The row is now in scoring-form mode: 3 number inputs (Reach, Confidence,
  // Effort) + the Impact ImpactSelect button + Save/Cancel.
  const numericInputs = row.locator('input[type="number"]');
  await numericInputs.nth(0).fill(String(rice.reach));
  await numericInputs.nth(1).fill(String(rice.confidence));
  await numericInputs.nth(2).fill(String(rice.effort));

  // Impact dropdown — the trigger button shows the current value (defaults
  // to "1"). Skip the dropdown interaction when the desired impact is 1.
  if (rice.impact !== 1) {
    await row.getByRole("button", { name: "1", exact: true }).click();
    await page
      .getByRole("option", { name: String(rice.impact), exact: true })
      .click();
  }

  await row.getByRole("button", { name: "Save" }).click();
}
