export const DEFAULT_LIMITS = {
  timeoutMs: 27_000,
  maxStdoutBytes: 2_000_000,
  maxStderrBytes: 256_000,
  maxArtifactBytes: 5_000_000,
  maxInputLogBytes: 200_000,
  maxContextFileBytes: 2_000,
} as const;

export const CONTEXT_BUDGETS = {
  minimal: 4_000,
  focused: 16_000,
  broad: 40_000,
} as const;

export const PLUGIN_VERSION = "0.2.0";
export const PAPERCLIP_API_VERSION = 1;
// The expansion is qualified against the official npm release, not a fork.
// Reject older hosts instead of silently accepting missing plugin APIs.
export const MINIMUM_HOST_VERSION = "2026.1012.0";
export const SUPPORTED_HOST_VERSION = MINIMUM_HOST_VERSION;
