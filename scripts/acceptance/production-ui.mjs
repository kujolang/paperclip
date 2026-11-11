import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";

/** Optional real-host browser checks; all accounts, content and cookies are disposable. */
export async function qualifyProductionUi({ call, companyId, projectId, issueId, root, base, cookie, checks }) {
  const browser = await chromium.launch({
    ...(process.env.KUJO_ACCEPTANCE_BROWSER ? { executablePath: process.env.KUJO_ACCEPTANCE_BROWSER } : {}),
  });
  const context = await browser.newContext();
  try {
    await context.addCookies(cookie.split("; ").map(item => {
      const split = item.indexOf("=");
      return { name: item.slice(0, split), value: item.slice(split + 1), url: base };
    }));
    const page = await context.newPage();
    // This test must never contact provider services, analytics, or other hosts.
    await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await page.goto(`${base}/issues/${issueId}`);
    try {
      await expect(page.getByRole("button", { name: /Generate Review Pack/ }).first()).toBeVisible({ timeout: 30_000 });
      checks.push("actual host task detail renders the Kujo workspace with authenticated bridge data");
    } catch (error) {
      await writeFile(join(root, "ui-observation.txt"), await page.locator("body").innerText(), { mode: 0o600 });
      throw error;
    }
    const title = "Browser acceptance retained failure";
    await page.getByLabel("Title", { exact: true }).fill(title);
    await page.getByLabel("Bounded log", { exact: true }).fill("Offline browser fixture failure");
    await page.getByRole("button", { name: /Capture Failure Evidence/ }).click();
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    const retained = (await call("/plugins/kujolang.paperclip/bridge/data", {
      method: "POST", body: { companyId, key: "detail", params: { entityType: "issue", entityId: issueId } },
    })).data;
    assert.ok(JSON.stringify(retained).includes(title));
    checks.push("actual host task UI action retains failure evidence and displays its returned result");
    await page.goto(`${base}/projects/${projectId}`);
    await page.getByRole("tab", { name: "Kujo", exact: true }).click();
    await expect(page.getByRole("button", { name: /Generate Review Pack/ }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    checks.push("actual host project Kujo detail tab renders and does not carry issue evidence across navigation");
    if (process.env.KUJO_ACCEPTANCE_RUN_UI === "1") {
      await writeFile(join(root, "ui-agent-idle.mjs"), "setTimeout(() => {}, 600000);\n");
      const agent = (await call(`/companies/${companyId}/agents`, { method: "POST", status: 201, body: {
        name: "UI run acceptance", role: "ceo", adapterType: "process",
        adapterConfig: { command: process.execPath, args: [join(root, "ui-agent-idle.mjs")] },
      } })).data;
      const key = (await call(`/agents/${agent.id}/keys`, { method: "POST", status: 201, body: { name: "Disposable UI key" } })).data;
      let runId;
      try {
        runId = (await call(`/agents/${agent.id}/heartbeat/invoke`, { method: "POST", status: 202, body: { reason: "ui_qualification", idempotencyKey: `ui-${agent.id}` } })).data.id;
        assert.ok(runId);
        const title = "Retained run browser fixture";
        const captured = (await call("/plugins/tools/execute", { method: "POST", token: key.token || key.key, runId, body: {
          tool: "kujolang.paperclip:capture-failure", parameters: { title, log: "Offline fixture" }, runContext: { companyId, projectId, agentId: agent.id, runId },
        } })).data.result;
        assert.equal(captured.error, undefined);
        await page.goto(`${base}/agents/${agent.id}/runs/${runId}`);
        try {
          await expect(page.getByRole("tab", { name: "Kujo", exact: true })).toBeVisible({ timeout: 15_000 });
        } catch (error) {
          await writeFile(join(root, "run-ui-observation.txt"), await page.locator("body").innerText(), { mode: 0o600 });
          throw error;
        }
        await page.getByRole("tab", { name: "Kujo", exact: true }).click();
        await expect(page.getByText(title, { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: /Capture Failure Evidence|Generate Review Pack|Clear Kujo data/ })).toHaveCount(0);
        checks.push("actual host run Kujo tab displays scoped retained evidence read-only");
      } finally {
        try { if (runId) await call(`/heartbeat-runs/${runId}/cancel`, { method: "POST", body: {} }); }
        finally { await call(`/agents/${agent.id}/keys/${key.id}`, { method: "DELETE" }); }
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }
}
