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
  // Align this component crop to whole pixels; preceding cards can otherwise
  // shift its fractional origin and produce a one-pixel image-height change.
  const fraction = await section.evaluate((element) => element.getBoundingClientRect().top % 1);
  await section.evaluate((element, offset) => { (element as HTMLElement).style.transform = `translateY(${-offset}px)`; }, fraction);
  await expect(section).toHaveScreenshot("verification-import.png", { animations: "disabled", maxDiffPixelRatio: 0.02 });
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


test("release readiness shows signal-only gate semantics, partial coverage and scoped action", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1200 });
  await page.goto("/?surface=task&entity=issue&verification=1&shipcheck=partial&theme=dark");
  const section = page.getByRole("region", { name: "Release readiness", exact: true });
  await expect(section.getByText("Release signals: partial · STALE — inspect again", { exact: true })).toBeVisible();
  await expect(section.getByText("Native metadata gate: passed", { exact: false })).toContainText("1 warning");
  await expect(section.getByText("README.md: oversize", { exact: true })).toBeVisible();
  await expect(section.getByText("Readiness signals from bounded", { exact: false })).toContainText("not release certification");
  await section.screenshot({ path: "test-results/release-readiness-panel.png" });
  await section.getByText("Signals present (15)", { exact: true }).click();
  await expect(section.getByText("tests-exist: signal present", { exact: true })).toBeVisible();
  await section.getByRole("button", { name: "Inspect release readiness" }).click();
  await expect.poll(() => page.evaluate(() => window.__KUJO_ACTIONS__?.at(-1))).toMatchObject({ action: "inspect-release-readiness", input: { entityType: "issue", entityId: "issue-fixture" } });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("Essentials admits ShipCheck without exposing other verification actions", async ({ page }) => {
  await page.goto("/?surface=detail&entity=project&verification=1&profile=essentials&shipcheck=warnings");
  await expect(page.getByRole("button", { name: "Inspect release readiness", exact: true })).toBeEnabled();
  for (const name of ["Artifact drift", "Architecture boundaries", "Task contract", "Verification evidence"]) await expect(page.getByRole("region", { name, exact: true })).toHaveCount(0);
  for (const name of ["Inspect architecture", "Inspect artifact drift", "Import evaluation result", "Inspect task contract"]) {
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  }
  await page.goto("/?surface=detail&entity=project&verification=1&runtime=broken");
  await expect(page.getByRole("button", { name: "Inspect release readiness", exact: true })).toBeDisabled();
  await page.goto("/?surface=detail&entity=project&verification=1&profile=build");
  await expect(page.getByRole("region", { name: "Release readiness", exact: true })).toHaveCount(0);
  await page.goto("/?surface=detail&entity=run&verification=1");
  await expect(page.getByRole("button", { name: "Inspect release readiness", exact: true })).toHaveCount(0);
});

test("pending readiness errors cannot cross company navigation", async ({ page }) => {
  await page.goto("/?surface=detail&entity=project&verification=1");
  await page.evaluate(() => { window.__KUJO_DELAY_SHIPCHECK__ = true; });
  await page.getByRole("button", { name: "Inspect release readiness", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__KUJO_RESOLVE_SHIPCHECK__))).toBe(true);
  await page.evaluate(() => window.__KUJO_NAVIGATE__?.("other-company"));
  await page.evaluate(() => window.__KUJO_RESOLVE_SHIPCHECK__?.());
  await expect(page.getByText("private delayed readiness error")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Inspect release readiness", exact: true })).toBeEnabled();
});


