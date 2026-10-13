import { expect, test } from "@playwright/test";

test("task contracts distinguish validity, unexecuted acceptance and declared approvals", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1200 });
  await page.goto("/?surface=task&entity=issue&verification=1&spec=1&specReport=1&theme=dark");
  const section = page.getByRole("region", { name: "Task contract", exact: true });
  await expect(section.getByText("Contract validation: warnings", { exact: true })).toBeVisible();
  await expect(section.getByText("Not run · A new user can install the package", { exact: true })).toBeVisible();
  await expect(section.getByText("Maintainer reviews release evidence · Approval not granted", { exact: true })).toBeVisible();
  await section.getByLabel("Treat warnings as validation failures").check();
  await section.getByRole("button", { name: "Review task contract" }).click();
  await expect.poll(() => page.evaluate(() => window.__KUJO_ACTIONS__?.at(-1))).toMatchObject({ action: "inspect-task-contract", input: { entityType: "issue", entityId: "issue-fixture", path: "specs/release.spec.yml", strict: true } });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(section).toHaveScreenshot("task-contract.png", { animations: "disabled", maxDiffPixelRatio: 0.02 });
});

test("contract validation needs runtime readiness and profile admission", async ({ page }) => {
  await page.goto("/?surface=detail&entity=project&verification=1&spec=1&runtime=broken");
  await page.getByLabel("Contract file").selectOption("specs/release.spec.yml");
  await expect(page.getByRole("button", { name: "Review task contract" })).toBeDisabled();
  await page.goto("/?surface=detail&entity=project&verification=1&spec=1&profile=build");
  await expect(page.getByRole("region", { name: "Task contract", exact: true })).toHaveCount(0);
});

test("a pending contract request cannot carry selection or errors across companies", async ({ page }) => {
  await page.goto("/?surface=detail&entity=project&verification=1&spec=1");
  await page.evaluate(() => { window.__KUJO_DELAY_SPEC__ = true; });
  await page.getByLabel("Contract file").selectOption("specs/release.spec.yml");
  await page.getByRole("button", { name: "Review task contract" }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__KUJO_RESOLVE_SPEC__))).toBe(true);
  await page.evaluate(() => window.__KUJO_NAVIGATE__?.("other-company"));
  await expect(page.getByLabel("Contract file")).toHaveValue("");
  await page.evaluate(() => window.__KUJO_RESOLVE_SPEC__?.());
  await expect(page.getByText("private delayed contract error")).toHaveCount(0);
});

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
  await expect(page.getByText("Review Pack", { exact: true })).toBeVisible();
  await expect(page.getByText("Failure Evidence", { exact: true })).toBeVisible();
  await expect(page.getByText("Context Pack", { exact: true })).toBeVisible();
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


