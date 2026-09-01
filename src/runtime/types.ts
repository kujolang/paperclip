export type RuntimeSource = "configured" | "bundled" | "path";

export type ResolvedRuntime = {
  executable: string;
  runtimeVersion: string;
  source: RuntimeSource;
  platform: NodeJS.Platform;
  arch: string;
};

export type ExecuteKujoInput = {
  executable: string;
  cwd: string;
  args: string[];
  timeoutMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  env?: Record<string, string>;
};

export type ExecuteKujoResult = {
  executable: string;
  runtimeVersion: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
};

