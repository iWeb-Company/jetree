import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { command } from '../process.mjs';
import { prepare, changes, within, excluded } from '../workspace.mjs';
import { gateway, providerTarget } from '../gateway.mjs';
import { engineConfig, OpenCodeAdapter } from '../opencode.mjs';
import { isolationArgs, runSandbox } from '../sandbox.mjs';
import { options } from '../cli.mjs';

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
});
test('snapshot rejects output in the source and refuses to overwrite another run',async t=>{
  const f=await fixture(t);await assert.rejects(prepare(f.project,path.join(f.project,'run')),/OUTPUT_MUST_BE_OUTSIDE_PROJECT/);
  await prepare(f.project,f.output);await assert.rejects(prepare(f.project,f.output),/EEXIST/);
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
  const server=gateway({provider:'openrouter',key:'secret',token:'token',model:'demo',fetcher:async(_,options)=>{assert.equal(options.redirect,'error');return new Response('secret leaked here',{status:401});}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.close();server.closeAllConnections();});
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer token'},body:JSON.stringify({model:'demo',messages:[]})});assert.equal(response.status,502);assert.doesNotMatch(await response.text(),/secret/);
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
