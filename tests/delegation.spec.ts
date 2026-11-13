import {expect,it} from 'vitest';
import {createTestHarness} from './helpers/harness.js';
import manifest from '../src/manifest.js';
import {registerDelegation} from '../src/features/assurance/delegation.js';
function fixture(count=120){
 const h=createTestHarness({manifest});
 const ids=Array.from({length:count},(_,i)=>`child-${String(i).padStart(3,'0')}`);
 h.seed({projects:[{id:'project',companyId:'company',visibility:'open'} as never]});
 const reads:string[]=[];
 h.ctx.issues.get=async(id,company)=>{reads.push(id);return company==='company'?{id,companyId:'company',projectId:'project',title:id,status:'backlog'} as never:null;};
 h.ctx.issues.summaries.getOrchestration=async()=>({companyId:'company',issueId:'root',subtreeIssueIds:[...ids].reverse(),runs:ids.map(id=>({id:`run-${id}`,issueId:id,agentId:'agent',status:'succeeded'}))} as never);
 registerDelegation(h.ctx);
 const human={companyId:'company',actor:{type:'user' as const,userId:'board',companyId:'company'}};
 const page=(cursor?:unknown)=>h.performAction<any>('kujo-delegation',{issueId:'root',...(cursor?{cursor}:{})},human);
 return {h,ids,reads,page,human};
}
it('pages the complete native tree with bounded reads and page-owned run references',async()=>{
 const f=fixture();const seen:string[]=[];let cursor;
 for(const expected of [50,50,21]){
  f.reads.length=0;const result=await f.page(cursor);
  expect(result.issues).toHaveLength(expected);expect(f.reads.length).toBeLessThanOrEqual(51);
  expect(result.page).toEqual({offset:seen.length,total:121});
  const ids=result.issues.map((i:any)=>i.id);seen.push(...ids);
  expect(result.runs.every((r:any)=>ids.includes(r.issueId))).toBe(true);cursor=result.nextCursor;
 }
 expect(cursor).toBeNull();expect(new Set(seen).size).toBe(121);expect(seen).toEqual(['root',...f.ids]);
});
it('rejects stale, malformed and cross-scope cursors before reading a page',async()=>{
 const f=fixture();const first=await f.page();
 await expect(f.page({...first.nextCursor,offset:1})).rejects.toThrow(/cursor/);
 await expect(f.page({...first.nextCursor,digest:'f'.repeat(64)})).rejects.toThrow(/cursor/);
 await expect(f.page({...first.nextCursor,offset:-1})).rejects.toThrow();
 f.ids.push('new-child');await expect(f.page(first.nextCursor)).rejects.toThrow(/changed/);
 const refreshed=await f.page();expect(refreshed.page.total).toBe(122);
 f.h.ctx.issues.summaries.getOrchestration=async()=>({companyId:'company',issueId:'other-root',subtreeIssueIds:f.ids,runs:[]} as never);
 await expect(f.h.performAction('kujo-delegation',{issueId:'other-root',cursor:refreshed.nextCursor},f.human)).rejects.toThrow(/cursor/);
 await expect(f.h.performAction('kujo-delegation',{issueId:'root',cursor:refreshed.nextCursor},{companyId:'other',actor:{type:'user',userId:'board',companyId:'company'}})).rejects.toThrow(/unavailable in this company/);
});
it('rechecks child access on later pages and rejects host scope mismatch',async()=>{
 const f=fixture();const first=await f.page();const get=f.h.ctx.issues.get;
 f.h.ctx.issues.get=async(id,company)=>id==='child-050'?null:get(id,company);
 await expect(f.page(first.nextCursor)).rejects.toThrow();
 f.h.ctx.issues.summaries.getOrchestration=async()=>({companyId:'other',issueId:'root',subtreeIssueIds:[],runs:[]} as never);
 await expect(f.page()).rejects.toThrow(/scope mismatch/);
});
