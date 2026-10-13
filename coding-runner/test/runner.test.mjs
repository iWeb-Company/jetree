import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { command } from '../process.mjs';
import { prepare, changes, within, excluded } from '../workspace.mjs';
import { gateway, providerTarget, groqMessages, errorCategory } from '../gateway.mjs';
import { engineConfig, OpenCodeAdapter } from '../opencode.mjs';
import { isolationArgs, runSandbox, providerDiagnostics } from '../sandbox.mjs';
import { options } from '../cli.mjs';
import { ensurePrivateDirectory } from '../private-directory.mjs';
import { doctor } from '../doctor.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(),'jetree-code-')); t.after(()=>rm(root,{recursive:true,force:true}));
  const project = path.join(root,'project'); await mkdir(project);
  await command('git',['init',project]); await writeFile(path.join(project,'sum.cjs'),'exports.sum=(a,b)=>a-b;\n');
  await writeFile(path.join(project,'.env'),'PRIVATE=never-copy'); await writeFile(path.join(project,'private.txt'),'sk-proj-'+'x'.repeat(35));
  await command('git',['-C',project,'add','.']); await command('git',['-C',project,'-c','user.name=CI','-c','user.email=ci@example.invalid','commit','-m','Fixture']);
  return { root, project, output: path.join(root,'run') };
}
test('snapshot preserves dirty source, excludes credentials and ignores untracked files',async t=>{
  const f=await fixture(t); await writeFile(path.join(f.project,'sum.cjs'),'human dirty edit'); await writeFile(path.join(f.project,'untracked.txt'),'private');
  const result=await prepare(f.project,f.output); assert.equal(result.files,1);assert.deepEqual(result.skipped,['.env','private.txt']);
  await writeFile(path.join(f.output,'workspace','sum.cjs'),'agent edit');await writeFile(path.join(f.output,'workspace','new.txt'),'new');
  assert.equal(await readFile(path.join(f.project,'sum.cjs'),'utf8'),'human dirty edit');
  assert.deepEqual((await changes(f.output)).map(item=>[item.name,item.status]),[['sum.cjs','modified'],['new.txt','added']]);
  await writeFile(path.join(f.project,'sum.cjs'),'later human edit');
  const patches=await changes(f.output,true);assert.match(patches[0].diff,/-human dirty edit/);assert.match(patches[0].diff,/\+agent edit/);assert.doesNotMatch(patches[0].diff,/later human/);
  assert.match(patches[1].diff,/--- \/dev\/null/);
  await writeFile(path.join(f.output,'baseline','sum.cjs'),'tampered');await assert.rejects(changes(f.output,true),/BASELINE_CHANGED/);
});
test('snapshot rejects output in the source and refuses to overwrite another run',async t=>{
  const f=await fixture(t);await assert.rejects(prepare(f.project,path.join(f.project,'run')),/OUTPUT_MUST_BE_OUTSIDE_PROJECT/);
  await prepare(f.project,f.output);await assert.rejects(prepare(f.project,f.output),/EEXIST/);
});
test('snapshot rejects an output parent alias that resolves inside the source',async t=>{
  const f=await fixture(t);const alias=path.join(f.root,'source-alias');await symlink(f.project,alias,process.platform==='win32'?'junction':'dir');
  await assert.rejects(prepare(f.project,path.join(alias,'run')),/OUTPUT_MUST_BE_OUTSIDE_PROJECT/);
  await assert.rejects(stat(path.join(f.project,'run')),/ENOENT/);
});
test('snapshot rejects tracked symlink/junction escapes before creating any output',async t=>{
  const f=await fixture(t);const external=path.join(f.root,'outside');await mkdir(external);await writeFile(path.join(external,'private.txt'),'do not read');
  if(process.platform==='win32')await symlink(external,path.join(f.project,'linked'),'junction');else await symlink(path.join(external,'private.txt'),path.join(f.project,'linked'));
  // Junction children are normal index entries on Windows; the ancestor is checked.
  await command('git',['-C',f.project,'add','linked']);await assert.rejects(prepare(f.project,f.output),/LINK_NOT_ALLOWED/);
});
test('result scanner refuses symlink escapes and reports deleted files',async t=>{
  const f=await fixture(t);await prepare(f.project,f.output);await rm(path.join(f.output,'workspace','sum.cjs'));
  assert.equal((await changes(f.output))[0].status,'deleted');
  await symlink(f.project,path.join(f.output,'workspace','linked'),process.platform==='win32'?'junction':'dir');await assert.rejects(changes(f.output),/LINK_NOT_ALLOWED/);
});
test('path and CLI validation rejects traversal, duplicate switches and implicit inference',()=>{
  assert.equal(within('/workspace','/workspace-other/file'),false);assert.equal(excluded('src/.env.production'),true);assert.equal(excluded('.opencode/plugins/tool.js'),true);
  assert.throws(()=>options(['--output','a','--output','b']),/CLI_ARGUMENT_INVALID/);assert.throws(()=>options(['--secret','a']),/CLI_ARGUMENT_INVALID/);
  assert.throws(()=>engineConfig('../model','token'),/MODEL_INVALID/);assert.throws(()=>new OpenCodeAdapter('https://example.com','secret'),/ENGINE_ENDPOINT_INVALID/);
});
test('sandbox cannot silently run edited snapshots, preventing stale verification',async t=>{
  const f=await fixture(t);await prepare(f.project,f.output);await writeFile(path.join(f.output,'workspace','sum.cjs'),'changed');let calls=0;
  await assert.rejects(runSandbox({output:f.output,prompt:'test',provider:'groq',model:'demo',key:'synthetic-key',testCommand:'node --test',execute:async()=>{calls++;}}),/SNAPSHOT_CHANGED/);assert.equal(calls,0);
});
test('gateway authenticates, pins destination/model, strips arbitrary parameters and limits calls',async t=>{
  const calls=[];const server=gateway({provider:'groq',key:'private-upstream-key',token:'sandbox-token',model:'demo',limit:1,fetcher:async(url,options)=>{calls.push({url,options});return Response.json({choices:[]});}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.close();server.closeAllConnections();});
  const url='http://127.0.0.1:'+server.address().port;const send=(endpoint,body,token='sandbox-token')=>fetch(url+endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await send('/v1/chat/completions',{model:'demo',messages:[]},'wrong')).status,401);
  assert.equal((await send('/arbitrary-url',{model:'demo',messages:[]})).status,403);
  assert.equal((await send('/v1/chat/completions',{model:'other',messages:[]})).status,400);
  assert.equal((await send('/v1/chat/completions',{model:'demo',messages:[{role:'user',content:'hi'}],baseURL:'https://evil.invalid',max_tokens:999999})).status,200);
  assert.equal(calls[0].url,providerTarget('groq'));const body=JSON.parse(calls[0].options.body);assert.equal(body.baseURL,undefined);assert.equal(body.max_tokens,4096);assert.equal(calls[0].options.headers.Authorization,'Bearer private-upstream-key');
  assert.equal((await send('/v1/chat/completions',{model:'demo',messages:[]})).status,429);
});
test('gateway does not expose upstream authentication errors or follow redirects',async t=>{
  const events=[];
  const server=gateway({provider:'openrouter',key:'secret',token:'token',model:'demo',onDiagnostic:event=>events.push(event),fetcher:async(_,options)=>{assert.equal(options.redirect,'error');return new Response('secret leaked here',{status:401});}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.close();server.closeAllConnections();});
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer token'},body:JSON.stringify({model:'demo',messages:[]})});assert.equal(response.status,502);assert.doesNotMatch(await response.text(),/secret/);
  assert.deepEqual(events,[{code:'PROVIDER_HTTP_ERROR',status:401,category:'UNKNOWN'}]);
});

