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

export const PLUGIN_VERSION = "0.1.5";
export const PAPERCLIP_API_VERSION = 1;
// Paperclip 2026.831.1 currently reports 0.0.0 to its plugin loader. Keep the
// manifest gate neutral until the host supplies its real version; the supported
// host contract remains enforced by the exact SDK pin and compatibility matrix.
export const MINIMUM_HOST_VERSION = "0.0.0";
export const SUPPORTED_HOST_VERSION = "2026.824.1";