test("language checks and formatting preview require a source choice", async ({ page }) => {
  await page.goto("/?surface=task&entity=issue&language=1");
  await expect(page.getByRole("button", { name: "Check and lint source" })).toBeDisabled();
  await page.getByLabel("Kujo source", { exact: true }).selectOption("src/main.kujo");
  await page.getByRole("button", { name: "Check and lint source" }).click();
  await expect.poll(() => page.evaluate(() => window.__KUJO_ACTIONS__?.[0]?.action)).toBe("check-kujo-source");
  await expect(page.getByText("Source check: failed · Lint: warnings")).toBeVisible();
  await expect(page.getByText("src/main.kujo:2:9", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "src/main.kujo:2:9", exact: true }).click();
  await expect(page.locator('[data-source-line="2"]')).toBeVisible();
  await expect(page.getByText("Formatting changes available")).toBeVisible();
  await expect(page.getByText("answer := 40 + 2", { exact: true })).toBeVisible();
  await expect(page.getByText(/Preview only; no changes applied/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Build with Kujo" })).toHaveScreenshot("language-preview.png", { animations: "disabled", maxDiffPixelRatio: 0.02 });
  await page.goto("/?surface=task&entity=issue&language=1&runtime=broken");
  await page.getByLabel("Kujo source", { exact: true }).selectOption("src/main.kujo");
  await expect(page.getByRole("button", { name: "Check and lint source" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Preview formatting" })).toBeDisabled();
});


test("late source previews cannot populate a different company panel", async ({ page }) => {
  await page.goto("/?surface=task&entity=issue&language=1");
  await page.evaluate(() => { window.__KUJO_DELAY_FORMAT__ = true; });
  await page.getByLabel("Kujo source", { exact: true }).selectOption("src/main.kujo");
  await page.getByRole("button", { name: "Preview formatting" }).click();
  await expect.poll(() => page.evaluate(() => typeof window.__KUJO_RESOLVE_FORMAT__)).toBe("function");
  await page.evaluate(() => window.__KUJO_NAVIGATE__?.("other-company"));
  await expect(page.getByLabel("Kujo source", { exact: true })).toHaveValue("");
  await page.evaluate(() => window.__KUJO_RESOLVE_FORMAT__?.());
  await expect(page.getByText("Formatting changes available")).toHaveCount(0);
  await expect(page.getByLabel("Kujo source", { exact: true })).toHaveValue("");
});


test("history inspection, comparison, download and explicit issue attachment", async ({ page }) => {
  await page.goto("/?surface=task&entity=issue&history=1");
  await page.getByLabel("Evidence record").selectOption("before");
  await page.getByRole("button", { name: "Inspect evidence" }).click();
  await expect(page.getByLabel("Evidence result")).toContainText("Source checks only");
  await page.getByLabel("Compare with").selectOption("after");
  await page.getByRole("button", { name: "Compare evidence" }).click();
  await expect(page.getByLabel("Evidence result")).toContainText('"sameInputs": null');
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download redacted export" }).click();
  expect((await download).suggestedFilename()).toBe("before.json");
  await page.getByRole("button", { name: "Attach to this issue" }).click();
  await expect(page.getByLabel("Evidence result")).toContainText("attached to this issue");
  await expect(page.getByRole("region", { name: "Evidence history" })).toHaveScreenshot("evidence-history.png", { animations: "disabled", maxDiffPixelRatio: 0.02 });
});

test("a pending history read cannot appear after company navigation", async ({ page }) => {
  await page.goto("/?surface=detail&entity=project&history=1");
  await page.evaluate(() => { window.__KUJO_DELAY_HISTORY__ = true; });
  await page.getByLabel("Evidence record").selectOption("before");
  await page.getByRole("button", { name: "Inspect evidence" }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__KUJO_RESOLVE_HISTORY__))).toBe(true);
  await page.evaluate(() => { window.__KUJO_NAVIGATE__?.("company-other"); });
  await expect(page.getByLabel("Evidence record")).toHaveValue("");
  await page.evaluate(() => { window.__KUJO_RESOLVE_HISTORY__?.(); });
  await expect(page.getByLabel("Evidence result")).toHaveCount(0);
});


test("capability discovery separates profile selection, host authorization and missing adapters", async ({ page }) => {
  await page.goto("/?surface=task&entity=issue&profile=essentials");
  const explorer = page.getByRole("region", { name: "Explore Kujo capabilities" });
  await expect(page.getByRole("button", { name: /Generate Review Pack/ })).toBeDisabled();
  const review = explorer.locator("details").filter({ hasText: "Generate Review Pack" });
  await review.locator("summary").click();
  await expect(review.getByText("Not selected by the company's capability profile.")).toBeVisible();
  await expect(review.getByText("Authorization: checked on call")).toBeVisible();
  await explorer.getByRole("button", { name: "Explore 38 canonical capabilities" }).click();
  await expect(page.getByLabel("Canonical ecosystem catalog")).toBeVisible();
  await expect(page.getByLabel("Canonical ecosystem catalog").locator("summary").filter({ hasText: /RAG/ }).first()).toContainText("Not integrated yet");
  await explorer.getByRole("button", { name: "Hide ecosystem catalog" }).click();
  await expect(explorer).toHaveScreenshot("capability-catalog.png", { animations: "disabled", maxDiffPixelRatio: 0.02 });
});

test("capability discovery fits a narrow viewport and resets on company navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1200 });
  await page.goto("/?surface=detail&entity=project&theme=dark");
  const explorer = page.getByRole("region", { name: "Explore Kujo capabilities" });
  await explorer.getByRole("button", { name: "Explore 38 canonical capabilities" }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => window.__KUJO_NAVIGATE__?.("other-company"));
  await expect(page.getByLabel("Canonical ecosystem catalog")).toHaveCount(0);
});

test("verification imports show external claims and remain available without a runtime", async ({ page }) => {
  await page.goto("/?surface=task&entity=issue&verification=1&runtime=broken");
  const section = page.getByRole("region", { name: "Verification evidence" });
  await expect(section.getByText("No evaluation result imported.", { exact: false })).toBeVisible();
  await section.getByLabel("Evaluation result JSON").fill('{"schema":"kujo.evaluation-result/v1"}');
  await section.getByRole("button", { name: "Import evaluation result" }).click();
  await expect(section.getByText("Imported · partial")).toBeVisible();
  await expect(section.getByText("Claimed checks: 3 passed · 0 failed · 0 warned · 1 skipped")).toBeVisible();
  await expect(section.getByLabel("Evaluation result JSON")).toHaveValue("");
  await expect(section).toHaveScreenshot(`verification-import-${process.platform}.png`, { animations: "disabled", maxDiffPixelRatio: 0.02 });
});

test("verification import state cannot follow a pending request across company navigation", async ({ page }) => {
  await page.goto("/?surface=detail&entity=project&verification=1");
  await page.evaluate(() => { window.__KUJO_DELAY_IMPORT__ = true; });
  await page.getByLabel("Evaluation result JSON").fill("private-supplied-json");
  await page.getByRole("button", { name: "Import evaluation result" }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__KUJO_RESOLVE_IMPORT__))).toBe(true);
  await page.evaluate(() => window.__KUJO_NAVIGATE__?.("other-company"));
  await expect(page.getByLabel("Evaluation result JSON")).toHaveValue("");
  await page.evaluate(() => window.__KUJO_RESOLVE_IMPORT__?.());
  await expect(page.getByText("Imported · partial")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Import evaluation result" })).toBeDisabled();
});


test("architecture inspection shows incomplete coverage, findings, threshold semantics and scoped action", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1200 });
  await page.goto("/?surface=task&entity=issue&verification=1&fence=partial&theme=dark");
  const section = page.getByRole("region", { name: "Architecture boundaries", exact: true });
  await expect(section.getByText("Architecture inspection: partial · STALE — inspect again", { exact: true })).toBeVisible();
  await expect(section.getByText("Declared fail_on: none", { exact: false })).toContainText("Threshold result: passed");
  await expect(section.getByText("src/ui/large.ts: oversize", { exact: true })).toBeVisible();
  await expect(section.getByText("error: src/ui/view.ts:1", { exact: true })).toBeVisible();
  await expect(section.getByText("Best-effort import boundaries", { exact: false })).toContainText("not that the project is verified");
  await section.getByRole("button", { name: "Inspect architecture" }).click();
  await expect.poll(() => page.evaluate(() => window.__KUJO_ACTIONS__?.at(-1))).toMatchObject({ action: "inspect-architecture", input: { entityType: "issue", entityId: "issue-fixture" } });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // Keep the reviewed Linux and macOS text rasterization baselines separate.
  await expect(section).toHaveScreenshot(`architecture-boundaries-${process.platform}.png`, { animations: "disabled", maxDiffPixelRatio: 0.02 });
});