test('provider diagnostics retain only bounded codes and HTTP statuses, never arbitrary log fields',()=>{
  const logs=['secret raw error','JETREE_DIAGNOSTIC '+JSON.stringify({code:'PROVIDER_HTTP_ERROR',status:429,key:'private-key',body:'private-body'}),'JETREE_DIAGNOSTIC {broken','JETREE_DIAGNOSTIC '+JSON.stringify({code:'arbitrary-private-message',status:401}),'JETREE_DIAGNOSTIC '+JSON.stringify({code:'PROVIDER_TRANSPORT_ERROR',message:'private-detail'})].join('\n');
  assert.deepEqual(providerDiagnostics(logs),[{code:'PROVIDER_HTTP_ERROR',status:429},{code:'PROVIDER_TRANSPORT_ERROR'}]);
  assert.equal(providerDiagnostics(Array(20).fill('JETREE_DIAGNOSTIC {"code":"PROVIDER_HTTP_ERROR","status":413}').join('\n')).length,10);
});

test('Groq message adapter removes engine metadata, keeps tool references and rejects non-text parts',async()=>{
  assert.deepEqual(groqMessages([{role:'system',content:[{type:'text',text:'instructions',cache_control:{type:'ephemeral'}}],reasoning:'metadata'},{role:'assistant',content:null,tool_calls:[{id:'call_1',type:'function',function:{name:'bash',arguments:'{}'}}],reasoning_content:'private'},{role:'tool',content:'done',tool_call_id:'call_1'}]),[{role:'system',content:'instructions'},{role:'assistant',content:null,tool_calls:[{id:'call_1',type:'function',function:{name:'bash',arguments:'{}'}}]},{role:'tool',content:'done',tool_call_id:'call_1'}]);
  assert.throws(()=>groqMessages([{role:'user',content:[{type:'image_url',image_url:{url:'private'}}]}]),/GROQ_TEXT_ONLY/);
  assert.equal(await errorCategory(Response.json({error:{code:'tool_use_failed',message:'private details'}})),'TOOL_GENERATION_FAILED');
  assert.equal(await errorCategory(Response.json({error:{message:'messages cache_control unsupported private'}})),'CACHE_CONTROL_UNSUPPORTED');
});
test('OpenCode adapter uses authenticated loopback, actual model and bounded routes',async()=>{
  const calls=[];const adapter=new OpenCodeAdapter('http://127.0.0.1:4096','private',async(url,options)=>{calls.push({url,options});return Response.json({id:'ses_Test123'});});
  assert.equal(await adapter.start(),'ses_Test123');await adapter.message('ses_Test123','fix','demo');
  assert.equal(JSON.parse(calls[1].options.body).model.modelID,'demo');assert.equal(calls[0].options.redirect,'error');await assert.rejects(adapter.request('/session/../auth'),/ENGINE_ROUTE_INVALID/);
});
test('container policy mounts no host root or Docker socket and requires resource limits',()=>{
  const args=isolationArgs({name:'test',network:'internal',uid:1001,gid:1001});
  assert.ok(args.includes('--read-only'));assert.ok(args.includes('no-new-privileges:true'));assert.ok(args.includes('ALL'));assert.ok(args.includes('--pids-limit'));assert.ok(args.includes('--memory'));assert.ok(args.includes('--cpus'));assert.ok(args.includes('1001:1001'));assert.ok(!args.includes('--privileged'));
  const config=engineConfig('demo','token');assert.equal(config.permission.external_directory,'deny');assert.equal(config.share,'disabled');assert.deepEqual(config.enabled_providers,['jetree']);
});

