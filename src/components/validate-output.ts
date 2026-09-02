import { z } from "zod";
import { KujoPluginError } from "../runtime/errors.js";
import type { ComponentId } from "./registry.js";

const changebucket = z.object({
  base: z.string(),
  head: z.string(),
  summary: z.object({
    files_changed: z.number().int().nonnegative(),
    lines_added: z.number().int().nonnegative(),
    lines_deleted: z.number().int().nonnegative(),
    total_churn: z.number().int().nonnegative(),
    risk_level: z.enum(["low", "medium", "high"]),
  }).passthrough(),
  categories: z.record(z.string(), z.array(z.string())),
  files: z.array(z.unknown()),
}).passthrough();

const patchbriefSummary = z.object({
  tool: z.string(), version: z.string(), repo: z.string(), branch: z.string(), summary: z.unknown(), files: z.array(z.unknown()),
}).passthrough();

const patchbriefHandoff = z.object({
  format: z.literal("patchbrief-handoff"), version: z.string(), repo: z.string(), branch: z.string(), files: z.array(z.unknown()),
}).passthrough();

const scentSummary = z.object({
  output_dir: z.string(), estimated_tokens: z.number().nonnegative(), budget: z.number().positive(), included_files: z.number().int().nonnegative(),
}).passthrough();

export function validateComponentOutput(component: ComponentId, operation: string | undefined, value: unknown): unknown {
  try {
    if (component === "changebucket") return changebucket.parse(value);
    if (component === "patchbrief" && operation === "summarize") return patchbriefSummary.parse(value);
    if (component === "patchbrief" && operation === "handoff") return patchbriefHandoff.parse(value);
    if (component === "patchbrief" && operation !== "suggest-tests") throw new Error(`Unsupported patchbrief operation: ${operation ?? "undefined"}`);
    if (component === "context") return scentSummary.parse(value);
    if (typeof value !== "object" || value === null) throw new Error("Expected a JSON object");
    return value;
  } catch (error) {
    throw new KujoPluginError("KUJO_COMPONENT_SCHEMA_INVALID", `${component} output failed contract validation`, {
      operation,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
