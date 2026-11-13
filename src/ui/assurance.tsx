import { useEffect, useRef, useState } from "react";
import { usePluginAction } from "@paperclipai/plugin-sdk/ui";
import type { Artifact, Selection } from "../features/assurance/native.js";
import type { ExecutionRecord, ExecutionPlan } from "../execution/contracts.js";
const pre = { whiteSpace: "pre-wrap" as const, overflowWrap: "anywhere" as const, maxHeight: 360, overflow: "auto", fontSize: 12 };
export function AssurancePanel({ issueId, refreshEvidence }: { issueId: string; refreshEvidence: () => unknown }) {
  const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const invoke = usePluginAction("manage-kujo-assurance");
  const acceptance = usePluginAction("kujo-acceptance"), delegation = usePluginAction("kujo-delegation");
  const [policy,setPolicy] = useState<unknown>(null),[team,setTeam] = useState<unknown>(null),[reason,setReason] = useState("");
  async function policyAction(operation: string) { setBusy(true);setError(""); try { const value=await acceptance({ issueId,operation,...(operation==="waive"?{reason}:{}) });if(!alive.current)return;setPolicy(value); await refreshEvidence(); } catch(e) { if(alive.current)setError(e instanceof Error?e.message:"Acceptance unavailable"); } finally{if(alive.current)setBusy(false);} }
  async function teamAction() { setBusy(true);setError(""); try { const value=await delegation({issueId});if(alive.current)setTeam(value); }catch(e){if(alive.current)setError(e instanceof Error?e.message:"Delegation unavailable");}finally{if(alive.current)setBusy(false);} }
  const [kind,setKind] = useState<Selection["kind"]>("lens"), [path,setPath] = useState("browser.json"), [target,setTarget] = useState("http://127.0.0.1:3000");
  const [discovered,setDiscovered] = useState<unknown>(null);
  const [selected,setSelected] = useState<{ id?: string; state?: string; plan?: ExecutionPlan; result?: Record<string,unknown>; diagnostic?: string } | null>(null);
  const [requests,setRequests] = useState<Array<{id:string;path:string;state:string}>>([]), [error,setError] = useState(""), [busy,setBusy] = useState(false);
  async function act(operation: string, id?: string) {
    setBusy(true);setError("");
    try {
      const data = await invoke({ issueId, operation, ...(id?{id}:{}), ...(["inspect","prepare"].includes(operation)?{selection:{kind,path,...((kind==="lens" || kind==="packwrite" || kind==="muzzle") && target?{target}:{})}}:{}), ...(operation==="prepare"?{submissionId:crypto.randomUUID()}:{}) });
      if(!alive.current)return;
      if(operation==="discover")setDiscovered(data); else if(operation!=="list")setSelected(data as typeof selected);
      const list = await invoke({issueId,operation:"list"}) as {requests:typeof requests};if(!alive.current)return;setRequests(list.requests);await refreshEvidence();
    } catch(e){if(alive.current)setError(e instanceof Error?e.message:"Verification operation unavailable");}finally{if(alive.current)setBusy(false);}
  }
  const artifacts = (selected?.result?.artifacts ?? []) as Artifact[];
  return <section aria-label="Verification Center" style={{border:"1px solid var(--border,#ddd)",padding:18,borderRadius:12,display:"grid",gap:12}}>
    <h3>Verification Center</h3>
    <div><button disabled={busy} onClick={()=>void policyAction("status")}>Check acceptance</button> <button disabled={busy} onClick={()=>void policyAction("approve")}>Request evidence review</button> <button disabled={busy} onClick={()=>void teamAction()}>Inspect delegated evidence</button></div>
    <details><summary>Request a policy waiver</summary><label>Reason <input value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy||!reason} onClick={()=>void policyAction("waive")}>Request human waiver</button></details>
    {policy!==null&&<AcceptanceResult value={policy}/>}
    {team!==null&&<DelegatedEvidence value={team}/>}<p>Optional native checks use a reviewed input snapshot and the issue’s human-only approval card. Configuration and private workflow storage are required. No automatic retry.</p>
    <button disabled={busy} onClick={()=>void act("discover")}>Discover project workflows</button>
    {discovered!==null&&<pre style={pre}>{JSON.stringify(discovered,null,2)}</pre>}
    <label>Integration <select disabled={busy} value={kind} onChange={e=>{const v=e.target.value as Selection["kind"];setKind(v);setTarget(v==="lens"?"http://127.0.0.1:3000":"");setPath(v==="packwrite"?"agent":v==="muzzle"?"check":v==="workcell"?"workcell.json":"browser.json");setSelected(null);}}><option value="lens">Lens browser check</option><option value="workcell">Workcell container</option><option value="muzzle">Muzzle workflow</option><option value="packwrite">PackWrite execution pack</option></select></label>
    <label>{kind==="muzzle"?"Workflow name":"Project-relative input"} <input disabled={busy} value={path} onChange={e=>{setPath(e.target.value);setSelected(null);}}/></label>
    {kind==="lens"&&<label>Loopback preview URL <input disabled={busy} value={target} onChange={e=>{setTarget(e.target.value);setSelected(null);}}/></label>}
    {kind==="packwrite"&&<label>Optional supplied PackWrite manifest path (blank validates agent/) <input disabled={busy} value={target} onChange={e=>{setTarget(e.target.value);setSelected(null);}}/></label>}
    {kind==="muzzle"&&<label>Optional Workcell definition (blank uses trusted host execution) <input disabled={busy} value={target} onChange={e=>{setTarget(e.target.value);setSelected(null);}}/></label>}
    {kind==="muzzle"&&<p>Host execution: trusted workflow code can affect host files and network. Use a Workcell definition to contain untrusted work.</p>}
    <div><button disabled={busy} onClick={()=>void act("inspect")}>Inspect workflow</button> <button disabled={busy} onClick={()=>void act("prepare")}>Request verification approval</button> <button disabled={busy} onClick={()=>void act("list")}>Refresh verification</button></div>
    {error&&<p role="alert">{error}</p>}{busy&&<p role="status">Loading verification…</p>}
    {selected&&<><strong>{selected.state??"Preview"}</strong>{selected.diagnostic&&<p>{selected.diagnostic}</p>}{selected.plan&&<details open><summary>Approved inputs and effects</summary><p>{selected.plan.summary}</p><pre style={pre}>{selected.plan.preview}</pre></details>}
      {selected.id&&selected.state==="pending"&&<button disabled={busy} onClick={()=>void act("start",selected.id)}>Queue approved verification</button>}
      {selected.id&&["pending","running","cancel_requested"].includes(selected.state??"")&&<button onClick={()=>void act("cancel",selected.id)}>Cancel verification</button>}
      {selected.result&&<pre style={pre}>{String(selected.result.stdout??"")}{String(selected.result.stderr??"")}</pre>}
      {artifacts.map(a=><details key={a.path}><summary>{a.path} · {a.bytes} bytes</summary>{a.encoding==="base64"&&a.mediaType==="image/png"?<img style={{maxWidth:"100%"}} alt={`Lens capture ${a.path}`} src={`data:image/png;base64,${a.content}`}/>:<pre style={pre}>{a.content}</pre>}</details>)}
      {selected.id && ["uncertain","cancelled","failed"].includes(selected.state??"") && <button disabled={busy} onClick={()=>void act("recover",selected.id)}>Recover owned resources</button>}
      <details><summary>Execution receipt</summary><pre style={pre}>{JSON.stringify(selected,null,2)}</pre></details></>}
    {!!requests.length&&<ul>{requests.map(r=><li key={r.id}>{r.path} · {r.state} <button disabled={busy} onClick={()=>void act("status",r.id)}>Inspect {r.id.slice(-8)}</button></li>)}</ul>}
  </section>;
}

