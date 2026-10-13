import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { PluginConfig } from "../../config/schema.js";
import { resolveComponent } from "../../components/registry.js";
import { executeKujo } from "../../runtime/execute-kujo.js";
import { resolveKujo } from "../../runtime/resolve-kujo.js";
import { removeTree } from "../../runtime/files.js";
import { KujoPluginError } from "../../runtime/errors.js";
import { captureWorkspaceSnapshot, isSnapshotCurrent } from "../../paperclip/git.js";
import { redactText } from "../failure/redact.js";
import { discoverWorkspaceText, readWorkspaceText, workspaceTextPathSchema } from "../language/source.js";
import { languageReportSchema } from "../language/schema.js";

export const specPathSchema = workspaceTextPathSchema.refine((path) => /\.spec\.(?:json|ya?ml|toml)$/.test(path), "Choose a .spec.json, .spec.yml, .spec.yaml or .spec.toml contract");
export const specInputSchema = z.object({ path: specPathSchema, strict: z.boolean().default(false) }).strict();
export const specValidationSchema = z.object({ valid: z.boolean(), errors: z.array(z.string().max(4000)).max(1000), warnings: z.array(z.string().max(4000)).max(1000).default([]) });
const text = z.string().max(20000);
const NOT_RUN = "not-run" as const;
export const specReportSchema = z.object({
  schemaVersion: z.literal(1), id: z.string(), generatedAt: z.string(), projectId: z.string(), workspaceId: z.string(),
  path: specPathSchema, sourceDigest: z.string(), runtimeVersion: z.string(),
  provenance: z.object({ component: z.literal("spec"), version: z.string(), commit: z.string() }),
  validation: z.object({ status: z.enum(["passed", "warnings", "failed"]), native: z.boolean(), strict: z.boolean(), errors: z.array(text), warnings: z.array(text) }),
  contract: z.object({ name: text, goal: text, scope: text,
    criteria: z.array(z.object({ text, status: z.literal(NOT_RUN) })).max(100),
    checks: z.array(z.object({ description: text, checkType: text.nullable(), status: z.literal(NOT_RUN) })).max(200),
    nonGoals: z.array(text).max(100), approvalPoints: z.array(text).max(50),
  }).nullable(),
  snapshot: languageReportSchema.shape.snapshot, stale: z.boolean(), redactedCount: z.number().int().nonnegative(),
  scope: z.literal("Contract validation only. Acceptance criteria and declared checks have not been executed or proved; approval points are declarations, not granted approvals."),
});
export type SpecReport = z.infer<typeof specReportSchema>;
export const discoverSpecs = (cwd: string) => discoverWorkspaceText(cwd, (path) => specPathSchema.safeParse(path).success);

function withinDepth(value: unknown, depth = 0): boolean {
  return depth <= 32 && (value === null || typeof value !== "object" || Object.values(value).every((child) => withinDepth(child, depth + 1)));
}

