import { z } from "zod";
import { DEFAULT_LIMITS } from "./defaults.js";

export const pluginConfigSchema = z.object({
  runtime: z.object({
    binary: z.string().trim().min(1).nullable().default(null),
    allowSystemPathFallback: z.boolean().default(true),
  }).default({ binary: null, allowSystemPathFallback: true }),
  features: z.object({
    review: z.boolean().default(true),
    failureEvidence: z.boolean().default(true),
    context: z.boolean().default(true),
    verification: z.boolean().default(false),
  }).default({ review: true, failureEvidence: true, context: true, verification: false }),
  limits: z.object({
    timeoutMs: z.number().int().min(1_000).max(120_000).default(DEFAULT_LIMITS.timeoutMs),
    maxStdoutBytes: z.number().int().min(1_024).max(10_000_000).default(DEFAULT_LIMITS.maxStdoutBytes),
    maxStderrBytes: z.number().int().min(1_024).max(2_000_000).default(DEFAULT_LIMITS.maxStderrBytes),
  }).default({
    timeoutMs: DEFAULT_LIMITS.timeoutMs,
    maxStdoutBytes: DEFAULT_LIMITS.maxStdoutBytes,
    maxStderrBytes: DEFAULT_LIMITS.maxStderrBytes,
  }),
});

export type PluginConfig = z.infer<typeof pluginConfigSchema>;

export function parsePluginConfig(value: unknown): PluginConfig {
  return pluginConfigSchema.parse(value ?? {});
}

export const instanceConfigJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    runtime: {
      type: "object",
      additionalProperties: false,
      properties: {
        binary: { type: ["string", "null"], title: "Kujo binary override", default: null },
        allowSystemPathFallback: { type: "boolean", title: "Allow system PATH fallback", default: true },
      },
    },
    features: {
      type: "object",
      additionalProperties: false,
      properties: {
        review: { type: "boolean", title: "Review Pack", default: true },
        failureEvidence: { type: "boolean", title: "Failure Evidence", default: true },
        context: { type: "boolean", title: "Context Pack", default: true },
        verification: { type: "boolean", title: "Verification", default: false },
      },
    },
    limits: {
      type: "object",
      additionalProperties: false,
      properties: {
        timeoutMs: { type: "integer", minimum: 1000, maximum: 120000, default: DEFAULT_LIMITS.timeoutMs },
        maxStdoutBytes: { type: "integer", minimum: 1024, maximum: 10000000, default: DEFAULT_LIMITS.maxStdoutBytes },
        maxStderrBytes: { type: "integer", minimum: 1024, maximum: 2000000, default: DEFAULT_LIMITS.maxStderrBytes },
      },
    },
  },
} as const;

