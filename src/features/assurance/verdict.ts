import { z } from "zod";
import type { Artifact, Selection } from "./native.js";
/** Only called for an observed invocation of the digest-pinned native producer. */
export function nativeVerdict(kind: Selection["kind"], exitCode: number, stdout: string, artifacts: Artifact[]) {
  if (exitCode !== 0) return "failed";
  if (kind === "lens") {
    const artifact = artifacts.find(a => a.path === "lens-report.json");
    if (artifact) try {
      const report = JSON.parse(artifact.content);
      if (report.flow?.enabled) {
        const flow = z.object({ schema_version: z.literal("1"), tool: z.literal("lens"), status: z.literal("PASS"), flow: z.object({ enabled: z.literal(true), total_steps: z.number().int().positive(), passed_steps: z.number().int().positive(), failed_steps: z.literal(0), blocked_steps: z.literal(0), skipped_steps: z.literal(0), errored_steps: z.literal(0) }), steps: z.array(z.object({ status: z.literal("pass") })).min(1) }).safeParse(report);
        return flow.success && flow.data.flow.total_steps === flow.data.steps.length && flow.data.flow.passed_steps === flow.data.steps.length && artifacts.some(a => a.mediaType === "image/png") ? "passed" : "incomplete";
      }
    } catch { return "incomplete"; }
  }
  let value: unknown;
  try { value = JSON.parse(stdout); } catch { return "incomplete"; }
  if (kind === "packwrite") {
    const result=z.object({ok:z.boolean(),errors:z.array(z.string()),phase_count:z.number().int().min(0)}).safeParse(value);
    return result.success ? result.data.ok && !result.data.errors.length ? "plan-valid" : "failed" : "incomplete";
  }
  if (kind === "muzzle") {
    const result=z.object({schema_version:z.literal("muzzle.run/v1"),status:z.literal("success"),exit_code:z.literal(0),timed_out:z.literal(false),cancelled:z.literal(false),log_path:z.string()}).safeParse(value);
    const contained=artifacts.filter(a=>a.path.startsWith("workcell/") && a.path.endsWith("/receipt.json"));
    if (contained.length) {
      try { const receipt=JSON.parse(contained[0]!.content); if(receipt.exit_code!==0 || receipt.final_status!=="completed" || receipt.cleanup_status!=="complete")return "incomplete"; } catch {return "incomplete";}
    }
    return result.success && artifacts.some(a=>a.path.startsWith("logs/")) ? "passed" : "incomplete";
  }
  if (kind === "workcell") {
    const result=z.object({ok:z.literal(true),exit_code:z.literal(0),timed_out:z.literal(false),cancelled:z.literal(false),cleanup_status:z.literal("complete"),receipt:z.object({schema_version:z.literal("workcell-receipt/v1")})}).safeParse(value);
    return result.success && artifacts.some(a=>a.path.endsWith("/receipt.json")) && artifacts.some(a=>a.path.endsWith("/manifest.json")) ? "passed" : "incomplete";
  }
  const summary=z.object({status:z.literal("PASS"),exit_code:z.literal(0),findings:z.object({critical:z.literal(0),error:z.literal(0)})}).safeParse(value);
  const report=artifacts.find(a=>a.path==="lens-report.json");
  if(!summary.success || !report || !artifacts.some(a=>a.mediaType==="image/png"))return "incomplete";
  try {
    const parsed=z.object({status:z.literal("PASS"),exit_code:z.literal(0),checks:z.array(z.object({id:z.string(),status:z.string(),findings:z.array(z.object({title:z.string()})).default([])})).min(1)}).parse(JSON.parse(report.content));
    if (parsed.checks.some(c=>c.status==="skip" || c.status==="skipped" || c.findings.some(f=>/skipped|not supported|not checked/i.test(f.title)))) return "incomplete";
    return parsed.checks.some(c=>c.status==="fail" || c.status==="error")?"failed":"passed";
  }catch{return "incomplete";}
}
