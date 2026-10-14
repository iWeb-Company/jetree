// Explicit live-provider evaluation. Generates only synthetic code, never opens
// an existing user repository. Keys stay in a private local file.
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { command } from './process.mjs';
import { prepare, hash } from './workspace.mjs';
import { runSandbox } from './sandbox.mjs';
import { runnerKey } from './runner-client.mjs';

const [provider, keyFile, consent] = process.argv.slice(2);
if (!['groq','openrouter'].includes(provider) || !keyFile || consent !== '--allow-inference') throw new Error('EVALUATION_AUTHORIZATION_REQUIRED');
const model = provider === 'groq' ? 'openai/gpt-oss-20b' : 'openrouter/free';
const root = await mkdtemp(path.join(homedir(),'jetree-project-evaluation.'));
const project = path.join(root,'project'); await mkdir(project, {mode:0o700});
const pkg = { name:'jetree-checkout-evaluation',version:'1.0.0',dependencies:{'is-number':'7.0.0'} };
const dependency = {version:'7.0.0',resolved:'https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz',integrity:'sha512-41Cifkg6e8TylSpdtTpeLVMqvSBEVzTttHvERD741+pnZ8ANv0004MRL43QKPDlK9cGvNp6NZWZUBlbGXYxxng=='};
const files = {
  'package.json':JSON.stringify(pkg),
  'package-lock.json':JSON.stringify({name:pkg.name,version:pkg.version,lockfileVersion:3,requires:true,packages:{'':{name:pkg.name,version:pkg.version,dependencies:pkg.dependencies},'node_modules/is-number':dependency}}),
  'checkout.cjs':`const isNumber = require('is-number');
exports.checkout = (items, discount = 0) => {
  if (!Array.isArray(items) || !Number.isInteger(discount) || discount < 0 || discount > 100) throw new Error('Invalid cart');
  const subtotal = items.reduce((total, item) => {
    if (!isNumber(item.priceCents) || !Number.isInteger(item.priceCents) || item.priceCents < 0 || !Number.isInteger(item.quantity) || item.quantity < 1) throw new Error('Invalid item');
    return total + item.priceCents * item.quantity;
  }, 0);
  return Math.round(subtotal * (100 + discount) / 100);
};
`,
  'cli.cjs':`const {checkout} = require('./checkout.cjs');process.stdout.write(String(checkout(JSON.parse(process.argv[2]),Number(process.argv[3]))));\n`,
  'checkout.test.cjs':`const test=require('node:test');const assert=require('node:assert/strict');const {execFileSync}=require('node:child_process');const {checkout}=require('./checkout.cjs');
test('multiple items and a discount',()=>assert.equal(checkout([{priceCents:1000,quantity:2},{priceCents:500,quantity:1}],20),2000));
test('zero discount',()=>assert.equal(checkout([{priceCents:599,quantity:3}]),1797));
test('full discount',()=>assert.equal(checkout([{priceCents:500,quantity:1}],100),0));
test('round cents',()=>assert.equal(checkout([{priceCents:999,quantity:1}],15),849));
test('empty cart',()=>assert.equal(checkout([],10),0));
test('reject invalid items',()=>assert.throws(()=>checkout([{priceCents:-10,quantity:1}],10)));
test('CLI integration',()=>assert.equal(execFileSync(process.execPath,['cli.cjs','[{"priceCents":1000,"quantity":2}]','10'],{encoding:'utf8'}),'1800'));
`,
  'human-notes.txt':'committed notes\n'
};
for (const [name, data] of Object.entries(files)) await writeFile(path.join(project,name),data,{mode:0o600});
await command('git',['init',project]);await command('git',['-C',project,'add','.']);await command('git',['-C',project,'-c','user.name=Evaluation','-c','user.email=evaluation@example.invalid','commit','-m','Synthetic checkout']);
await writeFile(path.join(project,'human-notes.txt'),'uncommitted human work - preserve\n');
const output=path.join(root,'run');await prepare(project,output);
try {
  const key = await runnerKey(keyFile);
  const report = await runSandbox({output,provider,model,key,dependencies:'npm-ci',testCommand:'node --test',prompt:'Fix the percentage discount bug in checkout.cjs. Keep item validation and cents rounding. Read the tests, do not modify them or package files. Preserve human-notes.txt. Run node --test and explain the fix.'});
  for (const [name, data] of Object.entries(files)) {
    const expected = name === 'human-notes.txt' ? 'uncommitted human work - preserve\n' : data;
    if (hash(await readFile(path.join(project,name))) !== hash(Buffer.from(expected))) throw new Error('EVALUATION_SOURCE_CHANGED');
    if (name !== 'checkout.cjs' && hash(await readFile(path.join(output,'workspace',name))) !== hash(Buffer.from(expected))) throw new Error('EVALUATION_UNEXPECTED_CHANGE');
  }
  console.log(JSON.stringify({provider,model,state:report.state,files:report.files.map(file=>file.name),testsExitCode:report.verification.exitCode,sourcePreserved:true,testsUnchanged:true,report:path.join(output,'report.json')},null,2));
  if(report.state !== 'ready_for_review') process.exitCode=1;
} catch {
  console.log(await readFile(path.join(output,'status.json'),'utf8'));console.log('Evaluación preservada: '+root);process.exitCode=1;
}
