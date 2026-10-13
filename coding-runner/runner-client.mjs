import { readFile,writeFile,mkdir,realpath,lstat,unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { ensurePrivateDirectory } from './private-directory.mjs';
import { command } from './process.mjs';
import { prepare,within } from './workspace.mjs';
import { runSandbox } from './sandbox.mjs';
import { engineConfig } from './opencode.mjs';
import { providerTarget } from './gateway.mjs';
import { atomicJson, listenerLock } from './persistence.mjs';
import { dependencyPolicy } from './dependencies.mjs';

export function runnerServer(value) {
  const url=new URL(value);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(url.protocol==='https:'||(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname))))throw new Error('RUNNER_SERVER_INVALID');
  return url.origin;
}
export async function runnerRequest(server,token,body,fetcher=fetch) {
  const response=await fetcher(runnerServer(server)+'/api/coding-runner',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!response.ok){await response.body?.cancel();throw new Error(response.status===401?'RUNNER_REVOKED':response.status>=400&&response.status<500?'RUNNER_RESULT_REJECTED':'RUNNER_REQUEST_FAILED');}
  const reader=response.body?.getReader();if(!reader)throw new Error('RUNNER_RESPONSE_INVALID');let size=0;const chunks=[];
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>40000)throw new Error('RUNNER_RESPONSE_INVALID');chunks.push(part.value);}}finally{await reader.cancel();}
  return JSON.parse(Buffer.concat(chunks).toString());
}
export async function loadRunnerConfig(file) {
  const raw=JSON.parse(await readFile(file,'utf8'));
  if(typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>80||!Array.isArray(raw.projects)||raw.projects.length<1||raw.projects.length>10)throw new Error('RUNNER_CONFIG_INVALID');
  const projects=[];
  for(const project of raw.projects){
    if(!/^[A-Za-z0-9_-]{1,64}$/.test(project.localId)||typeof project.name!=='string'||!project.name.trim()||project.name.length>80||typeof project.testCommand!=='string'||!project.testCommand.trim()||project.testCommand.length>1000||!Array.isArray(project.models)||project.models.length<1||project.models.length>10)throw new Error('RUNNER_CONFIG_INVALID');
    const root=await realpath(project.path);const gitRoot=(await command('git',['-C',root,'rev-parse','--show-toplevel'])).trim();
    if(await realpath(gitRoot)!==root)throw new Error('PROJECT_ROOT_REQUIRED');
    const models=project.models.map(model=>{providerTarget(model.provider);engineConfig(model.model,'validate');if(typeof model.keyFile!=='string')throw new Error('RUNNER_CONFIG_INVALID');return {provider:model.provider,model:model.model,keyFile:path.resolve(model.keyFile)};});
    projects.push({localId:project.localId,name:project.name,path:root,testCommand:project.testCommand,dependencies:dependencyPolicy(project.dependencies),models});
  }
  if(new Set(projects.map(p=>p.localId)).size!==projects.length)throw new Error('RUNNER_CONFIG_INVALID');
  return {name:raw.name,projects};
}
export async function connectRunner({server,code,config,connection,request=runnerRequest}) {
  server=runnerServer(server);if(!/^[a-f0-9]{32}$/.test(code||''))throw new Error('RUNNER_CODE_INVALID');
  const settings=await loadRunnerConfig(config);const root=connection||path.join(homedir(),'.local','share','jetree-code');
  await mkdir(root,{recursive:true,mode:0o700});await ensurePrivateDirectory(root);const resolved=await realpath(root);
  if(settings.projects.some(p=>within(p.path,resolved)))throw new Error('OUTPUT_MUST_BE_OUTSIDE_PROJECT');
  const connectionFile=path.join(resolved,'connection.json');
  const guard=await writeFile(connectionFile,'',{flag:'wx',mode:0o600});void guard;
  try {
    const result=await request(server,null,{action:'pair',code,name:settings.name,projects:settings.projects.map(p=>({localId:p.localId,name:p.name,testCommand:p.testCommand,models:p.models.map(m=>({provider:m.provider,model:m.model}))}))});
    if(!/^jcr_[A-Za-z0-9_-]{43}$/.test(result.token)||!Array.isArray(result.projects)||result.projects.length!==settings.projects.length)throw new Error('RUNNER_RESPONSE_INVALID');
    const projects=settings.projects.map(p=>{const registered=result.projects.find(r=>r.local_id===p.localId);if(!registered||!/^[a-f0-9-]{36}$/.test(registered.id))throw new Error('RUNNER_RESPONSE_INVALID');return {...p,id:registered.id};});
    await atomicJson(connectionFile,{server,token:result.token,executorId:result.executorId,projects});
    return {connection:resolved,projects:projects.map(p=>({id:p.id,name:p.name}))};
  }catch(error){await unlink(connectionFile).catch(()=>{});throw error;}
}
export async function runnerKey(file) {
  const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>2048||(process.platform!=='win32'&&((info.mode&0o077)!==0||info.uid!==process.getuid())))throw new Error('RUNNER_KEY_FILE_PRIVATE_REQUIRED');
  const key=(await readFile(file,'utf8')).replace(/^\uFEFF/,'').trim();if(!key||/\s/.test(key)||key.length>1024)throw new Error('RUNNER_KEY_INVALID');return key;
}
export function runnerJob(job,projects) {
  if(!job||!/^[a-f0-9-]{36}$/.test(job.id)||!/^[a-f0-9-]{36}$/.test(job.claimId)||typeof job.prompt!=='string'||!job.prompt.trim()||job.prompt.length>8000)throw new Error('RUNNER_JOB_INVALID');
  const project=projects.find(p=>p.id===job.projectId);const model=project?.models.find(m=>m.provider===job.provider&&m.model===job.model);
  if(!project||!model)throw new Error('RUNNER_PROJECT_NOT_AUTHORIZED');
  return {project,model};
}
export function redactRunnerReport(report,secrets) {
  let text=JSON.stringify(report);for(const secret of secrets)if(secret)text=text.split(secret).join('[redacted]');
  const clean=JSON.parse(text);const result={state:clean.state,files:clean.files.map(f=>({name:f.name,status:f.status,sensitive:f.sensitive,...(f.diff?{diff:f.diff}: {})})),summary:clean.summary,verification:{...clean.verification,output:clean.verification.output.slice(0,65536)}};
  if(JSON.stringify(result).length>340000){result.files=result.files.map(({diff,...file})=>file);result.summary+='\nDiffs omitidos por tamaño; revisá la copia local.';}
  if(JSON.stringify(result).length>340000)throw new Error('RUNNER_REPORT_TOO_LARGE');
  return result;
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function listenRunner({connection,requester=runnerRequest,run=runSandbox,signal}) {
  const root=await realpath(connection||path.join(homedir(),'.local','share','jetree-code'));await ensurePrivateDirectory(root);
  const settings=JSON.parse(await readFile(path.join(root,'connection.json'),'utf8'));runnerServer(settings.server);
  if(settings.projects.some(p=>within(p.path,root)))throw new Error('OUTPUT_MUST_BE_OUTSIDE_PROJECT');
  const releaseLock=await listenerLock(root);
  const ledger=path.join(root,'pending.json');let stopping=false;let active;
  const stop=()=>{stopping=true;active?.abort();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
  signal?.addEventListener('abort',stop,{once:true});
  if(signal?.aborted)stop();
  const request=body=>requester(settings.server,settings.token,body);
  try {
    console.log('Ejecutor conectado. Solo ejecutará los proyectos y modelos registrados.');
    while(!stopping){
      let pending;
      try{pending=JSON.parse(await readFile(ledger,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
      if(pending){
        // A crash with no report is uncertain: reconcile, never run the job again.
        try{await request({action:'complete',jobId:pending.job.id,claimId:pending.job.claimId,...(pending.completion||{status:'interrupted',errorCode:'EXECUTOR_RESTARTED'})});await unlink(ledger);console.log('Resultado registrado.');}
        catch(error){if(['RUNNER_REVOKED','RUNNER_RESULT_REJECTED'].includes(error.message))throw error;console.log('Resultado pendiente; esperando conexión.');await pause(5000);}
        continue;
      }
      let job;
      try{job=(await request({action:'claim'})).job;}catch(error){if(['RUNNER_REVOKED','RUNNER_RESULT_REJECTED'].includes(error.message))throw error;console.log('Sin conexión; esperando para consultar trabajos.');await pause(5000);continue;}
      if(!job){await pause(3000);continue;}
      await atomicJson(ledger,{job});
      let completion;let heartbeat;let key;active=new AbortController();let sequence=0;let failures=0;let sending=false;let stage='preparing';
      const jobCancellation=active;
      const progress=async()=>{if(sending)return;sending=true;try{const result=await request({action:'progress',jobId:job.id,claimId:job.claimId,sequence:++sequence,stage});failures=0;if(result.cancel)jobCancellation.abort();}catch{if(++failures>=3)jobCancellation.abort();}finally{sending=false;}};
      try{
        const {project,model}=runnerJob(job,settings.projects);key=await runnerKey(model.keyFile);
        const output=path.join(root,'runs',job.id);await mkdir(path.dirname(output),{recursive:true,mode:0o700});
        await progress();heartbeat=setInterval(()=>{readFile(path.join(output,'status.json'),'utf8').then(raw=>{const current=JSON.parse(raw).state;if(current==='running'||current==='verifying')stage=current;}).catch(()=>{}).finally(progress);},10000);
        if(active.signal.aborted)throw new Error('RUN_INTERRUPTED');
        await prepare(project.path,output);
        const report=await run({output,prompt:job.prompt,provider:model.provider,model:model.model,key,testCommand:project.testCommand,dependencies:project.dependencies,signal:active.signal});
        completion={status:report.state,report:redactRunnerReport(report,[key,settings.token])};
      }catch(error){completion={status:active.signal.aborted?'interrupted':'failed',errorCode:/^[A-Z_]{1,80}$/.test(error.message)?error.message:'RUN_FAILED'};}
      finally{clearInterval(heartbeat);key=undefined;}
      // Persist delivery before sending; a dropped response cannot replay code.
      await atomicJson(ledger,{job,completion});
      try{await request({action:'complete',jobId:job.id,claimId:job.claimId,...completion});await unlink(ledger);console.log('Sesión finalizada: '+completion.status);}catch(error){console.log('Resultado preservado localmente; se reenviará al reconectar.');if(['RUNNER_REVOKED','RUNNER_RESULT_REJECTED'].includes(error.message))throw error;await pause(5000);}
    }
  }finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);signal?.removeEventListener('abort',stop);await releaseLock();}
}
