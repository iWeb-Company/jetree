import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runnerServer,runnerRequest,runnerJob,runnerKey,redactRunnerReport,connectRunner,listenRunner } from '../runner-client.mjs';
import { command } from '../process.mjs';
test('runner identity never follows redirects or accepts remote insecure origins',async()=>{
  for(const url of ['http://example.com','https://user:secret@example.com','https://example.com/path','https://example.com?secret=x'])assert.throws(()=>runnerServer(url));
  assert.equal(runnerServer('https://jetree.example'),'https://jetree.example');
  await runnerRequest('https://jetree.example','synthetic',{action:'claim'},async(url,options)=>{assert.equal(url,'https://jetree.example/api/coding-runner');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer synthetic');return Response.json({job:null});});
  await assert.rejects(runnerRequest('https://jetree.example','synthetic',{},async()=>new Response('private detail',{status:401})),/RUNNER_REVOKED/);
});
test('remote jobs cannot select paths, commands, keys or unregistered models',()=>{
  const projects=[{id:'11111111-1111-1111-1111-111111111111',path:'/authorized',testCommand:'node --test',dependencies:'none',models:[{provider:'groq',model:'fixed',keyFile:'/private'}]}];
  const job={id:'22222222-2222-2222-2222-222222222222',claimId:'33333333-3333-3333-3333-333333333333',projectId:projects[0].id,prompt:'fix',provider:'groq',model:'fixed',path:'/etc',testCommand:'evil',keyFile:'/etc'};
  assert.equal(runnerJob(job,projects).project.path,'/authorized');assert.equal(runnerJob(job,projects).project.testCommand,'node --test');
  assert.equal(runnerJob({...job,dependencies:'npm-ci'},projects).project.dependencies,'none');
  assert.throws(()=>runnerJob({...job,model:'other'},projects),/NOT_AUTHORIZED/);
  assert.throws(()=>runnerJob({...job,projectId:'unknown'},projects),/NOT_AUTHORIZED/);
});
test('private key files accept BOM/CRLF without leaking key contents and reject public files',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'jetree-key-'));t.after(()=>rm(root,{recursive:true,force:true}));const file=path.join(root,'key');
  await writeFile(file,'\uFEFFsynthetic-key\r\n',{mode:0o600});assert.equal(await runnerKey(file),'synthetic-key');
  const report={state:'ready_for_review',files:[{name:'file',status:'modified',diff:'synthetic-key'}],summary:'synthetic-key',verification:{command:'node --test',exitCode:0,output:'synthetic-key'}};
  assert.doesNotMatch(JSON.stringify(redactRunnerReport(report,['synthetic-key'])),/synthetic-key/);
  if(process.platform!=='win32'){const {chmod}=await import('node:fs/promises');await chmod(file,0o644);await assert.rejects(runnerKey(file),/PRIVATE_REQUIRED/);}
});
test('Jetree connections require explicit local opt-in and cannot change execution scope',()=>{
 const project={id:'11111111-1111-4111-8111-111111111111',path:'/authorized',testCommand:'node --test',models:[],jetreeModels:true};
 const job={id:'22222222-2222-4222-8222-222222222222',claimId:'33333333-3333-4333-8333-333333333333',projectId:project.id,prompt:'fix',provider:'gemini',model:'chosen',source:'jetree',inferenceToken:'jci_'+ 'a'.repeat(150),path:'/etc',testCommand:'evil'};
 assert.equal(runnerJob(job,[project]).project.path,'/authorized');
 assert.equal(runnerJob(job,[project]).project.testCommand,'node --test');
 assert.throws(()=>runnerJob(job,[{...project,jetreeModels:false}]),/NOT_AUTHORIZED/);
 assert.throws(()=>runnerJob({...job,provider:'arbitrary'},[project]),/NOT_AUTHORIZED/);
 assert.throws(()=>runnerJob({...job,inferenceToken:'provider-key'},[project]),/NOT_AUTHORIZED/);
});

test('pairing sends no paths or keys and a lost completion response never repeats code',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'jetree-worker-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const {mkdir,readFile}=await import('node:fs/promises');const project=path.join(root,'project');await mkdir(project);await writeFile(path.join(project,'sum.js'),'sum');
  await command('git',['init',project]);await command('git',['-C',project,'add','.']);await command('git',['-C',project,'-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','Fixture']);
  const keyFile=path.join(root,'key');await writeFile(keyFile,'synthetic-api-key',{mode:0o600});
  const config=path.join(root,'config.json');await writeFile(config,JSON.stringify({name:'test',projects:[{localId:'demo',name:'demo',path:project,testCommand:'node --test',models:[{provider:'groq',model:'fixed',keyFile}]}]}));
  const connection=path.join(root,'connection');const projectId='11111111-1111-1111-1111-111111111111';
  await connectRunner({server:'https://jetree.example',code:'a'.repeat(32),config,connection,request:async(_,token,body)=>{assert.equal(token,null);assert.doesNotMatch(JSON.stringify(body),/synthetic-api-key|keyFile/);assert.equal(body.projects[0].path,undefined);return {token:'jcr_'+'a'.repeat(43),projects:[{id:projectId,local_id:'demo'}]};}});
  let executions=0;let completions=0;let claims=0;const stop=new AbortController();
  const job={id:'22222222-2222-2222-2222-222222222222',claimId:'33333333-3333-3333-3333-333333333333',projectId,prompt:'fix',provider:'groq',model:'fixed'};
  await listenRunner({connection,signal:stop.signal,requester:async(_,token,body)=>{
    assert.equal(token,'jcr_'+'a'.repeat(43));
    if(body.action==='claim'){claims++;return {job};}
    if(body.action==='progress')return {cancel:false};
    if(body.action==='complete'){completions++;assert.doesNotMatch(JSON.stringify(body),/synthetic-api-key/);if(completions===1)throw new Error('lost response');stop.abort();return {ok:true};}
    throw new Error('Unexpected request');
  },run:async()=>{executions++;return {state:'ready_for_review',files:[],summary:'synthetic-api-key',verification:{command:'node --test',exitCode:0,output:'passed'}};}});
  assert.equal(executions,1);assert.equal(claims,1);assert.equal(completions,2);await assert.rejects(readFile(path.join(connection,'pending.json')),/ENOENT/);
  // A persisted claim without a report is reconciled as interrupted, not run.
  await writeFile(path.join(connection,'pending.json'),JSON.stringify({job}),{mode:0o600});const restarted=new AbortController();
  await listenRunner({connection,signal:restarted.signal,requester:async(_,__,body)=>{assert.equal(body.action,'complete');assert.equal(body.status,'interrupted');restarted.abort();return {ok:true};},run:async()=>{throw new Error('Must not rerun');}});
});
