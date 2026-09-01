export const KUJO_ERROR_CODES = [
  "KUJO_RUNTIME_NOT_FOUND",
  "KUJO_RUNTIME_INCOMPATIBLE",
  "KUJO_RUNTIME_EXEC_FAILED",
  "KUJO_COMPONENT_NOT_FOUND",
  "KUJO_COMPONENT_INTEGRITY_FAILED",
  "KUJO_COMPONENT_SCHEMA_INVALID",
  "KUJO_WORKSPACE_NOT_FOUND",
  "KUJO_WORKSPACE_OUTSIDE_ALLOWED_ROOT",
  "KUJO_EXEC_TIMEOUT",
  "KUJO_OUTPUT_LIMIT",
  "KUJO_INVALID_CONFIG",
] as const;

export type KujoErrorCode = (typeof KUJO_ERROR_CODES)[number];

export class KujoPluginError extends Error {
  readonly code: KujoErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: KujoErrorCode, message: string, details?: Record<string, unknown>) {
    super(`${code}: ${message}`);
    this.name = "KujoPluginError";
    this.code = code;
    this.details = details;
  }
}

export function normalizeError(error: unknown): KujoPluginError {
  if (error instanceof KujoPluginError) return error;
  if (error instanceof Error && error.name === "ZodError") {
    return new KujoPluginError("KUJO_INVALID_CONFIG", error.message);
  }
  return new KujoPluginError(
    "KUJO_RUNTIME_EXEC_FAILED",
    error instanceof Error ? error.message : "Unknown Kujo execution failure",
  );
}
