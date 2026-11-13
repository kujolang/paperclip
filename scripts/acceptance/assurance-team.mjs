import assert from 'node:assert/strict';
import {cp,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {resolveKujoBinary} from '@kujolang/kujo-runtime';
// Real process-adapter agents execute the tools. The board harness provisions
// native assignments and resolves human-only approvals; it never impersonates tools.
export async function qualifyAssuranceTeam({call,companyId,projectId,root,node,base,cookie,config,checks,json,waitUntil,target}) {
 const roles=['lead','implementation','testing','review'],team=[],runs=[];
 const script=join(root,'assurance-agent.mjs');await cp(new URL('./assurance-agent.mjs',import.meta.url),script);
 const html='< !doctype html>'.replace(' ','')+'<html lang="en"><head><title>Task list</title></head><body><main><h1>Tasks</h1><label>Search<input type="search" oninput="document.querySelectorAll(\'li\').forEach(x=>x.hidden=!x.textContent.includes(this.value))"></label><ul><li>Implement search</li><li>Verify results</li></ul></main></body></html>';
 const definition=JSON.parse(await readFile(join(root,'workspace/workcell.json'),'utf8'));definition.command=['sh','-c','test -f index.html && grep -q querySelectorAll index.html && cp index.html proof.txt'];await writeFile(join(root,'workspace/workcell.json'),JSON.stringify(definition));
 await writeFile(join(root,'workspace/eval.json'),JSON.stringify({name:'Independent search implementation review',tests:[{name:'Search control',check:'file_contains',params:{path:'index.html',expected:'type="search"'}},{name:'Filter handler',check:'file_contains',params:{path:'index.html',expected:'querySelectorAll'}}]}));
 const parent=(await call(`/companies/${companyId}/issues`,{method:'POST',status:201,body:{title:'Deliver a searchable task list',projectId,status:'backlog'}})).data;
 try {
 for(const role of roles){
  const contextPath=join(root,`${role}-context.json`),exchangePath=join(root,`${role}-exchange.json`);
  const agent=(await call(`/companies/${companyId}/agents`,{method:'POST',status:201,body:{name:`Assurance ${role}`,role:role==='lead'?'ceo':'engineer',...(team[0]?{reportsTo:team[0].agentId}:{}),adapterType:'process',adapterConfig:{command:node,args:[script,contextPath,exchangePath]}}})).data;
  const key=(await call(`/agents/${agent.id}/keys`,{method:'POST',status:201,body:{name:'Disposable assurance agent'}})).data;
  team.push({role,agentId:agent.id,keyId:key.id,token:key.token||key.key,contextPath,exchangePath});
 }
 let delegatedAssignments=[];
 for(const entry of team){
  const {role,contextPath,exchangePath}=entry,agent={id:entry.agentId},key={token:entry.token};
  const issue=role==='lead'?parent:delegatedAssignments.find(i=>i.role===role);
  assert.ok(issue,`Lead must create the native ${role} assignment`);entry.issueId=issue.id;
  const run=(await call(`/agents/${agent.id}/heartbeat/invoke`,{method:'POST',status:202,body:{reason:'assurance_team_qualification'}})).data;runs.push(run.id);
  await call(`/issues/${issue.id}/checkout`,{method:'POST',token:key.token||key.key,runId:run.id,body:{agentId:agent.id,expectedStatuses:['backlog']}});
  const tool=role==='review'?'manage-evaluation':'manage-kujo-assurance';
  const parameters=role==='review'?{suite:'eval.json'}:{selection:role==='lead'?{kind:'packwrite',path:'agent'}:role==='implementation'?{kind:'workcell',path:'workcell.json'}:{kind:'lens',path:'browser.json',target}};
  await writeFile(contextPath,JSON.stringify({base,token:key.token||key.key,runId:run.id,companyId,projectId,agentId:agent.id,issueId:issue.id,tool,parameters,ledgerSource:resolve(process.env.KUJO_TEST_RUNLEDGER_ROOT??'../runledger'),kujoBinary:resolveKujoBinary(),ledgerDirectory:join(root,`${role}-ledger`),workspace:join(root,'workspace'),...(role==='lead'?{delegations:team.slice(1).map(t=>({role:t.role,agentId:t.agentId}))}:{}),...(role==='implementation'?{implementation:{path:join(root,'workspace/index.html'),html}}:{})}),{mode:0o600});
  let exchange;await waitUntil(async()=>{try{exchange=JSON.parse(await readFile(exchangePath,'utf8'));}catch{return false;}if(exchange.phase==='failed')throw new Error(exchange.error);return exchange.phase==='approval-requested';},90000);
  await call(`/issues/${issue.id}/interactions/${exchange.interactionId}/accept`,{method:'POST',body:{}});await writeFile(`${exchangePath}.approved`,'approved',{mode:0o600});
  if(tool==='manage-kujo-assurance'){
   // Wait until the real agent has queued before manually waking the normal job.
   await waitUntil(async()=>{const r=(await call('/plugins/kujolang.paperclip/bridge/action',{method:'POST',body:{companyId,key:tool,params:{issueId:issue.id,operation:'status',id:exchange.id}}})).data.data;return r.startRequestedAt||r.state!=='pending';},60000);
   const job=(await call('/plugins/kujolang.paperclip/jobs')).data.find(x=>x.jobKey==='assurance-workflows');await call(`/plugins/kujolang.paperclip/jobs/${job.id}/trigger`,{method:'POST',body:{}}).catch(error=>{if(!String(error).includes('400 !== 200'))throw error;});
  }
  await waitUntil(async()=>{exchange=JSON.parse(await readFile(exchangePath,'utf8'));if(exchange.phase==='failed')throw new Error(exchange.error);return exchange.phase==='completed';},120000);
  assert.equal(exchange.result.result.classification,role==='lead'?'plan-valid':'passed',JSON.stringify({role,state:exchange.result.state,stdout:exchange.result.result?.stdout}));assert.equal(exchange.result.requester.id,agent.id);assert.equal(exchange.result.requester.runId,run.id);
  if(role==='lead')delegatedAssignments=exchange.delegated;
  Object.assign(entry,{runId:run.id,execution:exchange.result,runledger:exchange.correlation});
  await waitUntil(async()=>{const observed=(await call(`/heartbeat-runs/${run.id}`)).data;return observed.status==='succeeded';},60000);
 }
 const policy={projectId,issueId:parent.id,mode:'human-approval',allowWaiver:false,checks:team.slice(1).map(t=>({issueId:t.issueId,kind:t.role==='implementation'?'workcell':t.role==='testing'?'lens':'eval',suite:t.role==='implementation'?'workcell.json':t.role==='testing'?'browser.json':'eval.json'}))};
 await call('/plugins/kujolang.paperclip/config',{method:'POST',body:{companyId,configJson:{...config,acceptancePolicies:[policy]}}});
 const action=async(key,params={})=>(await call('/plugins/kujolang.paperclip/bridge/action',{method:'POST',body:{companyId,key,params:{issueId:parent.id,...params}}})).data.data;
 let status;await waitUntil(async()=>{try{status=await action('kujo-acceptance',{operation:'status'});return status.status==='awaiting-human-review';}catch{return false;}},60000);
 const approval=await action('kujo-acceptance',{operation:'approve'});await call(`/issues/${parent.id}/interactions/${approval.interactionId}/accept`,{method:'POST',body:{}});
 status=await action('kujo-acceptance',{operation:'status'});assert.equal(status.status,'passed');
 const delegation=await action('kujo-delegation');assert.equal(delegation.issues.length,4);assert.ok(team.every(t=>delegation.issues.some(i=>i.id===t.issueId&&i.assigneeAgentId===t.agentId&&i.evidence.length)));
 const {captureAssuranceUi}=await import('./assurance-ui.mjs');await captureAssuranceUi({base,cookie,issueId:parent.id,root});
 await json('assurance-team.json',{schemaVersion:1,producer:'four real deterministic Paperclip process agents; no LLM or invented usage',parentIssueId:parent.id,team:team.map(({keyId,token,contextPath,exchangePath,...t})=>t),acceptance:status,delegation});
 checks.push('Four real process agents: native reportsTo/parentId/checkout/run attribution, PackWrite plan, Workcell implementation proof, Lens interaction, Eval review, child evidence aggregation and human approval');
 return {parentIssueId:parent.id,acceptanceDigest:status.digest,team:team.map(({keyId,token,contextPath,exchangePath,...t})=>t)};
 }finally{for(const run of runs)await call(`/heartbeat-runs/${run}/cancel`,{method:'POST',body:{}}).catch(()=>{});for(const t of team)await call(`/agents/${t.agentId}/keys/${t.keyId}`,{method:'DELETE'});}
}
