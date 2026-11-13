import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { join } from 'node:path';
export async function qualifyAssurance({call,companyId,projectId,issueId,root,node,base,cookie,checks,json,stop,start,waitUntil}) {
 const workspace=join(root,'workspace'),folder=join(root,'assurance-state');await mkdir(folder,{mode:0o700});
 const dockerHost=process.env.KUJO_TEST_DOCKER_HOST;if(!dockerHost)throw new Error('Set an explicit local Docker Unix endpoint');
 const image=execFileSync('docker',['--host',dockerHost,'image','inspect',process.env.KUJO_TEST_IMAGE??'kujolang/workcell-base:local','--format','{{.Id}}'],{encoding:'utf8'}).trim();
 const route='/plugins/kujolang.paperclip/bridge/action';
 const action=async(key,params,options={})=>(await call(route,{method:'POST',body:{companyId,key,params:key==='import-verification'?params:{issueId,...params}},...options})).data.data;
 const config={features:{assurance:true,verification:true,execution:true},assurance:{lens:true,muzzle:true,workcell:true,packwrite:true,dockerHost},acceptancePolicies:[{projectId,mode:'required',allowWaiver:true,checks:[{kind:'lens',suite:'browser.json'}]}]};
 await call('/plugins/kujolang.paperclip/config',{method:'POST',body:{companyId,configJson:config}});
 await call(`/plugins/kujolang.paperclip/companies/${companyId}/local-folders/workflow-state`,{method:'PUT',body:{path:folder,access:'readWrite'}});
 await mkdir(join(workspace,'.muzzle/manifests'),{recursive:true});await mkdir(join(workspace,'.muzzle/workflows'),{recursive:true});
 await writeFile(join(workspace,'.gitignore'),'.muzzle/logs/\n.muzzle/reports/\n.muzzle/state/\n');
 await cp(new URL('../../examples/assurance/agent',import.meta.url),join(workspace,'agent'),{recursive:true});
 await writeFile(join(workspace,'.muzzle/manifests/check.json'),JSON.stringify({schema_version:'muzzle.manifest/v1',name:'check',summary:'Run fixture assertions',runner:'bash',script:'workflows/check.sh',args:[],quiet_by_default:true,safety:{require_git_repo:false,allow_dirty_tree:true,requires_network:false,human_approval_recommended:true}}));
 await writeFile(join(workspace,'.muzzle/workflows/check.sh'),'#!/bin/sh\nprintf "observed workflow check\\n"\n');
 await writeFile(join(workspace,'workcell.json'),JSON.stringify({version:1,name:'paperclip-acceptance',runtime:{backend:'docker',image},command:['sh','-c','printf "container verification\\n"; printf "observed proof\\n" > proof.txt'],workspace:{strategy:'git-worktree',mount_path:'/workspace'},network:{mode:'none'},resources:{cpus:1,memory:'256m',pids:64,timeout_ms:10000},filesystem:{read_only_root:true,tmpfs:['/tmp']},environment:{allow:[],set:{}},secrets:[],artifacts:{export:['proof.txt']},cleanup:{keep_failed:false},receipt:{path:'.workcell/runs'}}));
 await writeFile(join(workspace,'browser.json'),JSON.stringify({title:{contains:'Task list'},selectors:{exists:['main','input[type=search]']},text:{contains:['Tasks']}}));
 let broken=true;
 const server=createServer(async(req,res)=>{res.setHeader('Content-Type','text/html');res.end(await readFile(join(workspace,'index.html'),'utf8').catch(()=>`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Task list</title></head><body><main><h1>Tasks</h1>${broken?'':'<label>Search<input type="search" oninput="document.querySelectorAll(\'li\').forEach(x=>x.hidden=!x.textContent.includes(this.value))"></label>'}<ul><li>Implement search</li><li>Verify results</li></ul></main></body></html>`));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const target=`http://127.0.0.1:${server.address().port}/`,records=[];
 await writeFile(join(workspace,'browser.json'),JSON.stringify({name:'Search interaction',url:target,viewports:['desktop'],timeout_seconds:3,allow_external:false,allow_destructive:false,steps:[{visit:target},{assert_selector:'input[type=search]'},{type:{selector:'input[type=search]',value:'Verify'}},{assert_selector:'li[hidden]'},{assert_selector:'li:not([hidden])'},{screenshot:{name:'search-results'}}]}));
 try {
 await waitUntil(async()=>{try{return !!(await action('manage-kujo-assurance',{operation:'inspect',selection:{kind:'packwrite',path:'agent'}})).plan;}catch{return false;}},60000);
 assert.equal((await action('kujo-acceptance',{operation:'status'})).status,'incomplete');
 const run=async(kind,path,label,expected='passed')=>{
  const prepared=await action('manage-kujo-assurance',{operation:'prepare',selection:{kind,path,...(kind==='lens'?{target}:{})},submissionId:label});assert.equal(prepared.state,'pending');
  await action('manage-kujo-assurance',{operation:'start',id:prepared.id},{status:502});
  await call(`/issues/${issueId}/interactions/${prepared.interactionId}/accept`,{method:'POST',body:{}});
  await action('manage-kujo-assurance',{operation:'start',id:prepared.id});
  const jobs=(await call('/plugins/kujolang.paperclip/jobs')).data,job=jobs.find(x=>x.jobKey==='assurance-workflows');assert.ok(job);
  await call(`/plugins/kujolang.paperclip/jobs/${job.id}/trigger`,{method:'POST',body:{}}).catch(error=>{if(!String(error).includes('400 !== 200'))throw error;});
  let result;await waitUntil(async()=>{result=await action('manage-kujo-assurance',{operation:'status',id:prepared.id});return !['preparing','pending','running','cancel_requested'].includes(result.state);},120000);
  assert.equal(result.result?.classification,expected,JSON.stringify({kind,label,state:result.state,result:result.result?.stdout,stderr:result.result?.stderr,diagnostic:result.diagnostic}));assert.equal(result.history.status,'retained');records.push({kind,label,result});return result;
 };
 await run('packwrite','agent','plan','plan-valid');await run('muzzle','check','workflow');
 await writeFile(join(workspace,'.muzzle/workflows/check.sh'),'#!/bin/sh\nprintf "retained failed workflow\\n"\nexit 7\n');
 const failedWorkflow=await run('muzzle','check','failed-workflow','failed');assert.ok(failedWorkflow.result.artifacts.some(a=>a.content?.includes('retained failed workflow')));
 await action('manage-kujo-assurance',{operation:'recover',id:failedWorkflow.id},{status:502});
 await writeFile(join(workspace,'.muzzle/workflows/check.sh'),'#!/bin/sh\nprintf "observed workflow check\\n"\n');
 const contained=await run('workcell','workcell.json','contained-check');
 for(let attempt=0;attempt<2;attempt++){const recovery=await action('manage-kujo-assurance',{operation:'recover',id:contained.id});assert.equal(recovery.cleanup,'owned-containers-removed');assert.deepEqual((await action('manage-kujo-assurance',{operation:'status',id:contained.id})).result,contained.result);}
 await run('lens','browser.json','intentional-browser-failure','failed');assert.equal((await action('kujo-acceptance',{operation:'status'})).status,'failed');
 broken=false;await run('lens','browser.json','corrected-browser');assert.equal((await action('kujo-acceptance',{operation:'status'})).status,'passed');
 await writeFile(join(workspace,'submission.txt'),'changed submission');assert.equal((await action('kujo-acceptance',{operation:'status'})).status,'incomplete');
 const waived=await action('kujo-acceptance',{operation:'waive',reason:'Controlled demonstration of explicit waiver on stale evidence'});await call(`/issues/${issueId}/interactions/${waived.interactionId}/accept`,{method:'POST',body:{}});assert.equal((await action('kujo-acceptance',{operation:'status'})).status,'waived');
 const cancelled=await action('manage-kujo-assurance',{operation:'prepare',selection:{kind:'muzzle',path:'check'},submissionId:'cancelled-before-run'});await action('manage-kujo-assurance',{operation:'cancel',id:cancelled.id});assert.equal((await action('manage-kujo-assurance',{operation:'status',id:cancelled.id})).state,'cancelled');
 const telemetry={schema_version:'kujo.telemetry.v1',source_app:'paperclip-demo',trace_id:records[0].result.id,session_id:issueId,trace:{trace_id:records[0].result.id,name:'observed-pack-request-lifecycle',status:'ok',started_at_ms:Date.parse(records[0].result.createdAt),duration_ms:Date.parse(records[0].result.finishedAt)-Date.parse(records[0].result.createdAt)}};
 const imported=await action('import-verification',{entityType:'issue',entityId:issueId,format:'watchdog',json:JSON.stringify(telemetry)});assert.equal(imported.classification,'unverified');
 const readiness=(await call(route,{method:'POST',body:{companyId,key:'inspect-release-readiness',params:{entityType:'issue',entityId:issueId}}})).data.data;assert.ok(['passed','warnings','failed'].includes(readiness.status));
 const delegated=await action('kujo-delegation',{});assert.ok(delegated.issues.some(x=>x.id===issueId));
 const {qualifyAssuranceTeam}=await import('./assurance-team.mjs');
 const teamResult=await qualifyAssuranceTeam({call,companyId,projectId,root,node,base,cookie,config,checks,json,waitUntil,target});
 await stop();await start();await waitUntil(async()=>{try{return (await action('manage-kujo-assurance',{operation:'list'})).requests.length>=records.length;}catch{return false;}},60000);
 for(const record of records){const restored=await action('manage-kujo-assurance',{operation:'status',id:record.result.id});assert.deepEqual(restored.result,record.result.result);}
 assert.equal((await action('kujo-acceptance',{issueId:teamResult.parentIssueId,operation:'status'})).digest,teamResult.acceptanceDigest);
 for(const entry of teamResult.team){const restored=await action(entry.role==='review'?'manage-evaluation':'manage-kujo-assurance',{issueId:entry.issueId,operation:'status',id:entry.execution.id});assert.deepEqual(restored.result,entry.execution.result);const detail=(await call('/plugins/kujolang.paperclip/bridge/data',{method:'POST',body:{companyId,key:'detail',params:{entityType:'issue',entityId:entry.issueId}}})).data.data;assert.ok(detail.history.some(r=>r.artifactId===entry.runledger.id));}
 const paginationRoot=(await call(`/companies/${companyId}/issues`,{method:'POST',status:201,body:{title:'Delegation pagination fixture',projectId,status:'backlog'}})).data.id;
 const childIds=[];
 for(let i=0;i<51;i++)childIds.push((await call(`/companies/${companyId}/issues`,{method:'POST',status:201,body:{title:`Pagination child ${i}`,projectId,parentId:paginationRoot,status:'backlog'}})).data.id);
 const firstPage=await action('kujo-delegation',{issueId:paginationRoot});assert.equal(firstPage.issues.length,50);assert.equal(firstPage.page.total,52);assert.ok(firstPage.nextCursor);
 const secondPage=await action('kujo-delegation',{issueId:paginationRoot,cursor:firstPage.nextCursor});assert.equal(secondPage.issues.length,2);assert.equal(secondPage.nextCursor,null);
 assert.deepEqual(new Set([...firstPage.issues,...secondPage.issues].map(i=>i.id)),new Set([paginationRoot,...childIds]));
 const {verifyDelegationPages}=await import('./assurance-ui.mjs');await verifyDelegationPages({base,cookie,issueId:paginationRoot});
 await call(`/companies/${companyId}/issues`,{method:'POST',status:201,body:{title:'Changed pagination membership',projectId,parentId:paginationRoot,status:'backlog'}});
 await action('kujo-delegation',{issueId:paginationRoot,cursor:firstPage.nextCursor},{status:502});
 checks.push('Native delegated evidence: 52 actual issues across bounded 50/2 API and browser pages, no omissions/duplicates, stale cursor rejected after membership change');
 checks.push('Real authenticated Paperclip: PackWrite, Muzzle, Workcell, Lens fail/corrected pass, stale acceptance, explicit native human waiver, cancellation, metadata import, delegation and restart persistence');
 await json('assurance.json',{schemaVersion:1,records,readiness,waiver:waived.interactionId});
 }finally{server.close();}
}
