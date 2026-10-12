import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { command } from '../process.mjs';
import { prepare } from '../workspace.mjs';
import { runSandbox } from '../sandbox.mjs';
assert.equal(process.env.CI,'true');assert.equal(process.platform,'linux');
const root=await mkdtemp(path.join(tmpdir(),'jetree-coding-ci-'));const project=path.join(root,'project');await mkdir(project);
await writeFile(path.join(project,'sum.cjs'),'exports.sum=(a,b)=>a-b;\n');await writeFile(path.join(project,'sum.test.cjs'),"const assert=require('node:assert/strict');const test=require('node:test');const {sum}=require('./sum.cjs');test('adds correctly',()=>assert.equal(sum(2,3),5));\n");
await writeFile(path.join(project,'.env'),'CI_HOST_SECRET=never-copy');
await command('git',['init',project]);await command('git',['-C',project,'add','.']);await command('git',['-C',project,'-c','user.name=CI','-c','user.email=ci@example.invalid','commit','-m','Fixture']);
const output=path.join(root,'run');await prepare(project,output);
const fixture=path.join(path.dirname(fileURLToPath(import.meta.url)),'fixtures');
let checkedIsolation=false;
const execute=async(program,args,options)=>{
  if(program==='docker' && args[0]==='run' && args.some(value=>value.endsWith('-broker'))){
    const image=args.indexOf('jetree-code:opencode-1.19.0');args=[...args.slice(0,image),'--mount',`type=bind,source=${fixture},target=/ci,readonly`,...args.slice(image,image+1),'node','/ci/provider.mjs'];
  }
  const result=await command(program,args,options);
  if(program==='docker'&&args[0]==='run'&&args.includes('--name')&&args[args.indexOf('--name')+1].endsWith('-engine')){
    const engine=args[args.indexOf('--name')+1];
    await command('docker',['exec',engine,'node','-e',`const fs=require('fs');if(process.env.JETREE_CODE_API_KEY)process.exit(1);if(fs.existsSync('/workspace/.env')||fs.existsSync('/var/run/docker.sock'))process.exit(2);try{fs.writeFileSync('/opt/jetree-code/host-escape','bad');process.exit(3)}catch{};fetch('https://example.com',{signal:AbortSignal.timeout(2000)}).then(()=>process.exit(4),()=>process.exit(0));`]);checkedIsolation=true;
    const raw=JSON.parse(await command('docker',['inspect',engine]))[0];assert.equal(raw.HostConfig.Privileged,false);assert.equal(raw.HostConfig.ReadonlyRootfs,true);assert.equal(raw.Config.User,`${process.getuid()}:${process.getgid()}`);assert.equal(raw.Mounts.filter(item=>item.Type==='bind').length,1);
    assert.ok(!raw.HostConfig.PortBindings || !Object.keys(raw.HostConfig.PortBindings).length);
  }
  return result;
};
try{
  const report=await runSandbox({output,prompt:'Fix sum.cjs so that adding 2 and 3 returns 5. Use bash to edit it.',provider:'groq',model:'jetree-ci',key:'synthetic-ci-no-provider-key',testCommand:'node --test',execute});
  assert.equal(report.state,'ready_for_review');assert.equal(report.verification.exitCode,0);assert.ok(report.files.some(file=>file.name==='sum.cjs'));assert.equal(await readFile(path.join(project,'sum.cjs'),'utf8'),'exports.sum=(a,b)=>a-b;\n');assert.ok(checkedIsolation);
  await assert.rejects(readFile(path.join(output,'broker.env')),/ENOENT/);await assert.rejects(readFile(path.join(output,'engine.env')),/ENOENT/);
  await assert.rejects(runSandbox({output,prompt:'repeat',provider:'groq',model:'jetree-ci',key:'synthetic',testCommand:'node --test'}),/RUN_ALREADY_STARTED/);
  console.log('PASS pinned OpenCode, authenticated transport, actual tool edit, independent tests, preserved source, no API key in sandbox, denied egress and readonly runtime');
}catch(error){console.error(error.message);console.error(error.output?.slice(-4000)||'');console.error(await readFile(path.join(output,'status.json'),'utf8'));throw error;}
