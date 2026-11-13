import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { homedir } from 'node:os';
await build({ stdin: { contents: 'export {nativeAssurance, cleanupWorkcell} from "./src/features/assurance/native.ts"; export {resolveKujo} from "./src/runtime/resolve-kujo.ts"; export {executeKujo} from "./src/runtime/execute-kujo.ts"; export {parsePluginConfig} from "./src/config/schema.ts";', resolveDir: process.cwd(), loader:'ts' }, bundle:true, platform:'node', format:'esm', packages:'external', outfile:'scripts/acceptance/.native-probe.mjs' });
const { nativeAssurance, resolveKujo, executeKujo, parsePluginConfig } = await import('./.native-probe.mjs');
const base = join(homedir(), '.cache', 'paperclip-native-acceptance'); await mkdir(base, { recursive: true, mode: 0o700 });
const root = await realpath(await mkdtemp(join(base, 'run-')));
const runtime = await resolveKujo(parsePluginConfig({}),root);
const server = createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Task list</title></head><body><main><h1>Tasks</h1><label>Search<input type="search" oninput="document.querySelectorAll(\'li\').forEach(x=>x.hidden=!x.textContent.includes(this.value))"></label><ul><li>Implement search</li><li>Verify results</li></ul></main></body></html>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const dockerHost = process.env.KUJO_TEST_DOCKER_HOST;
const image = execFileSync('docker',['--host',dockerHost,'image','inspect',process.env.KUJO_TEST_IMAGE ?? 'kujolang/workcell-base:local','--format','{{.Id}}'],{encoding:'utf8'}).trim();
const results=[];
try {
const kinds = (process.env.KUJO_TEST_KINDS ?? 'packwrite,muzzle,workcell,lens').split(',');
for (const kind of kinds) {
 const directory=join(root,kind); await mkdir(directory); const workspace=join(directory,'workspace');await mkdir(workspace);
 let path;
 if(kind==='packwrite'){await cp('examples/assurance/agent',join(workspace,'agent'),{recursive:true});path='agent';}
 if(kind==='muzzle'){await mkdir(join(workspace,'.muzzle/manifests'),{recursive:true});await mkdir(join(workspace,'.muzzle/workflows'),{recursive:true});await writeFile(join(workspace,'.muzzle/manifests/check.json'),JSON.stringify({schema_version:'muzzle.manifest/v1',name:'check',summary:'Assert fixture',runner:'bash',script:'workflows/check.sh',args:[],quiet_by_default:true,safety:{require_git_repo:false,allow_dirty_tree:true,requires_network:false,human_approval_recommended:true}}));await writeFile(join(workspace,'.muzzle/workflows/check.sh'),'#!/bin/sh\nprintf "real workflow passed\\n"\n');path='check';}
 if(kind==='workcell'){await writeFile(join(workspace,'workcell.json'),JSON.stringify({version:1,name:'paperclip-fixture',runtime:{backend:'docker',image},command:['sh','-c','printf "real container passed\\n"; printf "artifact\\n" > proof.txt'],workspace:{strategy:'git-worktree',mount_path:'/workspace'},network:{mode:'none'},resources:{cpus:1,memory:'256m',pids:64,timeout_ms:10000},filesystem:{read_only_root:true,tmpfs:['/tmp']},environment:{allow:[],set:{}},secrets:[],artifacts:{export:['proof.txt']},cleanup:{keep_failed:false},receipt:{path:'.workcell/runs'}}));path='workcell.json';}
 if(kind==='lens'){await writeFile(join(workspace,'browser.json'),JSON.stringify({title:{contains:'Task list'},text:{contains:['Tasks']},selectors:{exists:['main']},console:{no_errors:true},network:{no_5xx:true}}));path='browser.json';}
 const native=await nativeAssurance({selection:{kind,path,...(kind==='lens'?{target:`http://127.0.0.1:${server.address().port}`}:{})},directory,workspace,runtime,dockerHost});
 const output=await executeKujo({...native.invocation,timeoutMs:27000,maxStdoutBytes:500000,maxStderrBytes:64000});
 await native.cleanup();
 const artifacts=await native.collect();
 results.push({kind,...output,artifacts});
 console.log(JSON.stringify({kind,exitCode:output.exitCode,stdout:output.stdout.slice(0,1600),stderr:output.stderr.slice(0,1600),artifacts:artifacts.map(x=>x.path)}));
}

if (!process.env.KUJO_TEST_KINDS) {
 for(const scenario of ['pack-generation','muzzle-contained','workcell-timeout','workcell-cancel']){
  const directory=join(root,scenario);await mkdir(directory);const workspace=join(directory,'workspace');
  const source=scenario==='pack-generation'?'packwrite':scenario==='muzzle-contained'?'muzzle':'workcell';
  await cp(join(root,source,'workspace'),workspace,{recursive:true,filter:p=>!p.split('/').includes('.git')});
  let selection={kind:'workcell',path:'workcell.json'};
  if(scenario==='pack-generation'){
   const files=[];async function walk(dir,prefix){for(const f of await readdir(dir,{withFileTypes:true})){const name=prefix+'/'+f.name;if(f.isDirectory())await walk(join(dir,f.name),name);else files.push({path:name,content:await readFile(join(dir,f.name),'utf8')});}}await walk(join(workspace,'agent'),'agent');
   await writeFile(join(workspace,'pack.json'),JSON.stringify({files}));selection={kind:'packwrite',path:'agent',target:'pack.json'};
  }else{
   const definition=JSON.parse(await readFile(join(root,'workcell/workspace/workcell.json'),'utf8'));
   definition.command=scenario==='muzzle-contained'?['sh','/workspace/.muzzle/workflows/check.sh']:['sh','-c','printf "started\\n"; sleep 10'];
   if(scenario==='workcell-timeout')definition.resources.timeout_ms=200;
   definition.artifacts.export=[];
   await writeFile(join(workspace,'workcell.json'),JSON.stringify(definition));
   if(scenario==='muzzle-contained')selection={kind:'muzzle',path:'check',target:'workcell.json'};
  }
  const native=await nativeAssurance({selection,directory,workspace,runtime,dockerHost});
  const controller=new AbortController();const timer=scenario==='workcell-cancel'?setTimeout(()=>controller.abort(),4000):null;
  let output,error;
  try{output=await executeKujo({...native.invocation,signal:controller.signal,timeoutMs:27000,maxStdoutBytes:500000,maxStderrBytes:64000});}catch(e){error=e.code??e.message;}finally{if(timer)clearTimeout(timer);await native.cleanup();}
  const artifacts=await native.collect();
  if(scenario==='workcell-cancel'){assert.equal(error,'KUJO_EXEC_CANCELLED');await native.cleanup();}
  else if(scenario==='workcell-timeout'){assert.notEqual(output.exitCode,0);assert.ok(artifacts.some(a=>a.path.endsWith('/receipt.json')));}
  else assert.equal(output.exitCode,0,JSON.stringify(output));
  results.push({scenario,expectedFailure:scenario.startsWith('workcell-'),...output,error,artifacts});console.log(JSON.stringify({scenario,exitCode:output?.exitCode,error,artifacts:artifacts.length}));
 }
}
}finally{server.close();await rm(new URL('./.native-probe.mjs',import.meta.url),{force:true});await writeFile(join(root,'results.json'),JSON.stringify(results,null,2));console.log(root);}
if(results.some(r=>!r.expectedFailure && r.exitCode!==0))process.exitCode=1;