function AcceptanceResult({value}:{value:unknown}) {
 const result=value as {status?:string;verifiedComplete?:boolean;policyMode?:string;checks?:Array<{kind:string;suite:string;status:string;issueId?:string}>;notice?:string};
 return <div aria-label="Acceptance result"><strong>{result.status??"unavailable"}</strong><p>{result.policyMode??"No policy"} · {result.verifiedComplete?"Verified complete":"Not verified complete"}</p>
 <table style={{width:"100%",textAlign:"left"}}><thead><tr><th>Check</th><th>Input</th><th>Result</th></tr></thead><tbody>{result.checks?.map((c,i)=><tr key={i}><td>{c.kind}</td><td>{c.issueId?<a href={`/issues/${encodeURIComponent(c.issueId)}`}>{c.suite}</a>:c.suite}</td><td>{c.status}</td></tr>)}</tbody></table><small>{result.notice}</small><details><summary>Acceptance receipt</summary><pre style={pre}>{JSON.stringify(value,null,2)}</pre></details></div>;
}
function DelegatedEvidence({value}:{value:unknown}) {
 const result=value as {issues?:Array<{id:string;title:string;status:string;parentId?:string;assigneeAgentId?:string;evidence:Array<{id:string;kind:string}>}>;runs?:Array<{id:string;issueId:string;agentId:string;status:string}>;truncated?:boolean;notice?:string};
 return <div aria-label="Native delegated evidence"><table style={{width:"100%",textAlign:"left"}}><thead><tr><th>Assignment</th><th>Owner</th><th>Native state</th><th>Evidence</th></tr></thead><tbody>{result.issues?.map(i=><tr key={i.id}><td><a href={`/issues/${encodeURIComponent(i.id)}`}>{i.title}</a>{i.parentId&&<small> · delegated</small>}</td><td>{i.assigneeAgentId?.slice(0,8)??"Unassigned"}</td><td>{i.status}</td><td>{i.evidence.length} records</td></tr>)}</tbody></table><p>{result.truncated?"First 50 assignments shown. ":""}{result.runs?.length??0} related native runs. Open an assignment to inspect its receipts and artifacts.</p><small>{result.notice}</small><details><summary>Attribution and evidence references</summary><pre style={pre}>{JSON.stringify(value,null,2)}</pre></details></div>;
}