test("Eval requires explicit preview, approval request and start, with retained receipts", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1200 });
  await page.goto("/?surface=task&entity=issue&execution=1");
  const section = page.getByRole("region", { name: "Approved evaluation", exact: true });
  await section.getByRole("button", { name: "Preview suite", exact: true }).click();
  await expect(section.getByText("Suite and input coverage", { exact: true })).toBeVisible();
  await expect(section.getByText("json_value_equals", { exact: true })).toBeVisible();
  await section.getByRole("button", { name: "Request approval", exact: true }).click();
  await expect(section.getByText(/Accept the human-only confirmation/)).toBeVisible();
  expect(await page.evaluate(() => window.__KUJO_ACTIONS__?.filter(item => (item.input as { operation?: string }).operation === "start"))).toHaveLength(0);
  await section.getByRole("button", { name: "Start approved evaluation", exact: true }).click();
  await expect(section.getByText("Evaluation: partial (native checks: passed)", { exact: true })).toBeVisible();
  await expect(section.getByText("Portable receipt: succeeded. Timing includes approval wait. Native check results and coverage remain separate.", { exact: true })).toBeVisible();
  await section.getByText("Execution receipt and approved inputs", { exact: true }).click();
  await expect(section.getByText(/"classification": "partial"/)).toBeVisible();
  await section.screenshot({ path: test.info().outputPath("approved-evaluation.png") });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("Eval is unavailable in project/run views and excluded profiles", async ({ page }) => {
  for (const query of ["entity=project", "entity=run", "entity=issue&profile=review"]) {
    await page.goto(`/?execution=1&${query}`);
    await expect(page.getByRole("region", { name: "Approved evaluation", exact: true })).toHaveCount(0);
  }
});

test("Eval ignores delayed results after company navigation", async ({ page }) => {
  await page.goto("/?surface=task&entity=issue&execution=1");
  await page.evaluate(() => { window.__KUJO_DELAY_EVAL__ = true; });
  await page.getByRole("button", { name: "Preview suite", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__KUJO_RESOLVE_EVAL__))).toBe(true);
  await page.evaluate(() => window.__KUJO_NAVIGATE__?.("other-company"));
  await page.evaluate(() => window.__KUJO_RESOLVE_EVAL__?.());
  await expect(page.getByText("private delayed Eval result")).toHaveCount(0);
  await expect(page.getByLabel("Eval suite file")).toHaveValue("eval.json");
});


