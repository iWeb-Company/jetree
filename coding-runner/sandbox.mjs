import { randomBytes } from 'node:crypto';
import { readFile, writeFile, unlink, realpath } from 'node:fs/promises';
import path from 'node:path';
import { command } from './process.mjs';
import { changes } from './workspace.mjs';
import { engineConfig, OpenCodeAdapter } from './opencode.mjs';
import { providerTarget } from './gateway.mjs';
import { ensurePrivateDirectory } from './private-directory.mjs';
import { atomicJson } from './persistence.mjs';
import { engineFailure, failureCode } from './diagnostics.mjs';
import { dependencyPolicy, prepareDependencies, verifyDependencyInputs } from './dependencies.mjs';
import {activityCollector,eventReaderScript,redactActivity} from './activity.mjs';
import {StringDecoder} from 'node:string_decoder';

export const IMAGE = 'jetree-code:opencode-1.19.0';
export function isolationArgs({ name, network, uid = 1000, gid = 1000 }) {
  return ['run', '-d', '--init', '--name', name, '--network', network, '--user', `${uid}:${gid}`, '--env', 'HOME=/home/node', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--pids-limit', '128', '--memory', '2g', '--cpus', '2', '--tmpfs', '/tmp:rw,nosuid,nodev,size=256m', '--tmpfs', `/home/node/.local:rw,nosuid,nodev,size=128m,uid=${uid},gid=${gid},mode=0700`, '--tmpfs', `/home/node/.config:rw,nosuid,nodev,size=16m,uid=${uid},gid=${gid},mode=0700`];
}
const envLine = (key, value) => { if (typeof value !== 'string' || /[\r\n\0]/.test(value)) throw new Error('ENV_INVALID'); return `${key}=${value}`; };
export async function runSandbox({ output, prompt, provider, model, key, testCommand, dependencies, execute = command, signal, proxyUrl, onActivity }) {
  const policy = dependencyPolicy(dependencies);
  if(!proxyUrl)providerTarget(provider); engineConfig(model, 'validate');
  if (!key || /[\r\n\0]/.test(key) || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 8000 || typeof testCommand !== 'string' || !testCommand.trim() || testCommand.length > 1000) throw new Error('RUN_INPUT_INVALID');
  const root = await realpath(output); const workspace = await realpath(path.join(root, 'workspace'));
  if (workspace !== path.join(root, 'workspace') || /[,\r\n]/.test(workspace)) throw new Error('WORKSPACE_INVALID');
  const status = JSON.parse(await readFile(path.join(root, 'status.json'), 'utf8'));
  if (status.state !== 'prepared') throw new Error('RUN_ALREADY_STARTED');
  // Verify captured inputs have not changed before any code is executed.
  if ((await changes(root)).length) throw new Error('SNAPSHOT_CHANGED');
  await ensurePrivateDirectory(root);
  await execute('docker', ['info', '--format', '{{.OSType}}']).then(value => { if (value.trim() !== 'linux') throw new Error('LINUX_DOCKER_REQUIRED'); });
  await execute('docker', ['image', 'inspect', IMAGE]);
  await writeFile(path.join(root, 'run.lock'), '', { flag: 'wx', mode: 0o600 });
  const id = 'jetree-code-' + randomBytes(8).toString('hex');
  const net = id + '-private'; const broker = id + '-broker'; const engine = id + '-engine';
  const gatewayToken = randomBytes(32).toString('base64url'); const password = randomBytes(32).toString('base64url');
  const emitActivity=event=>onActivity?.({...event,label:redactActivity(event.label,[key,password,gatewayToken]),...(event.output?{output:redactActivity(event.output,[key,password,gatewayToken])}:{})});
  const brokerEnv = path.join(root, 'broker.env'); const engineEnv = path.join(root, 'engine.env');
  const save = data => atomicJson(path.join(root, 'status.json'), data);
  const cancellation = new AbortController();
  const activityStop=new AbortController();let activityTask;
  let interrupted = false; let session; let adapter; let resourcesStarted = false; let dependencyResult; let engineDiagnostic;
  const interrupt = () => { interrupted = true; cancellation.abort(); if (session && adapter) adapter.abort(session).catch(() => {}); };
  signal?.addEventListener('abort',interrupt,{once:true});
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  try {
    if (signal?.aborted) interrupt();
    if (interrupted) throw new Error('RUN_INTERRUPTED');
    await save({ state: 'starting', startedAt: new Date().toISOString() });
    if (policy === 'npm-ci') dependencyResult = await prepareDependencies({ root, workspace, id, execute, signal: cancellation.signal });
    if (interrupted) throw new Error('RUN_INTERRUPTED');
    await writeFile(brokerEnv, [envLine('JETREE_CODE_PROVIDER', provider), envLine('JETREE_CODE_MODEL', model), envLine('JETREE_CODE_API_KEY', key), envLine('JETREE_CODE_GATEWAY_TOKEN', gatewayToken),...(proxyUrl?[envLine('JETREE_CODE_PROXY_URL',proxyUrl)]:[])].join('\n'), { mode: 0o600, flag: 'wx' });
    await writeFile(engineEnv, [envLine('OPENCODE_SERVER_PASSWORD', password), envLine('OPENCODE_CONFIG_CONTENT', JSON.stringify(engineConfig(model, gatewayToken)))].join('\n'), { mode: 0o600, flag: 'wx' });
    await execute('docker', ['network', 'create', '--internal', net]); resourcesStarted = true;
    await execute('docker', [...isolationArgs({ name: broker, network: 'bridge' }), '--env-file', brokerEnv, IMAGE, 'node', '/opt/jetree-code/gateway.mjs']);
    await execute('docker', ['network', 'connect', '--alias', 'broker', net, broker]);
    await execute('docker', [...isolationArgs({ name: engine, network: net, uid: process.getuid?.() || 1000, gid: process.getgid?.() || 1000 }), '--env-file', engineEnv, '--mount', `type=bind,source=${workspace},target=/workspace`, ...(dependencyResult ? ['--mount',`type=volume,source=${dependencyResult.volume},target=/workspace/node_modules,readonly`] : []), IMAGE]);
    if (dependencyResult) await execute('docker', ['rm','-f',dependencyResult.container]);
    // Keep the API entirely inside the container; no host port is published.
    // Docker exec transports a bounded HTTP result, never a shell interpolation.
    const transport = async (url, options) => {
      const timeout = new URL(url).pathname.endsWith('/message') ? 240000 : 10000;
      const input = Buffer.from(JSON.stringify({ path: new URL(url).pathname, method: options.method, body: options.body, timeout })).toString('base64');
      const script = `const input=JSON.parse(Buffer.from(process.argv[1],'base64'));fetch('http://127.0.0.1:4096'+input.path,{method:input.method,headers:{Authorization:'Basic '+Buffer.from('opencode:'+process.env.OPENCODE_SERVER_PASSWORD).toString('base64'),'Content-Type':'application/json'},body:input.body,redirect:'error',signal:AbortSignal.timeout(input.timeout)}).then(async r=>console.log(JSON.stringify({status:r.status,body:await r.text()}))).catch(()=>process.exit(1));`;
      const result = JSON.parse(await execute('docker', ['exec', engine, 'node', '-e', script, input], { timeout: timeout + 5000, maxBytes: 2 * 1024 * 1024, ...(new URL(url).pathname.endsWith('/message') ? {signal:cancellation.signal} : {}) }));
      return new Response(result.body, { status: result.status });
    };
    adapter = new OpenCodeAdapter('http://127.0.0.1:4096', password, transport);
    let ready = false;
    for (let attempt = 0; attempt < 40 && !interrupted; attempt++) {
      try { const health = await adapter.health(); if (health.healthy && health.version === '1.19.0') { ready = true; break; } } catch { /* Bound startup wait. */ }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!ready || interrupted) throw new Error('ENGINE_NOT_READY');
    session = await adapter.start();
    await save({ state: 'running', session });
    if(onActivity){
      const collect=activityCollector(emitActivity,[key,password,gatewayToken]);const decoder=new StringDecoder('utf8');let buffer='';let ready;
      const connected=new Promise(resolve=>{ready=resolve;});
      activityTask=execute('docker',['exec',engine,'node','-e',eventReaderScript,session],{timeout:305000,maxBytes:4*1024*1024,signal:activityStop.signal,onStdout:data=>{buffer+=decoder.write(data);if(buffer.length>65536){buffer='';return;}let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{const event=JSON.parse(line);if(event.ready)ready();else collect(event);}catch{}}}}).catch(()=>{if(!activityStop.signal.aborted)emitActivity({kind:'message',status:'error',label:'Canal de actividad cerrado; la ejecución continúa.'});});
        let readinessTimer;await Promise.race([connected,new Promise(resolve=>{readinessTimer=setTimeout(resolve,5000);})]);clearTimeout(readinessTimer);
    }
    const message = await adapter.message(session, prompt + '\nTrabajá solamente en /workspace. No publiques cambios. Ejecutá y verificá los tests del pedido. El resultado será revisado por el usuario.', model);
    if (interrupted) throw new Error('RUN_INTERRUPTED');
    const failure = engineFailure(message);
    if (failure) { engineDiagnostic = failure.diagnostic; throw new Error(failure.code); }
    await save({ state: 'verifying', session });
    emitActivity({kind:'verification',status:'running',label:'Verificando: '+testCommand});
    let verification;
    try { if (dependencyResult) await verifyDependencyInputs(workspace, dependencyResult.hashes); const logs = await execute('docker', ['exec', '-w', '/workspace', engine, 'sh', '-lc', testCommand], { timeout: 120000, maxBytes: 256 * 1024, signal: cancellation.signal }); verification = { command: testCommand, exitCode: 0, output: logs }; }
    catch (error) { verification = { command: testCommand, exitCode: error.exitCode ?? null, output: error.output || error.message }; }
    if (interrupted) throw new Error('RUN_INTERRUPTED');
    emitActivity({kind:'verification',status:verification.exitCode===0?'completed':'error',label:'Verificación · salida '+verification.exitCode,output:verification.output.slice(0,4096)});
    const files = await changes(root, true);
    const report = { state: verification.exitCode === 0 ? 'ready_for_review' : 'tests_failed', session, provider, model, files, verification,
      summary: message.parts.filter(part => part.type === 'text').map(part => part.text).join('\n').slice(0, 6000), finishedAt: new Date().toISOString(), originalModified: false };
    await atomicJson(path.join(root, 'report.json'), report); await save({ state: report.state, session }); return report;
  } catch (error) {
    let diagnostics = [];
    if (resourcesStarted) {
      const logs = await execute('docker', ['logs', '--tail', '100', broker], { timeout: 10000, maxBytes: 65536 }).catch(() => '');
      diagnostics = providerDiagnostics(logs);
    }
    if (engineDiagnostic) diagnostics.push(engineDiagnostic);
    const code = interrupted ? 'RUN_INTERRUPTED' : failureCode(diagnostics, error.message);
    await save({ state: interrupted ? 'interrupted' : 'failed', session, error: code, diagnostics, retry: 'Create a new snapshot; never automatically replay this run.' }); throw new Error(code);
  }
  finally {
    activityStop.abort();await activityTask;
    process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
    signal?.removeEventListener('abort',interrupt);
    if (adapter && session) await adapter.abort(session).catch(() => {});
    if (resourcesStarted) {
      await execute('docker', ['rm', '-f', engine, broker]).catch(() => {});
      await execute('docker', ['network', 'rm', net]).catch(() => {});
    }
    if (dependencyResult) { await execute('docker', ['rm','-f',dependencyResult.container]).catch(() => {}); await execute('docker', ['volume','rm',dependencyResult.volume]).catch(() => {}); }
    for (const file of [brokerEnv, engineEnv]) await unlink(file).catch(() => {});
  }
}

export function providerDiagnostics(logs) {
  return String(logs).split('\n').flatMap(line => {
    if (!line.startsWith('JETREE_DIAGNOSTIC ')) return [];
    try {
      const event = JSON.parse(line.slice('JETREE_DIAGNOSTIC '.length));
      if (event.code === 'PROVIDER_TRANSPORT_ERROR') return [{ code: event.code }];
      if (event.code === 'PROVIDER_HTTP_ERROR' && Number.isInteger(event.status) && event.status >= 100 && event.status <= 599) return [{ code: event.code, status: event.status, ...(['UNKNOWN','RATE_LIMIT','REQUEST_TOO_LARGE','TOOL_GENERATION_FAILED','TOOL_SCHEMA_INVALID','TOOL_REQUEST_INVALID','PARAMETER_INVALID','MESSAGES_INVALID','MODEL_INVALID','TOKEN_LIMIT','CACHE_CONTROL_UNSUPPORTED','REASONING_CONTENT_UNSUPPORTED','CONTENT_INVALID','ROLE_INVALID'].includes(event.category) ? { category: event.category } : {}) }];
    } catch { /* Ignore malformed or untrusted log entries. */ }
    return [];
  }).slice(-10);
}
