import { constants } from "node:fs";
import { lstat, mkdir, open, realpath } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { evidenceDigest } from "../storage/history.js";

const identity = z.string().min(1).max(200);
const bindingSchema = z.object({
  installationId: identity, companyId: identity, issueId: identity, executionId: identity,
  requestDigest: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type WorkflowStorageBinding = z.infer<typeof bindingSchema>;
type Failure = "unsupported_platform" | "invalid_root" | "unsafe_directory" | "root_changed" | "already_reserved" | "missing_state" | "invalid_binding" | "storage_unavailable";
export class WorkflowStorageError extends Error {
  constructor(readonly code: Failure) { super(`Workflow storage: ${code}`); }
}
const fail = (code: Failure): never => { throw new WorkflowStorageError(code); };
const missing = (error: unknown) => error instanceof Error && "code" in error && error.code === "ENOENT";
const exists = (error: unknown) => error instanceof Error && "code" in error && error.code === "EEXIST";

async function privateDirectory(path: string) {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid!() || (stat.mode & 0o777) !== 0o700) fail("unsafe_directory");
  return stat;
}
async function syncDirectory(path: string) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { await handle.sync(); } finally { await handle.close(); }
}
async function sanitized<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); }
  catch (error) { if (error instanceof WorkflowStorageError) throw error; throw new WorkflowStorageError("storage_unavailable"); }
}

/** Internal POSIX runner primitive. Root is an existing operator-owned private
 * directory, never an agent/workspace path. It is not an authorization check or
 * a sandbox against another process with the same OS identity. */
export async function openWorkflowStorage(rawRoot: string) {
  if (process.platform !== "darwin" && process.platform !== "linux") fail("unsupported_platform");
  if (!isAbsolute(rawRoot) || rawRoot.includes("\0")) fail("invalid_root");
  return sanitized(async () => {
    const root = resolve(rawRoot);
    const original = await privateDirectory(root);
    const canonical = await realpath(root);
    const checkRoot = async () => {
      const current = await privateDirectory(root);
      if (current.dev !== original.dev || current.ino !== original.ino || await realpath(root) !== canonical) fail("root_changed");
    };
    const paths = (raw: WorkflowStorageBinding) => {
      const parsed = bindingSchema.safeParse(raw);
      if (!parsed.success) fail("invalid_binding");
      const binding = parsed.data!;
      const installation = join(root, evidenceDigest({ installationId: binding.installationId }));
      // Changed plan bytes must conflict at the same execution address.
      const reservation = join(installation, evidenceDigest({ companyId: binding.companyId, issueId: binding.issueId, executionId: binding.executionId }));
      const marker = JSON.stringify({ schemaVersion: 1, bindingDigest: evidenceDigest(binding) });
      return { installation, reservation, marker, nativeRoot: join(reservation, "native") };
    };
    return {
      /** Reserve once, before any native effect. Failure after mkdir deliberately
       * leaves an occupied reservation; a retry must not silently reinitialize it. */
      async reserve(binding: WorkflowStorageBinding) {
        return sanitized(async () => {
          const p = paths(binding);
          await checkRoot();
          try { await mkdir(p.installation, { mode: 0o700 }); }
          catch (error) { if (!exists(error)) throw error; }
          await privateDirectory(p.installation);
          await syncDirectory(root);
          try { await mkdir(p.reservation, { mode: 0o700 }); }
          catch (error) { if (exists(error)) fail("already_reserved"); throw error; }
          await privateDirectory(p.reservation);
          await syncDirectory(p.installation);
          await mkdir(p.nativeRoot, { mode: 0o700 });
          const handle = await open(join(p.reservation, "owner.json"), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
          try { await handle.writeFile(p.marker); await handle.sync(); }
          finally { await handle.close(); }
          await syncDirectory(p.reservation);
          await checkRoot();
          return { nativeRoot: p.nativeRoot };
        });
      },
      /** Recover storage only; this never means it is safe to resume/replay a run.
       * Canonical runner state and the host ledger still decide that separately. */
      async recover(binding: WorkflowStorageBinding) {
        return sanitized(async () => {
          const p = paths(binding);
          await checkRoot();
          try {
            await privateDirectory(p.installation);
            await privateDirectory(p.reservation);
            await privateDirectory(p.nativeRoot);
            const handle = await open(join(p.reservation, "owner.json"), constants.O_RDONLY | constants.O_NOFOLLOW);
            try {
              const stat = await handle.stat();
              if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid!() || (stat.mode & 0o777) !== 0o600 || stat.size > 256) fail("invalid_binding");
              // Fixed-size read also bounds a file growing after stat.
              const bytes = Buffer.alloc(257);
              const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
              if (bytes.subarray(0, bytesRead).toString("utf8") !== p.marker) fail("invalid_binding");
            } finally { await handle.close(); }
          } catch (error) { if (missing(error)) fail("missing_state"); throw error; }
          await checkRoot();
          return { nativeRoot: p.nativeRoot };
        });
      },
    };
  });
}