test("Eval outcome links to its retained request and explains a pruned parent", async ({ page }) => {
  await page.goto("/?surface=task&entity=issue&execution=1&evalHistory=linked");
  await page.getByLabel("Evidence record").selectOption("outcome");
  await page.getByRole("button", { name: "Select request plan", exact: true }).click();
  await expect(page.getByLabel("Evidence record")).toHaveValue("plan");
  await page.goto("/?surface=task&entity=issue&execution=1&evalHistory=orphan");
  await page.getByLabel("Evidence record").selectOption("outcome");
  await expect(page.getByText(/The request plan is no longer retained here; its reference remains in the outcome/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Select request plan", exact: true })).toHaveCount(0);
});

test("Pending publication offers refresh without starting an evaluation", async ({ page }) => {
  await page.goto("/?surface=task&entity=issue&execution=1&historyPending=1");
  await page.getByRole("button", { name: "Refresh requests", exact: true }).click();
  await expect(page.getByText(/Some execution evidence is waiting to be saved/)).toBeVisible();
  await page.getByRole("button", { name: "Refresh evidence", exact: true }).click();
  await page.getByRole("button", { name: "Refresh requests", exact: true }).click();
  expect(await page.evaluate(() => window.__KUJO_ACTIONS__?.filter(item => (item.input as { operation?: string }).operation === "start"))).toHaveLength(0);
});

test("package inspection explains declaration-only scope and records on narrow screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto("/?surface=task&entity=issue&packages=report");
  const panel = page.getByRole("region", { name: "Kujo packages", exact: true });
  await expect(panel.getByText(/STALE — inspect again/)).toBeVisible();
  await expect(panel.getByText(/file:\.\.\/local/)).toBeVisible();
  await expect(panel.getByText(/not verification that packages are installed or trustworthy/)).toBeVisible();
  await panel.getByRole("button", { name: "Inspect packages", exact: true }).click();
  expect(await page.evaluate(() => window.__KUJO_ACTIONS__?.find(item => item.action === "inspect-kujo-packages")?.input)).toEqual({ entityType: "issue", entityId: "issue-fixture", path: "kennel.toml" });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await panel.screenshot({ path: test.info().outputPath("package-inspection.png") });
});

test("package inspector handles empty projects, runtime failures and profile/run restrictions", async ({ page }) => {
  await page.goto("/?packages=empty");
  await expect(page.getByText(/Add a kennel.toml package manifest/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Inspect packages", exact: true })).toBeDisabled();
  await page.goto("/?packages=report&runtime=broken");
  await expect(page.getByRole("button", { name: "Inspect packages", exact: true })).toBeDisabled();
  for (const query of ["entity=run", "profile=review"]) {
    await page.goto(`/?packages=report&${query}`);
    await expect(page.getByRole("region", { name: "Kujo packages", exact: true })).toHaveCount(0);
  }
});

test("delayed package errors cannot cross company navigation", async ({ page }) => {
  await page.goto("/?packages=report");
  await page.evaluate(() => { window.__KUJO_DELAY_PACKAGES__ = true; });
  await page.getByRole("button", { name: "Inspect packages", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__KUJO_RESOLVE_PACKAGES__))).toBe(true);
  await page.evaluate(() => window.__KUJO_NAVIGATE__?.("other-company"));
  await page.evaluate(() => window.__KUJO_RESOLVE_PACKAGES__?.());
  await expect(page.getByText("private delayed package result")).toHaveCount(0);
});

test("canonical starter preview shows source and downloads a review without creating project files", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto("/?starters=1&workspace=missing");
  const panel = page.getByRole("region", { name: "Kujo starters", exact: true });
  await panel.getByLabel("Starter project name").fill("demo-project");
  await panel.getByRole("button", { name: "Preview starter files", exact: true }).click();
  await expect(panel.getByLabel("Starter source")).toContainText("Hello from Kujo");
  await expect(panel.getByText("Generated programs have not run.")).toBeVisible();
  await panel.screenshot({ path: test.info().outputPath("starter-preview.png") });
  const download = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Download starter review JSON" }).click();
  expect((await download).suggestedFilename()).toBe("demo-project-starter.json");
  await panel.getByLabel("Starter", { exact: true }).selectOption("agent");
  await expect(panel.getByText("Install pinned Kennel dependencies before running.")).toBeVisible();
  await expect(panel.getByLabel("Starter source")).toHaveCount(0);
  await panel.getByLabel("Starter project name").fill("../escape");
  await expect(panel.getByRole("button", { name: "Preview starter files", exact: true })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await panel.screenshot({ path: test.info().outputPath("starters.png") });
});

test("starter controls enforce runtime/profile/run restrictions and discard late company results", async ({ page }) => {
  await page.goto("/?starters=1&runtime=broken");
  await expect(page.getByRole("button", { name: "Preview starter files", exact: true })).toBeDisabled();
  for (const query of ["entity=run", "profile=review"]) {
    await page.goto(`/?starters=1&${query}`);
    await expect(page.getByRole("region", { name: "Kujo starters", exact: true })).toHaveCount(0);
  }
  await page.goto("/?starters=1");
  await page.evaluate(() => { window.__KUJO_DELAY_PACKAGES__ = true; });
  await page.getByRole("button", { name: "Preview starter files", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__KUJO_RESOLVE_PACKAGES__))).toBe(true);
  await page.evaluate(() => window.__KUJO_NAVIGATE__?.("other-company"));
  await page.evaluate(() => window.__KUJO_RESOLVE_PACKAGES__?.());
  await expect(page.getByText("private delayed starter result")).toHaveCount(0);
});

test("API starter exposes canonical entrypoint and prerequisites without starting a server", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto("/?starters=1");
  const panel = page.getByRole("region", { name: "Kujo starters", exact: true });
  await panel.getByLabel("Starter", { exact: true }).selectOption("api");
  await expect(panel.getByText(/running creates a database and opens a port/)).toBeVisible();
  await panel.getByRole("button", { name: "Preview starter files", exact: true }).click();
  await expect(panel.getByLabel("Starter source")).toContainText("from src.server.runtime");
  await expect(panel.getByLabel("Proposed file", { exact: true })).toHaveValue("main.kujo");
  await expect(panel.getByText(/canonical-api-commit/)).toBeVisible();
  await expect(panel.getByText("No server started or database created.")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await panel.screenshot({ path: test.info().outputPath("api-starter.png") });
});

test("MCP starter identifies its canonical server and requires explicit client setup", async ({ page }) => {
  await page.goto("/?starters=1");
  const panel = page.getByRole("region", { name: "Kujo starters", exact: true });
  await panel.getByLabel("Starter", { exact: true }).selectOption("mcp");
  await expect(panel.getByText(/Review demo roots and auth/)).toBeVisible();
  await panel.getByRole("button", { name: "Preview starter files", exact: true }).click();
  await expect(panel.getByLabel("Proposed file", { exact: true })).toHaveValue("server.kujo");
  await expect(panel.getByText(/canonical-mcp-commit/)).toBeVisible();
  await expect(panel.getByText("No server registered or started.")).toBeVisible();
});

test("native run/test requires separate preview, approval request and explicit start", async ({ page }) => {
  await page.goto("/?surface=task&entity=issue&sourceExecution=1&profile=build");
  const section = page.getByRole("region", { name: "Approved Kujo run and test", exact: true });
  await expect(section).toBeVisible();
  await section.getByLabel("Kujo entry file").fill("main.kujo");
  await section.getByRole("button", { name: "Preview command", exact: true }).click();
  await expect(section.getByText("kujo run main.kujo", { exact: true })).toBeVisible();
  await section.getByRole("button", { name: "Request run/test approval", exact: true }).click();
  await expect(section.getByText(/Accept the human-only decision card/)).toBeVisible();
  expect(await page.evaluate(() => window.__KUJO_ACTIONS__?.some(call => call.action === "manage-kujo-execution" && (call.input as { operation: string }).operation === "start"))).toBe(false);
  await section.getByRole("button", { name: "Start approved command", exact: true }).click();
  await expect(section.getByLabel("Native Kujo output")).toContainText("native fixture output");
  await expect(section.getByText(/Exit zero alone/)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 1200 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(section).toHaveScreenshot(`source-execution-${process.platform}.png`, { animations: "disabled" });
});

test("fixture-test selection omits caller paths and clears stale previews", async ({ page }) => {
  await page.goto("/?surface=task&entity=issue&sourceExecution=1");
  const section = page.getByRole("region", { name: "Approved Kujo run and test", exact: true });
  await section.getByRole("button", { name: "Preview command", exact: true }).click();
  await section.getByLabel("Kujo operation").selectOption("fixtures");
  await expect(section.getByLabel("Kujo entry file")).toHaveCount(0);
  await expect(section.getByText("Command and approved input coverage", { exact: true })).toHaveCount(0);
  await section.getByRole("button", { name: "Preview command", exact: true }).click();
  await expect(section.getByText("kujo test --runtime interpreter", { exact: true })).toBeVisible();
  const last = await page.evaluate(() => window.__KUJO_ACTIONS__?.findLast(call => call.action === "manage-kujo-execution" && (call.input as { operation: string }).operation === "inspect"));
  expect(last?.input).toEqual({ operation: "inspect", issueId: "issue-fixture", mode: "fixtures" });
});

test("source execution is absent by default, on project/run surfaces and other profiles", async ({ page }) => {
  for (const query of ["entity=issue", "sourceExecution=1&entity=project", "sourceExecution=1&entity=run", "sourceExecution=1&entity=issue&profile=review", "sourceExecution=1&entity=issue&profile=ship"]) {
    await page.goto(`/?${query}`);
    await expect(page.getByRole("region", { name: "Approved Kujo run and test", exact: true })).toHaveCount(0);
  }
});

test("company navigation drops a late private source execution response", async ({ page }) => {
  await page.goto("/?surface=task&entity=issue&sourceExecution=1");
  await page.evaluate(() => { window.__KUJO_DELAY_SOURCE__ = true; });
  await page.getByRole("button", { name: "Preview command", exact: true }).click();
  await page.evaluate(() => window.__KUJO_NAVIGATE__?.("different-company"));
  await page.evaluate(() => window.__KUJO_RESOLVE_SOURCE__?.());
  await expect(page.getByText("private delayed source result", { exact: true })).toHaveCount(0);
});

test("starter creation requires reviewed files, human approval request and explicit creation", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 1200 });
  await page.goto("/?surface=task&entity=issue&projectCreation=1&profile=build");
  const section = page.getByRole("region", { name: "Approved Kujo project creation", exact: true });
  await expect(section.getByRole("button", { name: "Request file creation approval" })).toBeDisabled();
  await section.getByRole("button", { name: "Preview creation files" }).click();
  await expect(section.getByLabel("Creation source")).toContainText("Hello from Kujo");
  await section.getByRole("button", { name: "Request file creation approval" }).click();
  await expect(section.getByText(/A pending request does not prove approval/)).toBeVisible();
  expect(await page.evaluate(() => window.__KUJO_ACTIONS__?.some(entry => (entry.input as { operation?: string }).operation === "start"))).toBe(false);
  await section.getByRole("button", { name: "Create approved files", exact: true }).click();
  await expect(section.getByLabel("Created files")).toContainText("my-kujo-project/src/main.kujo");
  await expect(section.getByText(/Next: select this entry point in Run or test Kujo/)).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await section.screenshot({ path: testInfo.outputPath("starter-creation.png") });
});

