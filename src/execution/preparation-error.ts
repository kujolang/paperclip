import { KujoPluginError } from "../runtime/errors.js";

export type SourcePreparationStage = "admission" | "temporary_directory" | "workspace_snapshot" | "runtime" | "inventory" | "copy_inputs" | "select_source" | "freshness" | "preview" | "runtime_digest" | "cleanup";
export type SourcePreparationReason = "unknown" | "fixture_path" | "disabled" | "issue_unavailable" | "workspace_mismatch" | "busy" | "cancelled" | "ambiguous_paths" | "source_missing" | "inputs_changed" | "preview_limit" | "ENOSPC" | "EDQUOT" | "EACCES" | "EPERM" | "ENOENT" | "EIO" | "EMFILE" | "ENFILE" | "EROFS";
const filesystemCodes = new Set(["ENOSPC", "EDQUOT", "EACCES", "EPERM", "ENOENT", "EIO", "EMFILE", "ENFILE", "EROFS"]);

/** Only internal stages and allowlisted codes are persisted. Never serialize
 * exception messages, stacks, paths, causes, or arbitrary error properties. */
export class SourcePreparationError extends Error {
  readonly diagnostic: string;
  constructor(stage: SourcePreparationStage, reason: SourcePreparationReason) {
    const diagnostic = `source_preparation:${stage}:${reason}`;
    super(`${diagnostic}: ${sourcePreparationGuidance(diagnostic)}`);
    this.name = "SourcePreparationError";
    this.diagnostic = diagnostic;
  }
}
export function sourcePreparationFailure(stage: SourcePreparationStage, error: unknown) {
  if (error instanceof KujoPluginError || error instanceof SourcePreparationError) return error;
  const code = error instanceof Error ? Object.getOwnPropertyDescriptor(error, "code")?.value : undefined;
  return new SourcePreparationError(stage, typeof code === "string" && filesystemCodes.has(code) ? code as SourcePreparationReason : "unknown");
}

export function sourcePreparationGuidance(diagnostic: string | null): string | null {
  if (!diagnostic?.startsWith("source_preparation:")) return null;
  const reason = diagnostic.split(":")[2];
  switch (reason) {
    case "fixture_path": return "Fixture mode selects tests/; omit path.";
    case "disabled": return "Kujo run/test is disabled by company settings or capability profile.";
    case "issue_unavailable": return "Execution issue is unavailable in this company.";
    case "workspace_mismatch": return "Issue and workspace must belong to the same project.";
    case "busy": return "Source preparation is busy; wait for current preparations to finish.";
    case "cancelled": return "Source preparation was cancelled.";
    case "ambiguous_paths": return "Rename ambiguous or platform-reserved input paths before preparing again.";
    case "source_missing": return "Select admitted Git-visible Kujo source; fixture mode requires tests/*.kujo files.";
    case "inputs_changed": return "Workspace or settings changed during preparation; refresh and review a new request.";
    case "preview_limit": return "Select a smaller source file or test group for the approval preview.";
    case "ENOSPC": case "EDQUOT": return "Free disk space or increase the storage quota before preparing a new request.";
    case "EACCES": case "EPERM": case "EROFS": return "Check workspace, runtime and temporary-directory access permissions.";
    case "ENOENT": return "Check that the selected source, workspace and runtime still exist.";
    case "EMFILE": case "ENFILE": return "Close unused processes or raise the host file-descriptor limit before preparing again.";
    case "EIO": return "Check host storage health before preparing again.";
    default: return "Preparation failed before native execution. Share this diagnostic code with the operator; review a new request after correcting the cause.";
  }
}