test("architecture admission honors runtime, profiles and read-only run views", async ({ page }) => {
  await page.goto("/?surface=detail&entity=project&verification=1&runtime=broken");
  await expect(page.getByRole("button", { name: "Inspect architecture", exact: true })).toBeDisabled();
  await page.goto("/?surface=detail&entity=project&verification=1&profile=build");
  await expect(page.getByRole("region", { name: "Architecture boundaries", exact: true })).toHaveCount(0);
  await page.goto("/?surface=detail&entity=run&verification=1");
  await expect(page.getByRole("button", { name: "Inspect architecture", exact: true })).toHaveCount(0);
  await page.goto("/?surface=detail&entity=project&verification=1&fence=passed");
  await expect(page.getByRole("region", { name: "Architecture boundaries", exact: true }).getByText("1 imports checked · 1 errors · 0 warnings · 1 ignored findings", { exact: true })).toBeVisible();
});

test("pending architecture errors cannot cross company navigation", async ({ page }) => {
  await page.goto("/?surface=detail&entity=project&verification=1");
  await page.evaluate(() => { window.__KUJO_DELAY_FENCE__ = true; });
  await page.getByRole("button", { name: "Inspect architecture", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__KUJO_RESOLVE_FENCE__))).toBe(true);
  await page.evaluate(() => window.__KUJO_NAVIGATE__?.("other-company"));
  await page.evaluate(() => window.__KUJO_RESOLVE_FENCE__?.());
  await expect(page.getByText("private delayed architecture error")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Inspect architecture", exact: true })).toBeEnabled();
});