test("changing a starter selection invalidates its preview and keeps creation explicit", async ({ page }) => {
  await page.goto("/?surface=task&entity=issue&projectCreation=1");
  const section = page.getByRole("region", { name: "Approved Kujo project creation", exact: true });
  await section.getByRole("button", { name: "Preview creation files" }).click();
  await section.getByLabel("Creation starter").selectOption("mcp");
  await expect(section.getByRole("button", { name: "Request file creation approval" })).toBeDisabled();
  await expect(section.getByLabel("Creation source")).toHaveCount(0);
  await section.getByLabel("Creation directory name").fill("my-mcp");
  await section.getByRole("button", { name: "Preview creation files" }).click();
  await expect.poll(() => page.evaluate(() => window.__KUJO_ACTIONS__?.findLast(entry => (entry.input as { operation?: string }).operation === "inspect"))).toMatchObject({ action: "manage-kujo-starter", input: { kind: "mcp", name: "my-mcp" } });
});

test("creation is absent by default and on project/run or excluded-profile surfaces", async ({ page }) => {
  for (const query of ["entity=issue", "entity=project&projectCreation=1", "entity=run&projectCreation=1", "entity=issue&projectCreation=1&profile=review", "entity=issue&projectCreation=1&profile=ship"]) {
    await page.goto(`/?surface=detail&${query}`);
    await expect(page.getByRole("region", { name: "Approved Kujo project creation", exact: true })).toHaveCount(0);
  }
});