test('private directory protects existing and new credential files with actual OS permissions',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'jetree-private-'));t.after(()=>rm(root,{recursive:true,force:true}));
  if(process.platform==='win32'){
    const widen=`$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';$dir=[System.IO.DirectoryInfo]::new($env:JETREE_CODE_PRIVATE_DIRECTORY);$acl=$dir.GetAccessControl();$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-1-0'),'ReadAndExecute','ContainerInherit,ObjectInherit','None','Allow'));$dir.SetAccessControl($acl)`;
    await command('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(widen,'utf16le').toString('base64')],{env:{JETREE_CODE_PRIVATE_DIRECTORY:root}});
  }
  await writeFile(path.join(root,'existing.env'),'synthetic-secret');await ensurePrivateDirectory(root);await writeFile(path.join(root,'new.env'),'synthetic-secret');
  if(process.platform==='win32'){
    const check=`$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';$allowed=@([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18','S-1-5-32-544');foreach($name in @('existing.env','new.env')){foreach($rule in [System.IO.FileInfo]::new([System.IO.Path]::Combine($env:JETREE_CODE_PRIVATE_DIRECTORY,$name)).GetAccessControl().GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){if($rule.AccessControlType -eq 'Allow' -and $allowed -notcontains $rule.IdentityReference.Value){throw 'PRIVATE_FILE_FAILED'}}};'private-files-ok'`;
    assert.match(await command('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(check,'utf16le').toString('base64')],{env:{JETREE_CODE_PRIVATE_DIRECTORY:root}}),/private-files-ok/);
  }else assert.equal((await stat(root)).mode&0o077,0);
});
test('private directory rejects symlinks/junctions rather than changing another folder permissions',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'jetree-private-link-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const target=path.join(root,'target');await mkdir(target);const link=path.join(root,'link');await symlink(target,link,process.platform==='win32'?'junction':'dir');
  await assert.rejects(ensurePrivateDirectory(link),/PRIVATE_DIRECTORY_REQUIRED/);
});
test('doctor distinguishes missing CLI, inactive engine, backend and image without exposing errors',async()=>{
  for(const [scenario,expected] of [['missing','docker_cli_missing'],['engine','docker_engine_unavailable'],['windows','linux_backend_required'],['image','image_missing'],['ready','ready']]){
    const result=await doctor(async(program,args)=>{
      if(program==='git')return 'git';
      if(scenario==='missing'){const error=new Error('private detail');error.code='ENOENT';throw error;}
      if(scenario==='engine')throw new Error('private detail');
      if(args[0]==='info')return scenario==='windows'?'windows':'linux';
      if(scenario==='image')throw new Error('private detail');return 'image';
    });
    assert.equal(result.status,expected);assert.doesNotMatch(JSON.stringify(result),/private detail/);
  }
});
test('command keeps diagnostic stderr out of structured stdout while preserving failures',async()=>{
  assert.equal(await command(process.execPath,['-e',`process.stderr.write('diagnostic warning');process.stdout.write('linux\\n')`]),'linux\n');
  await assert.rejects(command(process.execPath,['-e',`process.stderr.write('failure detail');process.exitCode=1`]),error=>error.exitCode===1&&error.output==='failure detail');
});
