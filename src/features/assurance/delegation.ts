import type { PluginContext } from "@paperclipai/plugin-sdk";
import { z } from "zod";
import { requireReadableEntity } from "../../paperclip/workspace.js";
import { evidenceDigest, listEvidence } from "../../storage/history.js";
export function registerDelegation(ctx: PluginContext) {
  ctx.actions.register("kujo-delegation",async(params,action)=>{
    if(!action.companyId || action.actor?.type!=="user" || !action.actor.userId || action.actor.companyId!==action.companyId)throw new Error("Authenticated human company context required");
    const {issueId,cursor}=z.object({issueId:z.string().min(1).max(200),cursor:z.object({offset:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),digest:z.string().regex(/^[a-f0-9]{64}$/)}).strict().optional()}).parse(params);
    await requireReadableEntity(ctx,{companyId:action.companyId,entityType:"issue",entityId:issueId});
    const summary=await ctx.issues.summaries.getOrchestration({issueId,companyId:action.companyId,includeSubtree:true});
    if(summary.companyId!==action.companyId || summary.issueId!==issueId)throw new Error("Host orchestration scope mismatch");
    const allIds=[issueId,...[...new Set(summary.subtreeIssueIds)].filter(id=>id!==issueId).sort()];
    const digest=evidenceDigest({companyId:action.companyId,issueId,ids:allIds}), offset=cursor?.offset??0;
    if(cursor && (cursor.digest!==digest || offset>=allIds.length || offset%50!==0))throw new Error("Delegated assignments changed or cursor is invalid; inspect delegated evidence again from the first page");
    const ids=allIds.slice(offset,offset+50), issues=[];
    for(const id of ids){
      const issue=await requireReadableEntity(ctx,{companyId:action.companyId,entityType:"issue",entityId:id}) as NonNullable<Awaited<ReturnType<PluginContext["issues"]["get"]>>>;
      issues.push({id:issue.id,title:issue.title,status:issue.status,parentId:issue.parentId,assigneeAgentId:issue.assigneeAgentId, evidence:await listEvidence(ctx,{companyId:action.companyId,entityType:"issue",entityId:id})});
    }
    return {issues,runs:summary.runs.filter(run=>ids.includes(run.issueId??"")).map(run=>({id:run.id,issueId:run.issueId,agentId:run.agentId,status:run.status})),truncated:offset+ids.length<allIds.length,page:{offset,total:allIds.length},nextCursor:offset+ids.length<allIds.length?{offset:offset+ids.length,digest}:null,notice:"Native Paperclip issue relationships and run attribution. Assignment and issue status do not establish verification. Evidence stays owned by its originating issue; no hierarchy or run history is duplicated."};
  });
}
