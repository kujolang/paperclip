import type { PluginContext } from "@paperclipai/plugin-sdk";
import { z } from "zod";
import { requireReadableEntity } from "../../paperclip/workspace.js";
import { listEvidence } from "../../storage/history.js";
export function registerDelegation(ctx: PluginContext) {
  ctx.actions.register("kujo-delegation",async(params,action)=>{
    if(!action.companyId || action.actor?.type!=="user" || !action.actor.userId || action.actor.companyId!==action.companyId)throw new Error("Authenticated human company context required");
    const {issueId}=z.object({issueId:z.string().min(1).max(200)}).parse(params);
    await requireReadableEntity(ctx,{companyId:action.companyId,entityType:"issue",entityId:issueId});
    const summary=await ctx.issues.summaries.getOrchestration({issueId,companyId:action.companyId,includeSubtree:true});
    if(summary.companyId!==action.companyId || summary.issueId!==issueId)throw new Error("Host orchestration scope mismatch");
    const ids=[...new Set([issueId,...summary.subtreeIssueIds])].slice(0,50), issues=[];
    for(const id of ids){
      await requireReadableEntity(ctx,{companyId:action.companyId,entityType:"issue",entityId:id});
      const issue=await ctx.issues.get(id,action.companyId);
      if(!issue || issue.companyId!==action.companyId)continue;
      issues.push({id:issue.id,title:issue.title,status:issue.status,parentId:issue.parentId,assigneeAgentId:issue.assigneeAgentId, evidence:await listEvidence(ctx,{companyId:action.companyId,entityType:"issue",entityId:id})});
    }
    return {issues,runs:summary.runs.filter(run=>ids.includes(run.issueId??"")).map(run=>({id:run.id,issueId:run.issueId,agentId:run.agentId,status:run.status})),truncated:summary.subtreeIssueIds.length>50,notice:"Native Paperclip issue relationships and run attribution. Assignment and issue status do not establish verification. Evidence stays owned by its originating issue; no hierarchy or run history is duplicated."};
  });
}
