import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { artifacts, localTarget, validateLensFlow, assuranceSelection } from "../src/features/assurance/native.js";
import { nativeVerdict } from "../src/features/assurance/verdict.js";
import { importWatchdog } from "../src/features/watchdog/import.js";
import { executionVerdict } from "../src/features/assurance/acceptance.js";
import { parsePluginConfig } from "../src/config/schema.js";
import { executionPlanSchema, type ExecutionRecord } from "../src/execution/contracts.js";
const host={companyId:"company",projectId:"project",issueId:"issue",parentIssueId:null,agentId:"agent",runId:"run",attribution:"host-agent-importer" as const};
describe("Assurance boundaries",()=>{
 it("keeps every integration opt-in and forbids remote Docker endpoints",()=>{
  expect(parsePluginConfig({}).assurance).toEqual({lens:false,muzzle:false,workcell:false,packwrite:false,dockerHost:null});
  expect(()=>parsePluginConfig({assurance:{dockerHost:"tcp://remote:2375"}})).toThrow();
 });
 it("restricts browser targets and flow navigation without authentication or destructive opt-ins",()=>{
  for(const target of ["https://example.com","http://127.0.0.1:3000/?token=secret","file:///etc/passwd","http://user:secret@localhost"] )expect(()=>localTarget(target)).toThrow();
  const flow={name:"Search",url:"http://127.0.0.1:3000/",viewports:["desktop"],timeout_seconds:5,allow_external:false,steps:[{visit:"http://127.0.0.1:3000/"},{type:{selector:"input",value:"fixture"}},{assert_text:"fixture"}]};
  expect(validateLensFlow(flow,flow.url).steps).toHaveLength(3);
  for(const change of [{allow_external:true},{auth_file:"credentials.json"},{steps:[{visit:"http://localhost:4000"}]},{steps:[{type:{selector:"#password",value:"secret",secret:true}}]},{steps:[{click:{selector:"button",safe:false}}]}])expect(()=>validateLensFlow({...flow,...change},flow.url)).toThrow();
 });
 it("rejects traversals and cannot promote process completion or planning into acceptance",()=>{
  for(const path of ["../workcell.json","/tmp/workcell.json",".git/config"])expect(()=>assuranceSelection.parse({kind:"workcell",path})).toThrow();
  for(const kind of ["lens","workcell","muzzle","packwrite"] as const){expect(nativeVerdict(kind,1,"{}",[])).toBe("failed");expect(nativeVerdict(kind,0,"{}",[])).toBe("incomplete");}
  expect(nativeVerdict("packwrite",0,JSON.stringify({ok:true,errors:[],phase_count:6}),[])).toBe("plan-valid");
  expect(nativeVerdict("muzzle",0,JSON.stringify({schema_version:"muzzle.run/v1",status:"success",exit_code:0,timed_out:false,cancelled:false,log_path:"logs/a"}),[])).toBe("incomplete");
 });
 it("retains bounded text, redacts secrets and refuses symlinks and oversized artifacts",async()=>{
  const root=await mkdtemp(join(tmpdir(),"kujo-artifact-test-"));try{
   await writeFile(join(root,"log.txt"),"Bearer abcdefghijklmnop");
   const found=await artifacts(root);expect(found[0]?.content).toBe("[REDACTED]");expect(found[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
   await symlink(join(root,"log.txt"),join(root,"link"));await expect(artifacts(root)).rejects.toThrow(/symlink/);await rm(join(root,"link"));
   await writeFile(join(root,"large"),"x".repeat(1000001));await expect(artifacts(root)).rejects.toThrow(/retention/);
  }finally{await rm(root,{recursive:true,force:true});}
 });
 it("never trusts legacy, stale, missing, imported, failed or unapproved outcomes",()=>{
  const current={head:"abc",fingerprint:"a".repeat(64)};
  const record={state:"succeeded",approvedBy:"reviewer",request:{plan:{operation:"eval.run",sourceSnapshot:current}},result:{classification:"passed"}} as unknown as ExecutionRecord;
  expect(executionVerdict(record,current)).toBe("passed");expect(executionVerdict(undefined,current)).toBe("missing");
  expect(executionVerdict({...record,approvedBy:null},current)).toBe("incomplete");
  expect(executionVerdict({...record,result:{classification:"passed",executionObserved:false}},current)).toBe("incomplete");
  expect(executionVerdict(record,{...current,head:"changed"})).toBe("stale");
  expect(executionVerdict({...record,state:"failed"},current)).toBe("failed");
 });
});
describe("Watchdog metadata admission",()=>{
 const trace={schema_version:"kujo.telemetry.v1",source_app:"watchdog",trace_id:"trace",session_id:"session",trace:{trace_id:"trace",name:"request",status:"ok",started_at_ms:1,input_tokens:0}};
 it("keeps unknown usage missing, binds the importer and discards arbitrary content",()=>{
  const result=importWatchdog(JSON.stringify({...trace,host:{agentId:"forged"},prompt:"private",trace:{...trace.trace,attributes:{authorization:"secret"},response:"private"}}),host);
  expect(result.host).toEqual(host);expect(result.record.trace?.input_tokens).toBe(0);expect(result.record.trace?.output_tokens).toBeUndefined();expect(result.classification).toBe("unverified");expect(JSON.stringify(result)).not.toMatch(/forged|private|authorization|secret/);
 });
 it("rejects incompatible, mismatched, reversed, oversized and unsafe numeric telemetry",()=>{
  for(const value of [{},{...trace,schema_version:"other"},{...trace,trace:{...trace.trace,trace_id:"wrong"}},{...trace,trace:{...trace.trace,ended_at_ms:0}},{...trace,trace:{...trace.trace,input_tokens:Number.MAX_SAFE_INTEGER+1}}])expect(()=>importWatchdog(JSON.stringify(value),host)).toThrow();
  expect(()=>importWatchdog(" ".repeat(65537),host)).toThrow();
 });
});
it("does not promote Lens informational skipped assertions into verified checks",()=>{
 const report={status:"PASS",exit_code:0,checks:[{id:"spec",status:"pass",findings:[{title:"Selector input[type=search] skipped: not supported"}]}]};
 const artifact={path:"lens-report.json",bytes:1,sha256:"a".repeat(64),mediaType:"text/plain",encoding:"utf8" as const,content:JSON.stringify(report)};
 const png={...artifact,path:"screenshots/desktop.png",mediaType:"image/png"};
 expect(nativeVerdict("lens",0,JSON.stringify({status:"PASS",exit_code:0,findings:{critical:0,error:0}}),[artifact,png])).toBe("incomplete");
 const flow={schema_version:"1",tool:"lens",status:"PASS",flow:{enabled:true,total_steps:1,passed_steps:1,failed_steps:0,blocked_steps:0,skipped_steps:0,errored_steps:0},steps:[{status:"pass"}]};
 expect(nativeVerdict("lens",0,"",[{...artifact,content:JSON.stringify(flow)},png])).toBe("passed");
 expect(nativeVerdict("lens",0,"",[{...artifact,content:JSON.stringify({...flow,flow:{...flow.flow,total_steps:2}})},png])).toBe("incomplete");
});