test("company navigation discards delayed creation source and errors", async ({ page }) => {
  await page.goto("/?surface=task&entity=issue&projectCreation=1");
  await page.evaluate(() => { window.__KUJO_DELAY_CREATION__ = true; });
  await page.getByRole("button", { name: "Preview creation files" }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__KUJO_RESOLVE_CREATION__))).toBe(true);
  await page.evaluate(() => window.__KUJO_NAVIGATE__?.("other-company"));
  await page.evaluate(() => window.__KUJO_RESOLVE_CREATION__?.());
  await expect(page.getByText("private delayed creation result")).toHaveCount(0);
});

test("source preparation failure shows repair guidance and no retry control", async ({ page }) => {
  await page.goto("/?surface=task&entity=issue&sourceExecution=1");
  await page.evaluate(() => { window.__KUJO_SOURCE_REQUESTS__ = [{ id: "source_no_space", mode: "run", path: "main.kujo", state: "failed", diagnostic: "source_preparation:temporary_directory:ENOSPC", result: null }]; });
  const section = page.getByRole("region", { name: "Approved Kujo run and test", exact: true });
  await section.getByRole("button", { name: "Refresh run/test requests", exact: true }).click();
  await section.getByRole("button", { name: /Inspect run\/test/ }).click();
  await expect(section.getByText(/Free disk space or increase the storage quota/)).toBeVisible();
  await expect(section.getByRole("button", { name: "Start approved command", exact: true })).toHaveCount(0);
  await expect(section.getByLabel("Native Kujo output")).toHaveCount(0);
});
