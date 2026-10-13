import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { atomicJson, listenerLock } from '../persistence.mjs';
import { engineFailure, failureCode } from '../diagnostics.mjs';
import { dependencyPolicy, validateNpmLock, verifyDependencyInputs } from '../dependencies.mjs';
import { command } from '../process.mjs';
import { hash } from '../workspace.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(),'jetree-recovery-'));
  t.after(() => rm(root,{recursive:true,force:true})); return root;
}
test('atomic ledger survives failed replacement and never exposes partial JSON', async t => {
  const root = await fixture(t); const file = path.join(root,'pending.json');
  await atomicJson(file,{completion:{status:'ready_for_review'}});
  await assert.rejects(atomicJson(file,{invalid:1n}));
  assert.equal(JSON.parse(await readFile(file,'utf8')).completion.status,'ready_for_review');
  await Promise.all(Array.from({length:20},(_,index) => atomicJson(file,{index,data:'x'.repeat(50000)})));
  assert.equal(JSON.parse(await readFile(file,'utf8')).data.length,50000);
});
test('listener excludes simultaneous owners and recovers after actual process termination', async t => {
  const root = await fixture(t);
  const module = new URL('../persistence.mjs',import.meta.url).href;
  const child = spawn(process.execPath,['--input-type=module','-e',`import {listenerLock} from ${JSON.stringify(module)};await listenerLock(process.argv[1]);console.log('locked');setInterval(()=>{},1000);`,root],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  t.after(() => child.kill());
  await new Promise((resolve,reject) => { child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(new Error('Child exited '+code))); });
  await assert.rejects(listenerLock(root),/RUNNER_ALREADY_LISTENING/);
  const closed = new Promise(resolve => child.once('exit',resolve));child.kill('SIGKILL');await closed;
  const release = await listenerLock(root);
  await assert.rejects(listenerLock(root),/RUNNER_ALREADY_LISTENING/);
  await release();
});
test('malformed and legacy locks are preserved rather than blindly stolen', async t => {
  const root = await fixture(t); await mkdir(path.join(root,'listener.lock'));await writeFile(path.join(root,'listener.lock','owner.json'),'broken');
  await assert.rejects(listenerLock(root),/RUNNER_LOCK_INVALID/);
  assert.equal(await readFile(path.join(root,'listener.lock','owner.json'),'utf8'),'broken');
});
test('engine failures keep only allowlisted diagnostics and distinguish empty and limited output', () => {
  const result = engineFailure({info:{error:{name:'APIError',data:{statusCode:401,responseBody:'private-key',headers:{Authorization:'secret'}}}},parts:[]});
  assert.equal(result.code,'PROVIDER_AUTH_FAILED'); assert.doesNotMatch(JSON.stringify(result),/private-key|secret|responseBody/);
  assert.equal(engineFailure({info:{finish:'length'},parts:[{type:'reasoning',text:'private'}]}).code,'ENGINE_OUTPUT_LIMIT');
  assert.equal(engineFailure({parts:[]}).code,'ENGINE_EMPTY_RESPONSE');
  assert.equal(engineFailure({parts:[{type:'text',text:'done'}]}),null);
  assert.equal(failureCode([{code:'PROVIDER_HTTP_ERROR',status:429}], 'ENGINE_TASK_FAILED'),'PROVIDER_RATE_LIMIT');
});
test('cancellation interrupts a running command instead of waiting for its timeout', async () => {
  const controller = new AbortController();
  const running = command(process.execPath,['-e','setInterval(()=>{},1000)'],{timeout:30000,signal:controller.signal});
  setTimeout(()=>controller.abort(),150);
  await assert.rejects(running,/RUN_INTERRUPTED/);
});
test('npm dependency policy rejects arbitrary sources, workspaces and changed captured inputs', async t => {
  const pkg = {dependencies:{'is-number':'7.0.0'}};
  const entry = {version:'7.0.0',resolved:'https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz',integrity:'sha512-'+'a'.repeat(86)+'=='};
  const lock = {lockfileVersion:3,packages:{'':pkg,'node_modules/is-number':entry}};
  validateNpmLock(pkg,lock); assert.equal(dependencyPolicy(undefined),'none'); assert.throws(()=>dependencyPolicy('shell'),/POLICY_INVALID/);
  for(const resolved of ['https://evil.invalid/x.tgz','file:/etc','https://registry.npmjs.org/x.tgz?token=secret','https://user:secret@registry.npmjs.org/x.tgz']) assert.throws(()=>validateNpmLock(pkg,{...lock,packages:{...lock.packages,'node_modules/is-number':{...entry,resolved}}}),/SOURCE_UNSUPPORTED/);
  assert.throws(()=>validateNpmLock({dependencies:{evil:'git+https://evil.invalid'}},lock),/SOURCE_UNSUPPORTED/);
  assert.throws(()=>validateNpmLock({...pkg,workspaces:['*']},lock),/LOCK_UNSUPPORTED/);
  const root = await fixture(t);await writeFile(path.join(root,'package.json'),'before');
  const hashes = {'package.json':hash(Buffer.from('before'))};await verifyDependencyInputs(root,hashes);await writeFile(path.join(root,'package.json'),'after');
  await assert.rejects(verifyDependencyInputs(root,hashes),/DEPENDENCY_INPUT_CHANGED/);
});
