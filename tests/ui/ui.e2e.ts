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
  await expect(page.getByRole("button", { name: "Clear Kujo data" })).toHaveCount(0);
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

test("broken runtime never claims readiness or permits generation", async ({ page }) => {
  await page.goto("/?surface=task&entity=issue&runtime=broken");
  await expect(page.getByLabel("NEEDS ATTENTION status")).toBeVisible();
  await expect(page.getByLabel("READY status")).toHaveCount(0);
  await expect(page.getByText("Repair the configured Kujo binary in plugin settings.")).toBeVisible();
  await page.getByLabel("Task").fill("Inspect this task");
  await page.getByLabel("Title").fill("Failure");
  for (const name of [/Generate Review Pack/, /Generate Context Pack/, /Capture Failure Evidence/, /Try the Kujo example/]) {
    await expect(page.getByRole("button", { name })).toBeDisabled();
  }
});

test("missing workspace offers a real example action and setup guidance", async ({ page }) => {
  await page.goto("/?surface=task&entity=issue&workspace=missing&issueTask=1");
  await expect(page.getByText(/Connect a local project workspace/)).toBeVisible();
  await expect(page.getByLabel("Task")).toHaveValue("Investigate the OAuth callback");
  await expect(page.getByRole("button", { name: /Generate Context Pack/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Generate Review Pack/ })).toBeDisabled();
  await page.getByRole("button", { name: "Try the Kujo example" }).click();
  await expect(page.getByText(/Example passed/)).toBeVisible();
  await expect(page.getByLabel("Example output")).toContainText('"total":36');
  await expect.poll(() => page.evaluate(() => window.__KUJO_ACTIONS__?.[0])).toEqual({ action: "run-example", input: {} });
});

test("empty workspace explains why context cannot be selected", async ({ page }) => {
  await page.goto("/?surface=task&entity=issue&workspace=empty&issueTask=1");
  await expect(page.getByText(/This Git workspace is empty/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Generate Context Pack/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Try the Kujo example" })).toBeEnabled();
});


test("repository map action and partial evidence remain understandable", async ({ page }) => {
  await page.goto("/?surface=task&entity=issue&map=1");
  await page.getByRole("button", { name: "Understand this repository" }).click();
  await expect.poll(() => page.evaluate(() => window.__KUJO_ACTIONS__?.[0]?.action)).toBe("understand-repository");
  await expect(page.getByText(/Partial scan.*STALE/)).toBeVisible();
  await expect(page.getByText(/12 code files/)).toBeVisible();
  await page.getByText("Dependencies and routes", { exact: true }).click();
  await expect(page.getByText("GET /health", { exact: true })).toBeVisible();
  await page.getByText(/Heuristic observations \(1\)/).click();
  await expect(page.getByText("src/large.ts: truncated_100000b", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Repository understanding" })).toHaveScreenshot("repository-map.png", { animations: "disabled", maxDiffPixelRatio: 0.02 });
  await page.goto("/?entity=project&workspace=missing");
  await expect(page.getByRole("button", { name: "Understand this repository" })).toBeDisabled();
});