test("artifact drift shows honest partial scope, native leads and scoped action on narrow screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1200 });
  await page.goto("/?surface=task&entity=issue&verification=1&concord=partial&theme=dark");
  const section = page.getByRole("region", { name: "Artifact drift", exact: true });
  await expect(section.getByText("Artifact drift: partial · STALE — inspect again", { exact: true })).toBeVisible();
  await expect(section.getByText("docs/large.md: oversize", { exact: true })).toBeVisible();
  await expect(section.getByText("high: Version metadata disagrees", { exact: true })).toBeVisible();
  await expect(section.getByText("versions · Confidence: high · Human review: required", { exact: true })).toBeVisible();
  await expect(section.getByText("Experimental convention-based", { exact: false })).toContainText("does not verify project correctness");
  await section.screenshot({ path: "test-results/artifact-drift-panel.png" });
  await section.getByRole("button", { name: "Inspect artifact drift" }).click();
  await expect.poll(() => page.evaluate(() => window.__KUJO_ACTIONS__?.at(-1))).toMatchObject({ action: "inspect-artifact-drift", input: { entityType: "issue", entityId: "issue-fixture" } });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("artifact drift admission honors runtime, profiles, blocked references and read-only run views", async ({ page }) => {
  await page.goto("/?surface=detail&entity=project&verification=1&runtime=broken");
  await expect(page.getByRole("button", { name: "Inspect artifact drift", exact: true })).toBeDisabled();
  await page.goto("/?surface=detail&entity=project&verification=1&profile=build");
  await expect(page.getByRole("region", { name: "Artifact drift", exact: true })).toHaveCount(0);
  await page.goto("/?surface=detail&entity=run&verification=1");
  await expect(page.getByRole("button", { name: "Inspect artifact drift", exact: true })).toHaveCount(0);
  await page.goto("/?surface=detail&entity=project&verification=1&concord=blocked");
  await expect(page.getByText("kennel.toml · entry: Snapshot entry must stay relative.", { exact: true })).toBeVisible();
  await expect(page.getByText("Version metadata disagrees", { exact: false })).toHaveCount(0);
});

test("pending artifact drift errors cannot cross company navigation", async ({ page }) => {
  await page.goto("/?surface=detail&entity=project&verification=1");
  await page.evaluate(() => { window.__KUJO_DELAY_CONCORD__ = true; });
  await page.getByRole("button", { name: "Inspect artifact drift", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__KUJO_RESOLVE_CONCORD__))).toBe(true);
  await page.evaluate(() => window.__KUJO_NAVIGATE__?.("other-company"));
  await page.evaluate(() => window.__KUJO_RESOLVE_CONCORD__?.());
  await expect(page.getByText("private delayed artifact drift error")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Inspect artifact drift", exact: true })).toBeEnabled();
});