export async function inspectSpec(input: { cwd: string; path: string; strict?: boolean; projectId: string; workspaceId: string; config: PluginConfig }): Promise<SpecReport> {
  if (!input.config.features.verification) throw new Error("Verification is disabled by configuration or profile");
  const params = specInputSchema.parse({ path: input.path, strict: input.strict });
  if (!(await discoverSpecs(input.cwd)).files.includes(params.path)) throw new KujoPluginError("KUJO_WORKSPACE_OUTSIDE_ALLOWED_ROOT", "Contract was not found in the bounded Git-visible catalog");
  const snapshot = await captureWorkspaceSnapshot(input.cwd);
  const directory = await mkdtemp(join(tmpdir(), "kujo-paperclip-spec-"));
  try {
    const [runtime, component] = await Promise.all([resolveKujo(input.config, directory), resolveComponent("spec")]);
    const read = () => readWorkspaceText({ ...input, directory, runtime });
    const source = await read();
    const inputPath = join(directory, "contract.input");
    const parsedPath = join(directory, "contract.json");
    await writeFile(inputPath, source.source, { mode: 0o600 });
    const invoke = (entry: string, args: string[]) => executeKujo({ executable: runtime.executable, cwd: directory,
      args: ["run", join(component.root, entry), "--", ...args], timeoutMs: Math.min(input.config.limits.timeoutMs, 5_000),
      maxStdoutBytes: Math.min(input.config.limits.maxStdoutBytes, 512_000), maxStderrBytes: Math.min(input.config.limits.maxStderrBytes, 4096) });
    const extension = params.path.split(".").at(-1)!;
    const converted = await invoke("src/convert.kujo", ["--input", inputPath, "--from", extension === "yml" ? "yaml" : extension, "--to", "json"]);
    if (![0, 1].includes(converted.exitCode)) throw new KujoPluginError("KUJO_RUNTIME_EXEC_FAILED", "Contract conversion failed before producing a result");
    let value: Record<string, unknown> | null = null;
    let native = false;
    let validation: z.infer<typeof specValidationSchema> = { valid: false, errors: ["Contract could not be parsed in its declared format."], warnings: [] };
    if (converted.exitCode === 0) {
      const parsed: unknown = JSON.parse(converted.stdout);
      if (!withinDepth(parsed)) validation.errors = ["Contract exceeds the maximum nesting depth of 32."];
      else if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") validation.errors = ["Contract must be an object."];
      else if (["name", "goal"].some((key) => key in parsed && typeof (parsed as Record<string, unknown>)[key] !== "string")) validation.errors = ["Contract name and goal must be strings."];
      else {
        value = parsed as Record<string, unknown>;
        await writeFile(parsedPath, JSON.stringify(parsed), { mode: 0o600 });
        const checked = await invoke(component.entrypoint, ["--json", parsedPath]);
        if (checked.exitCode !== 0) throw new KujoPluginError("KUJO_RUNTIME_EXEC_FAILED", "Canonical Spec validation did not complete");
        validation = specValidationSchema.parse(JSON.parse(checked.stdout));
        if (validation.valid !== (validation.errors.length === 0)) throw new KujoPluginError("KUJO_COMPONENT_SCHEMA_INVALID", "Spec validity contradicts its diagnostics");
        native = true;
      }
    }
    let redactedCount = 0;
    const redact = (value: unknown): string => {
      const result = redactText(typeof value === "string" ? value : ""); redactedCount += result.count; return result.text;
    };
    const strings = (value: unknown) => Array.isArray(value) ? value.map(redact) : [];
    const contract = validation.valid && value ? {
      name: redact(value.name), goal: redact(value.goal), scope: redact(value.scope),
      criteria: strings(value.acceptance_criteria).map((text) => ({ text, status: NOT_RUN })),
      checks: (Array.isArray(value.eval_requirements) ? value.eval_requirements : []).map((item) => ({ description: redact(item.description), checkType: typeof item.check_type === "string" ? redact(item.check_type) : null, status: NOT_RUN })),
      nonGoals: strings(value.non_goals), approvalPoints: strings(value.human_approval_points),
    } : null;
    const errors = validation.errors.map(redact), warnings = validation.warnings.map(redact);
    return specReportSchema.parse({ schemaVersion: 1, id: `spec_${randomUUID()}`, generatedAt: new Date().toISOString(),
      projectId: input.projectId, workspaceId: input.workspaceId, path: params.path, sourceDigest: source.digest, runtimeVersion: runtime.runtimeVersion,
      provenance: { component: "spec", version: component.version, commit: component.gitCommit },
      validation: { status: !validation.valid || (params.strict && warnings.length) ? "failed" : warnings.length ? "warnings" : "passed", native, strict: params.strict, errors, warnings },
      contract, snapshot, stale: (await read().catch(() => null))?.digest !== source.digest || !(await isSnapshotCurrent(input.cwd, snapshot)), redactedCount,
      scope: "Contract validation only. Acceptance criteria and declared checks have not been executed or proved; approval points are declarations, not granted approvals.",
    });
  } finally { await removeTree(directory); }
}
