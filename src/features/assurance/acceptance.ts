import type { PluginContext } from "@paperclipai/plugin-sdk";
import { z } from "zod";
import { parsePluginConfig } from "../../config/schema.js";
import { executionLedger } from "../../execution/ledger.js";
import type { ExecutionRecord, ExecutionScope } from "../../execution/contracts.js";
import { captureWorkspaceSnapshot, isSnapshotCurrent } from "../../paperclip/git.js";
import { resolveWorkspace, requireReadableEntity } from "../../paperclip/workspace.js";
import { appendEvidence, evidenceDigest, latestEvidence } from "../../storage/history.js";
import { shipcheckReportSchema } from "../shipcheck/schema.js";

export function executionVerdict(record: ExecutionRecord | undefined, current: {head:string;fingerprint:string}) {
  if (!record) return "missing";
  if (!record.request.plan.sourceSnapshot || evidenceDigest(record.request.plan.sourceSnapshot) !== evidenceDigest(current)) return "stale";
  if (["preparing", "pending", "running", "cancel_requested"].includes(record.state)) return "pending";
  if (record.state !== "succeeded") return record.state === "failed" ? "failed" : "incomplete";
  if (!record.approvedBy || !record.result || record.result.executionObserved === false) return "incomplete";
  if (record.request.plan.operation === "eval.run") return record.result.classification === "passed" ? "passed" : record.result.classification === "failed" ? "failed" : "incomplete";
  return record.result.classification === "passed" ? "passed" : record.result.classification === "failed" ? "failed" : "incomplete";
}
export async function acceptanceStatus(ctx: PluginContext, scope: ExecutionScope) {
  const target = { companyId: scope.companyId, entityType: "issue" as const, entityId: scope.issueId };
  await requireReadableEntity(ctx,target);
  const issue = await ctx.issues.get(scope.issueId, scope.companyId);
  const config = parsePluginConfig(await ctx.config.get(scope.companyId));
  const policies = config.acceptancePolicies.filter(p => p.projectId === issue?.projectId && (!p.issueId || p.issueId === scope.issueId));
  if (policies.length !== 1) return { status: "unavailable", verifiedComplete: false, notice: policies.length ? "Conflicting project policies" : "No acceptance policy configured", checks: [] };
  const policy = policies[0]!;
  const workspace = await resolveWorkspace(ctx,target), snapshot = await captureWorkspaceSnapshot(workspace.path);
  const current = { head:snapshot.head,fingerprint:snapshot.fingerprint }, records = await executionLedger(ctx).list(scope);
  const checks = [];
  const delegated = policy.checks.some(check => check.issueId && check.issueId !== scope.issueId)
    ? await ctx.issues.summaries.getOrchestration({ ...scope, includeSubtree: true }) : null;
  if (delegated && (delegated.companyId !== scope.companyId || delegated.issueId !== scope.issueId)) throw new Error("Delegated acceptance scope mismatch");
  for (const check of policy.checks) {
    const evidenceIssueId = check.issueId ?? scope.issueId;
    if (evidenceIssueId !== scope.issueId && !delegated?.subtreeIssueIds.includes(evidenceIssueId)) throw new Error("Acceptance evidence must belong to this issue or its native descendants");
    const evidenceTarget = { ...target, entityId: evidenceIssueId };
    await requireReadableEntity(ctx, evidenceTarget);
    const relatedIssue = await ctx.issues.get(evidenceIssueId, scope.companyId);
    if (relatedIssue?.projectId !== issue!.projectId) throw new Error("Delegated acceptance requires the same project");
    const checkRecords = evidenceIssueId === scope.issueId ? records : await executionLedger(ctx).list({ ...scope, issueId: evidenceIssueId });
    if (check.kind === "shipcheck") {
      const evidence = await latestEvidence(ctx,evidenceTarget,"shipcheck-latest"), parsed=shipcheckReportSchema.safeParse(evidence?.payload);
      const status = !evidence ? "missing" : !parsed.success || parsed.data.stale ? "incomplete" : !await isSnapshotCurrent(workspace.path, parsed.data.snapshot) ? "stale" : parsed.data.status === "passed" ? "passed" : parsed.data.status === "failed" ? "failed" : "incomplete";
      checks.push({ ...check,status,evidenceId:evidence?.receipt.id ?? null });continue;
    }
    const candidates = checkRecords.filter(r => r.request.plan.workspaceId === workspace.id).filter(r => check.kind === "eval" ? r.request.plan.operation === "eval.run" && r.request.plan.suite === check.suite : r.request.plan.assurance?.kind === check.kind && r.request.plan.assurance.path === check.suite).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    const record = candidates[0]; checks.push({ ...check,status:executionVerdict(record,current),executionId:record?.id ?? null, requestDigest:record?.requestDigest ?? null });
  }
  const binding = { schemaVersion:1,scope,projectId:issue!.projectId,workspaceId:workspace.id,current,policy,checks }, digest=evidenceDigest(binding);
  const cards = await ctx.issues.listInteractions(scope.issueId,scope.companyId);
  const decisions = cards.filter(card => card.kind === "request_confirmation" && card.companyId === scope.companyId && card.issueId === scope.issueId && card.payload.target?.type === "custom" && card.payload.target.key === "kujo-acceptance" && card.payload.target.revisionId === digest && card.requestedResolverPolicy === "human_only" && card.effectiveResolverPolicy === "human_only" && card.continuationPolicy === "none" && !card.addresseeAgentId && card.status === "accepted" && card.result?.outcome === "accepted" && card.resolvedByUserId && !card.resolvedByAgentId && !card.resolvedByRunId && !card.acceptanceBlocker && Number.isFinite(new Date(card.resolvedAt??"").getTime()) && new Date(card.resolvedAt??"").getTime() <= Date.now());
  const waived=policy.allowWaiver && decisions.some(d=>d.idempotencyKey === `kujo.acceptance.waive:${digest}`), approved=decisions.some(d=>d.idempotencyKey === `kujo.acceptance.approve:${digest}`);
  const allPassed=checks.every(c=>c.status==="passed");
  const status=waived?"waived":checks.some(c=>c.status==="failed")?"failed":!allPassed?checks.some(c=>c.status==="pending")?"pending":"incomplete":policy.mode==="human-approval"&&!approved?"awaiting-human-review":"passed";
  const result={id:`acceptance_${evidenceDigest({digest,status,decisions:decisions.map(d=>d.id)})}`,schemaVersion:1,sourceKind:"observed",classification:status,status,verifiedComplete:status==="passed",policyMode:policy.mode,policyDigest:evidenceDigest(policy),digest,checks,sourceSnapshot:current,decisions:decisions.map(d=>({id:d.id,reviewer:d.resolvedByUserId,at:d.resolvedAt})),notice:"Separate verification metadata; Paperclip issue status is never overridden. Waived checks are not passed checks. Native ShipCheck verifies readiness metadata, not execution of tests. Imported claims never satisfy this policy."};
  await appendEvidence(ctx,target,"acceptance-result",result);
  return result;
}
export function registerAcceptance(ctx: PluginContext) {
  // Core events carry host identity. Observe policy metadata only; never infer
  // authorization to spawn repository code from an issue status change.
  ctx.events.on("issue.updated", async event => {
    if (!event.companyId || event.entityType !== "issue" || !event.entityId) return;
    const issue = await ctx.issues.get(event.entityId, event.companyId);
    if (!issue || !["done", "in_review"].includes(issue.status)) return;
    const config = parsePluginConfig(await ctx.config.get(event.companyId));
    if (!config.acceptancePolicies.some(p => p.projectId === issue.projectId && (!p.issueId || p.issueId === event.entityId) && p.observeHandoffs)) return;
    await acceptanceStatus(ctx, { companyId: event.companyId, issueId: event.entityId });
  });
  ctx.actions.register("kujo-acceptance",async(params,action)=>{
    if (!action.companyId || action.actor?.type!=="user" || !action.actor.userId || action.actor.companyId!==action.companyId) throw new Error("Authenticated human company context required");
    const value=z.object({issueId:z.string().min(1),operation:z.enum(["status","approve","waive"]),reason:z.string().min(1).max(1000).optional()}).parse(params), scope={companyId:action.companyId,issueId:value.issueId};
    const status=await acceptanceStatus(ctx,scope);
    if(value.operation==="status")return status;
    if(!("digest" in status))throw new Error("Configure an acceptance policy first");
    if(value.operation==="approve" && status.checks.some(c=>c.status!=="passed"))throw new Error("Required checks must pass before evidence approval");
    const issue=await ctx.issues.get(scope.issueId,scope.companyId),config=parsePluginConfig(await ctx.config.get(scope.companyId));
    if(value.operation==="waive" && (!value.reason || !config.acceptancePolicies.find(p=>p.projectId===issue?.projectId && (!p.issueId || p.issueId===scope.issueId))?.allowWaiver))throw new Error("Waiver requires an enabled project policy and a reason");
    const card=await ctx.issues.requestConfirmation(scope.issueId,{idempotencyKey:`kujo.acceptance.${value.operation}:${status.digest}`,title:value.operation==="waive"?"Waive Kujo verification":"Review Kujo verification evidence",continuationPolicy:"none",resolverPolicy:"human_only",payload:{version:1,prompt:value.operation==="waive"?"Waive these checks for this exact submission?":"Accept this exact verification evidence?",acceptLabel:"Confirm decision",rejectLabel:"Reject decision",allowDeclineReason:true,supersedeOnUserComment:true,target:{type:"custom",key:"kujo-acceptance",revisionId:status.digest,label:"Kujo verification evidence"},detailsMarkdown:JSON.stringify({status,reason:value.reason??null}).replaceAll("`","\\u0060")}}, scope.companyId);
    return { ...status, interactionId:card.id, notice:"Resolve the human-only issue decision card, then refresh verification. This request is not approval." };
  });
}
