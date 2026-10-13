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
const pkg={name:'jetree-evaluation',version:'1.0.0',dependencies:{'is-number':'7.0.0'},scripts:{preinstall:'node -e "process.exit(99)"'}};
const dependency={version:'7.0.0',resolved:'https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz',integrity:'sha512-41Cifkg6e8TylSpdtTpeLVMqvSBEVzTttHvERD741+pnZ8ANv0004MRL43QKPDlK9cGvNp6NZWZUBlbGXYxxng=='};
await writeFile(path.join(project,'package.json'),JSON.stringify(pkg));
await writeFile(path.join(project,'package-lock.json'),JSON.stringify({name:pkg.name,version:pkg.version,lockfileVersion:3,requires:true,packages:{'':{name:pkg.name,version:pkg.version,dependencies:pkg.dependencies},'node_modules/is-number':dependency}}));
await writeFile(path.join(project,'dependency.test.cjs'),"const assert=require('node:assert/strict');const test=require('node:test');const isNumber=require('is-number');test('installed public dependency works',()=>assert.equal(isNumber(42),true));\n");
await writeFile(path.join(project,'human.txt'),'committed human content\n');
await command('git',['init',project]);await command('git',['-C',project,'add','.']);await command('git',['-C',project,'-c','user.name=CI','-c','user.email=ci@example.invalid','commit','-m','Fixture']);
await writeFile(path.join(project,'human.txt'),'uncommitted human edit preserved\n');
const output=path.join(root,'run');await prepare(project,output);
const fixture=path.join(path.dirname(fileURLToPath(import.meta.url)),'fixtures');
let checkedIsolation=false;
const execute=async(program,args,options)=>{
  if(program==='docker'&&args[0]==='rm'){
    const engine=args.find(value=>value.endsWith('-engine'));
    if(engine)console.log((await command('docker',['logs','--tail','60',engine]).catch(error=>error.output||'')).slice(-8000));
  }
  if(program==='docker' && args[0]==='run' && args.some(value=>value.endsWith('-broker'))){
    const image=args.indexOf('jetree-code:opencode-1.19.0');args=[...args.slice(0,image),'--mount',`type=bind,source=${fixture},target=/ci,readonly`,...args.slice(image,image+1),'node','/ci/provider.mjs'];
  }
  let result;
  try { result=await command(program,args,options); }
  catch(error){console.error('CI command failed: '+program+' '+args[0]);console.error(error.output?.slice(-3000)||error.message);throw error;}
  if(program==='docker'&&args[0]==='run'&&args.includes('--name')&&args[args.indexOf('--name')+1].endsWith('-engine')){
    const engine=args[args.indexOf('--name')+1];
    await command('docker',['exec',engine,'node','-e',`const fs=require('fs');if(process.env.JETREE_CODE_API_KEY)process.exit(1);if(fs.existsSync('/workspace/.env')||fs.existsSync('/var/run/docker.sock'))process.exit(2);try{fs.writeFileSync('/opt/jetree-code/host-escape','bad');process.exit(3)}catch{};fetch('https://example.com',{signal:AbortSignal.timeout(2000)}).then(()=>process.exit(4),()=>process.exit(0));`]);checkedIsolation=true;
    const raw=JSON.parse(await command('docker',['inspect',engine]))[0];assert.equal(raw.HostConfig.Privileged,false);assert.equal(raw.HostConfig.ReadonlyRootfs,true);assert.equal(raw.Config.User,`${process.getuid()}:${process.getgid()}`);assert.equal(raw.Mounts.filter(item=>item.Type==='bind').length,1);
    assert.equal(raw.Mounts.find(item=>item.Destination==='/workspace/node_modules').RW,false);
    await command('docker',['exec',engine,'node','-e',`const fs=require('fs');require('/workspace/node_modules/is-number');try{fs.writeFileSync('/workspace/node_modules/tampered','bad');process.exit(1)}catch{};`]);
    assert.ok(!raw.HostConfig.PortBindings || !Object.keys(raw.HostConfig.PortBindings).length);
  }
  return result;
};
try{
  const report=await runSandbox({output,prompt:'Fix sum.cjs so that adding 2 and 3 returns 5. Use bash to edit it.',provider:'groq',model:'jetree-ci',key:'synthetic-ci-no-provider-key',testCommand:'node --test',dependencies:'npm-ci',execute});
  assert.equal(report.state,'ready_for_review');assert.equal(report.verification.exitCode,0);assert.ok(report.files.some(file=>file.name==='sum.cjs'));assert.equal(await readFile(path.join(project,'sum.cjs'),'utf8'),'exports.sum=(a,b)=>a-b;\n');assert.ok(checkedIsolation);
  await assert.rejects(readFile(path.join(output,'broker.env')),/ENOENT/);await assert.rejects(readFile(path.join(output,'engine.env')),/ENOENT/);
  assert.equal(await readFile(path.join(project,'human.txt'),'utf8'),'uncommitted human edit preserved\n');
  assert.equal(await readFile(path.join(output,'workspace','human.txt'),'utf8'),'uncommitted human edit preserved\n');
  assert.deepEqual(report.files.map(file=>file.name),['sum.cjs']);
  console.log('PASS locked npm dependencies, disabled preinstall, readonly bounded dependency volume and preserved human changes');
  await assert.rejects(runSandbox({output,prompt:'repeat',provider:'groq',model:'jetree-ci',key:'synthetic',testCommand:'node --test'}),/RUN_ALREADY_STARTED/);
  console.log('PASS pinned OpenCode, authenticated transport, actual tool edit, independent tests, preserved source, no API key in sandbox, denied egress and readonly runtime');
}catch(error){console.error(error.message);console.error(error.output?.slice(-4000)||'');console.error(await readFile(path.join(output,'status.json'),'utf8'));throw error;}
