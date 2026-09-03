import { expect, test } from "@playwright/test";

test("current task surface exposes all primary Kujo actions", async ({ page }) => {
  await page.goto("/?surface=task&entity=issue");

  await expect(page.getByRole("img", { name: "Kujo logo" })).toBeVisible();
  await expect(page.getByText("Workspace intelligence")).toBeVisible();
  await expect(page.getByRole("button", { name: /Generate Review Pack/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Generate Context Pack/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Capture Failure Evidence/ })).toBeDisabled();

  await page.getByRole("button", { name: /Generate Review Pack/ }).click();
  await expect.poll(() => page.evaluate(() => window.__KUJO_ACTIONS__?.[0]?.action)).toBe("generate-review");

  await page.getByLabel("Task").fill("Inspect the release boundary");
  await page.getByRole("button", { name: /Generate Context Pack/ }).click();
  await expect.poll(() => page.evaluate(() => window.__KUJO_ACTIONS__?.[1]?.action)).toBe("generate-context");

  await page.getByLabel("Title").fill("Verification failed");
  await page.getByLabel("Bounded log").fill("token=secret-value");
  await page.getByRole("button", { name: /Capture Failure Evidence/ }).click();
  await expect.poll(() => page.evaluate(() => window.__KUJO_ACTIONS__?.[2]?.action)).toBe("capture-failure");
});

for (const entity of ["project", "issue"] as const) {
  test(`detail tab renders populated ${entity} intelligence`, async ({ page }) => {
    await page.goto(`/?surface=detail&entity=${entity}&state=populated`);

    await expect(page.getByRole("img", { name: "Kujo logo" })).toBeVisible();
    await expect(page.getByText("Authentication boundary changed.")).toBeVisible();
    await expect(page.getByText("Hosted verification failed")).toBeVisible();
    await expect(page.getByText("Verify the Paperclip integration before release")).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear Kujo data" })).toBeVisible();
  });
}

test("run detail tab is read-only", async ({ page }) => {
  await page.goto("/?surface=detail&entity=run&state=populated");

  await expect(page.getByRole("img", { name: "Kujo logo" })).toBeVisible();
  await expect(page.getByText("Review Pack")).toBeVisible();
  await expect(page.getByText("Failure Evidence")).toBeVisible();
  await expect(page.getByText("Context Pack")).toBeVisible();
  await expect(page.getByText("Create a reviewable work record")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Clear Kujo data" })).toBeVisible();
});

for (const testCase of [
  { name: "desktop-light", viewport: { width: 1280, height: 1200 }, theme: "light" },
  { name: "narrow-dark", viewport: { width: 390, height: 1600 }, theme: "dark" },
] as const) {
  test(`${testCase.name} visual baseline`, async ({ page }) => {
    await page.setViewportSize(testCase.viewport);
    await page.goto(`/?surface=task&entity=issue&state=populated&theme=${testCase.theme}`);
    await expect(page.locator("#root")).toHaveScreenshot(`${testCase.name}.png`, {
      animations: "disabled",
      maxDiffPixelRatio: 0.02,
    });
  });
}
