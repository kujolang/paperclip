// Deterministic process-agent fixture. Runs inside Paperclip's process adapter,
// calls the authenticated plugin tools itself, and never receives a board cookie.
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
const [contextPath,exchangePath]=process.argv.slice(2);
try {
let context;
for(let attempt=0;attempt<600;attempt++){try{context=JSON.parse(await readFile(contextPath,'utf8'));break;}catch{await delay(100);}}
if(!context)throw new Error('Agent context deadline');
const {base,token,runId,companyId,projectId,agentId,issueId,tool,parameters}=context;
async function invoke(parameters, selectedTool=tool){
 const response=await fetch(`${base}/api/plugins/tools/execute`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'X-Paperclip-Run-Id':runId,'Content-Type':'application/json'},body:JSON.stringify({tool:`kujolang.paperclip:${selectedTool}`,parameters,runContext:{companyId,projectId,agentId,runId}}),signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw new Error(`Agent tool HTTP ${response.status}`);
 const value=(await response.json()).result;if(value.error)throw new Error(value.error);return value.data;
}
if(context.implementation){await writeFile(context.implementation.path,context.implementation.html);}
const ledger=(...args)=>execFileSync(context.kujoBinary,['run',join(context.ledgerSource,'runledger.kujo'),'--',...args,'--ledger',context.ledgerDirectory],{cwd:context.workspace,encoding:'utf8',timeout:30000});
const ledgerStart=ledger('start','--provider','local-process','--model','not-applicable-no-model','--task',issueId,'--repo',context.workspace);
const ledgerId=ledgerStart.match(/Started run: (.+)/)?.[1]?.trim();if(!ledgerId)throw new Error('RunLedger did not create a record');
const prepared=await invoke({issueId,operation:'prepare',...parameters,submissionId:`agent-${runId}`});await writeFile(exchangePath,JSON.stringify({phase:'approval-requested',id:prepared.id,interactionId:prepared.interactionId}),{mode:0o600});
for(let attempt=0;attempt<1200;attempt++){try{await readFile(`${exchangePath}.approved`);break;}catch{await delay(100);if(attempt===1199)throw new Error('Approval deadline');}}
let result=await invoke({issueId,operation:'start',id:prepared.id});
for(let attempt=0;attempt<1200&&['preparing','pending','running','cancel_requested'].includes(result.state);attempt++){await delay(250);result=await invoke({issueId,operation:'status',id:prepared.id});}
if(!result.result)throw new Error(`No retained result: ${result.state}`);
ledger('test',ledgerId,`Observed native ${result.plan.suite}: ${result.id}`,'--status',['passed','plan-valid'].includes(result.result.classification)?'pass':'fail');
ledger('finish',ledgerId,'--status',['passed','plan-valid'].includes(result.result.classification)?'pass':'fail','--verdict',`Observed ${result.result.classification}; planning validation is not implementation acceptance`);
const correlation=await invoke({issueId,format:'runledger',json:ledger('show',ledgerId,'--json')},'import-verification');
if(correlation.host.agentId!==agentId||correlation.host.runId!==runId)throw new Error('RunLedger host attribution mismatch');
const delegated=[];
for(const assignment of context.delegations??[]){
 const response=await fetch(`${base}/api/companies/${companyId}/issues`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'X-Paperclip-Run-Id':runId,'Content-Type':'application/json'},body:JSON.stringify({title:`Search task list: ${assignment.role}`,projectId,parentId:issueId,assigneeAgentId:assignment.agentId,status:'backlog',description:'Follow the reviewed PackWrite phase. Retain native verification evidence; an assignment is not proof of completion.'}),signal:AbortSignal.timeout(30000)});
 if(response.status!==201)throw new Error(`Native delegation HTTP ${response.status}`);
 const child=await response.json();delegated.push({role:assignment.role,id:child.id,assigneeAgentId:child.assigneeAgentId,parentId:child.parentId});
}
await writeFile(exchangePath,JSON.stringify({phase:'completed',result,correlation,delegated}),{mode:0o600});
console.log(JSON.stringify({executionId:result.id,state:result.state,classification:result.result.classification}));

// The native process run exits successfully after retaining its own evidence.

}catch(error){await writeFile(exchangePath,JSON.stringify({phase:"failed",error:String(error).slice(0,2000)}),{mode:0o600});process.exitCode=1;}
