import { expect, test } from "@playwright/test";

test("runs all stages, saves history, and renders without page overflow", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  // HTTP LAN deployments do not expose crypto.randomUUID.
  await page.addInitScript(() =>
    Object.defineProperty(crypto, "randomUUID", { value: undefined }),
  );
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Know your connection." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run Test", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/${test.info().project.name}-idle.png`,
    fullPage: true,
  });
  await page.getByLabel("Duration per speed test").selectOption("5");
  await page.getByRole("button", { name: "Run Test", exact: true }).click();
  await expect(page.getByLabel("Duration per speed test")).toBeDisabled();
  await expect(page.getByRole("status").first()).toContainText(
    "Measuring latency",
  );
  await expect(page.getByRole("status").first()).toHaveText(
    "Measuring download",
    { timeout: 15000 },
  );
  await expect(page.getByTestId("main-result")).not.toHaveText("—");
  await expect(page.getByRole("status").first()).toHaveText(
    "Measuring upload",
    { timeout: 15000 },
  );
  await expect(page.getByRole("status").first()).toHaveText("Test complete", {
    timeout: 30000,
  });
  await expect(page.getByRole("row")).toHaveCount(2);
  const history = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("speedtest-history-v1")!),
  );
  expect(history).toHaveLength(1);
  expect(history[0].download).toBeGreaterThan(0);
  expect(history[0].upload).toBeGreaterThan(0);
  expect(history[0].latency.avg).toBeGreaterThan(0);
  expect(history[0].latency.p95).toBeGreaterThanOrEqual(
    history[0].latency.median,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/${test.info().project.name}-complete.png`,
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByRole("row")).toHaveCount(2);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(
    page.getByText("Your last five completed tests will appear here."),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("cancels active downloads and can restart without saving partial results", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Run Test", exact: true }).click();
  await expect(page.getByRole("status").first()).toHaveText(
    "Measuring download",
    { timeout: 15000 },
  );
  await page.getByRole("button", { name: "Cancel Test" }).click();
  await expect(page.getByRole("status").first()).toHaveText("Test cancelled");
  await expect(page.getByLabel("Duration per speed test")).toBeEnabled();
  expect(
    await page.evaluate(() => localStorage.getItem("speedtest-history-v1")),
  ).toBeNull();
  await page.getByRole("button", { name: "Run Again" }).click();
  await expect(page.getByRole("status").first()).toContainText(
    "Measuring latency",
  );
  await page.getByRole("button", { name: "Cancel Test" }).click();
  await expect(page.getByRole("status").first()).toHaveText("Test cancelled");
});

test("shows server failures and recovers from corrupt browser history", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("speedtest-history-v1", "corrupt"),
  );
  await page.route("**/api/ping?*", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Run Test", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "The latency endpoint did not respond." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Run Again" })).toBeEnabled();
});

test("reports transfer failures and lets the user retry", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Duration per speed test").selectOption("5");
  await page.route("**/api/download?*", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.getByRole("button", { name: "Run Test", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "The download endpoint did not respond." }),
  ).toBeVisible({ timeout: 15000 });
  await page.unroute("**/api/download?*");
  await page.route("**/api/upload?*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"error":"Unavailable"}',
    }),
  );
  await page.getByRole("button", { name: "Run Again" }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "The server did not receive the full upload." }),
  ).toBeVisible({ timeout: 20000 });
  expect(
    await page.evaluate(() => localStorage.getItem("speedtest-history-v1")),
  ).toBeNull();
});
