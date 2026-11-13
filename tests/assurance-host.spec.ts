import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { createTestHarness } from "./helpers/harness.js";
import manifest from "../src/manifest.js";
import { registerAssurance } from "../src/features/assurance/bridge.js";
import { registerAcceptance } from "../src/features/assurance/acceptance.js";
import { listEvidence } from "../src/storage/history.js";
import { safeChildEnv } from "../src/runtime/execute-kujo.js";
const roots:string[]=[],services:Array<ReturnType<typeof registerAssurance>>=[];
afterEach(async()=>{await Promise.all(services.splice(0).map(s=>s.shutdown()));vi.unstubAllEnvs();await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),"kujo-assurance-host-"));roots.push(root);const cwd=join(root,"workspace"),storage=join(root,"storage");await mkdir(cwd);await mkdir(storage,{mode:0o700});vi.stubEnv("PAPERCLIP_PLUGIN_ID",randomUUID());
 execFileSync("git",["init","--quiet",cwd],{env:safeChildEnv()});await mkdir(join(cwd,".muzzle/manifests"),{recursive:true});await mkdir(join(cwd,".muzzle/workflows"),{recursive:true});
 await writeFile(join(cwd,".muzzle/manifests/check.json"),JSON.stringify({schema_version:"muzzle.manifest/v1",name:"check",summary:"Run fixture",runner:"bash",script:"workflows/check.sh",args:[],quiet_by_default:true,safety:{require_git_repo:false,allow_dirty_tree:true,requires_network:false,human_approval_recommended:true}}));
 await writeFile(join(cwd,".muzzle/workflows/check.sh"),'#!/bin/sh\nprintf "retained test log\\n"\n');
 const config={features:{assurance:true},assurance:{muzzle:true},acceptancePolicies:[{projectId:"project",mode:"human-approval",allowWaiver:true,checks:[{kind:"muzzle",suite:"check"}]}]};
 const h=createTestHarness({manifest,config});h.ctx.issues.get=async(id,companyId)=>companyId==="company"?{id,companyId,projectId:"project",assigneeAgentId:"agent",checkoutRunId:"run"} as never:null;
 h.seed({projects:[{id:"project",companyId:"company",visibility:"open"} as never]});h.ctx.projects.getWorkspaceForIssue=async()=>({id:"workspace",projectId:"project",path:cwd} as never);
 h.ctx.localFolders.status=async()=>({configured:true,healthy:true,writable:true,access:"readWrite",realPath:storage} as never);
 type Card=Awaited<ReturnType<PluginContext["issues"]["requestConfirmation"]>>;const cards:Card[]=[];
 h.ctx.issues.requestConfirmation=async(issueId,input,companyId)=>{const card={...input,id:`card-${cards.length}`,issueId,companyId,kind:"request_confirmation",status:"pending",requestedResolverPolicy:"human_only",effectiveResolverPolicy:"human_only"} as Card;cards.push(card);return card;};h.ctx.issues.listInteractions=async()=>cards;
 const service=registerAssurance(h.ctx);services.push(service);registerAcceptance(h.ctx);
 const human={companyId:"company",actor:{type:"user" as const,userId:"board",companyId:"company"}};
 const action=(operation:string,other:object={})=>h.performAction<any>("manage-kujo-assurance",{issueId:"issue",operation,...other},human);
 const accept=(id:string)=>{const c=cards.find(c=>c.id===id)!;c.status="accepted";c.result={version:1,outcome:"accepted"};c.resolvedByUserId="board";c.resolvedAt=new Date().toISOString();};
 const policy=(operation="status",reason?:string)=>h.performAction<any>("kujo-acceptance",{issueId:"issue",operation,...(reason?{reason}:{})},human);
 return {root,cwd,h,service,action,accept,cards,policy};
}
describe.skipIf(!["darwin", "linux"].includes(process.platform))("POSIX assurance execution", () => {
it("executes only exact approved native workflows, retains logs and gates human acceptance against current inputs",async()=>{
 const f=await fixture();expect((await f.policy()).status).toBe("incomplete");
 const request=await f.action("prepare",{selection:{kind:"muzzle",path:"check"},submissionId:"one"});expect(request.state).toBe("pending");
 await expect(f.action("start",{id:request.id})).rejects.toThrow(/human approval/);
 f.accept(request.interactionId);await f.action("start",{id:request.id});await f.service.drainQueued();const result=await f.action("status",{id:request.id});
 expect(result,JSON.stringify(result)).toMatchObject({state:"succeeded",result:{classification:"passed"},history:{status:"retained"}});expect(JSON.stringify(result.result.artifacts)).toContain("retained test log");
 expect((await f.policy()).status).toBe("awaiting-human-review");const review=await f.policy("approve");f.accept(review.interactionId);expect((await f.policy()).status).toBe("passed");
 await writeFile(join(f.cwd,"changed.txt"),"new submission");expect((await f.policy()).status).toBe("incomplete");
 const waive=await f.policy("waive","Controlled fixture waiver");f.accept(waive.interactionId);expect(await f.policy()).toMatchObject({status:"waived",verifiedComplete:false});
 expect((await listEvidence(f.h.ctx,{companyId:"company",entityType:"issue",entityId:"issue"})).some(e=>e.kind==="assurance-result")).toBe(true);
},60000);
it("rejects injected authority, disabled adapters, mismatched principals and stale approved bytes",async()=>{
 const f=await fixture();await expect(f.h.performAction("manage-kujo-assurance",{issueId:"issue",operation:"list"})).rejects.toThrow(/human/);
 await expect(f.action("prepare",{selection:{kind:"muzzle",path:"check"},submissionId:"bad",command:"arbitrary"})).rejects.toThrow();
 await expect(f.action("inspect",{selection:{kind:"workcell",path:"workcell.json"}})).rejects.toThrow(/disabled/);
 const request=await f.action("prepare",{selection:{kind:"muzzle",path:"check"},submissionId:"stale"});f.accept(request.interactionId);
 await writeFile(join(f.cwd,".muzzle/workflows/check.sh"),'#!/bin/sh\nprintf "changed"\n');await f.action("start",{id:request.id});await f.service.drainQueued();expect(await f.action("status",{id:request.id})).toMatchObject({state:"stale",result:null});
 const cancelled=await f.action("prepare",{selection:{kind:"muzzle",path:"check"},submissionId:"cancelled"});await f.action("cancel",{id:cancelled.id});expect((await f.action("status",{id:cancelled.id})).state).toBe("cancelled");
 const foreign=await f.h.executeTool("manage-kujo-assurance",{issueId:"issue",operation:"list"},{companyId:"other",projectId:"project",agentId:"agent",runId:"run"});expect(foreign.error).toBeTruthy();
},60000);
it("does not allow a named manifest to execute a different script than the approval preview",async()=>{
 const f=await fixture();await writeFile(join(f.cwd,".muzzle/manifests/check.json"),JSON.stringify({name:"check",script:"workflows/hidden.sh"}));
 await writeFile(join(f.cwd,".muzzle/workflows/hidden.sh"),'#!/bin/sh\nexit 0\n');
 await expect(f.action("inspect",{selection:{kind:"muzzle",path:"check"}})).rejects.toThrow(/exact reviewed script/);
},60000);
it("rejects acceptance policy references outside the native issue subtree",async()=>{
 const f=await fixture();f.h.ctx.config.get=async()=>({acceptancePolicies:[{projectId:"project",mode:"required",checks:[{kind:"muzzle",suite:"check",issueId:"unrelated"}]}]});
 f.h.ctx.issues.summaries.getOrchestration=async()=>({companyId:"company",issueId:"issue",subtreeIssueIds:[],runs:[]} as never);
 await expect(f.policy()).rejects.toThrow(/native descendants/);
},60000);

it("retains failed Muzzle logs and cancels a running workflow without replay",async()=>{
 const f=await fixture();
 const script=join(f.cwd,'.muzzle/workflows/check.sh');
 await writeFile(script,'#!/bin/sh\nprintf "observed failure log\\n"\nexit 7\n');
 const failed=await f.action('prepare',{selection:{kind:'muzzle',path:'check'},submissionId:'failure'});f.accept(failed.interactionId);
 await f.action('start',{id:failed.id});await f.service.drainQueued();
 const failure=await f.action('status',{id:failed.id});
 await expect(f.action('recover',{id:failed.id})).rejects.toThrow(/no Workcell resources/);
 expect(failure.result.classification).toBe('failed');expect(JSON.stringify(failure.result.artifacts)).toContain('observed failure log');expect(failure.history.status).toBe('retained');
 await writeFile(script,'#!/bin/sh\nprintf "observed running log\\n"\nsleep 9\n');
 const slow=await f.action('prepare',{selection:{kind:'muzzle',path:'check'},submissionId:'running-cancel'});f.accept(slow.interactionId);
 await f.action('start',{id:slow.id});const draining=f.service.drainQueued();
 try {
  await vi.waitFor(async()=>{const entries=await import('node:fs/promises').then(fs=>fs.readdir(join(f.root,'storage'),{recursive:true}));
   const logs=entries.filter(p=>p.endsWith('.log'));let observed=false;
   for(const log of logs){const text=await import('node:fs/promises').then(fs=>fs.readFile(join(f.root,'storage',log),'utf8'));if(text.includes('observed running log'))observed=true;}
   expect(observed).toBe(true);
  },{timeout:20000,interval:100});
  await f.action('cancel',{id:slow.id});
 } finally { await draining; }
 const cancelled=await f.action('status',{id:slow.id});
 expect(cancelled.state).toBe('cancelled');expect(cancelled.result.classification).toBe('incomplete');expect(JSON.stringify(cancelled.result.artifacts)).toContain('observed running log');expect(cancelled.history.status).toBe('retained');
 expect((await f.action('status',{id:failed.id})).result).toEqual(failure.result);
 expect((await f.action('list')).requests.find((r:any)=>r.id===failed.id).approvedBy).toBe('board');
},90000);

});

it("rejects unsupported platforms before reading config or preparing execution", async () => {
 const descriptor = Object.getOwnPropertyDescriptor(process, "platform")!;
 const h = createTestHarness({ manifest });
 const configRead = vi.spyOn(h.ctx.config, "get");
 const { createAssuranceService } = await import("../src/features/assurance/service.js");
 const service = createAssuranceService(h.ctx);
 try {
  Object.defineProperty(process, "platform", { ...descriptor, value: "win32" });
  await expect(service.inspect({ companyId: "company", issueId: "issue" }, { kind: "muzzle", path: "check" })).rejects.toThrow("requires macOS or Linux");
  expect(configRead).not.toHaveBeenCalled();
 } finally {
  Object.defineProperty(process, "platform", descriptor);
  configRead.mockRestore();
  await service.shutdown();
 }
});
