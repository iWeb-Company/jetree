import { randomBytes } from 'node:crypto';
import { readFile, writeFile, unlink, realpath } from 'node:fs/promises';
import path from 'node:path';
import { command } from './process.mjs';
import { changes } from './workspace.mjs';
import { engineConfig, OpenCodeAdapter } from './opencode.mjs';
import { providerTarget } from './gateway.mjs';

export const IMAGE = 'jetree-code:opencode-1.19.0';
export function isolationArgs({ name, network, uid = 1000, gid = 1000 }) {
  return ['run', '-d', '--init', '--name', name, '--network', network, '--user', `${uid}:${gid}`, '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--pids-limit', '128', '--memory', '2g', '--cpus', '2', '--tmpfs', '/tmp:rw,nosuid,nodev,size=256m', '--tmpfs', `/home/node/.local:rw,nosuid,nodev,size=128m,uid=${uid},gid=${gid},mode=0700`, '--tmpfs', `/home/node/.config:rw,nosuid,nodev,size=16m,uid=${uid},gid=${gid},mode=0700`];
}
const envLine = (key, value) => { if (typeof value !== 'string' || /[\r\n\0]/.test(value)) throw new Error('ENV_INVALID'); return `${key}=${value}`; };
export async function runSandbox({ output, prompt, provider, model, key, testCommand, execute = command }) {
  providerTarget(provider); engineConfig(model, 'validate');
  if (!key || /[\r\n\0]/.test(key) || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 8000 || typeof testCommand !== 'string' || !testCommand.trim() || testCommand.length > 1000) throw new Error('RUN_INPUT_INVALID');
  const root = await realpath(output); const workspace = await realpath(path.join(root, 'workspace'));
  if (workspace !== path.join(root, 'workspace') || /[,\r\n]/.test(workspace)) throw new Error('WORKSPACE_INVALID');
  const status = JSON.parse(await readFile(path.join(root, 'status.json'), 'utf8'));
  if (status.state !== 'prepared') throw new Error('RUN_ALREADY_STARTED');
  // Verify captured inputs have not changed before any code is executed.
  if ((await changes(root)).length) throw new Error('SNAPSHOT_CHANGED');
  await execute('docker', ['info', '--format', '{{.OSType}}']).then(value => { if (value.trim() !== 'linux') throw new Error('LINUX_DOCKER_REQUIRED'); });
  await execute('docker', ['image', 'inspect', IMAGE]);
  await writeFile(path.join(root, 'run.lock'), '', { flag: 'wx', mode: 0o600 });
  const id = 'jetree-code-' + randomBytes(8).toString('hex');
  const net = id + '-private'; const broker = id + '-broker'; const engine = id + '-engine';
  const gatewayToken = randomBytes(32).toString('base64url'); const password = randomBytes(32).toString('base64url');
  const brokerEnv = path.join(root, 'broker.env'); const engineEnv = path.join(root, 'engine.env');
  const save = data => writeFile(path.join(root, 'status.json'), JSON.stringify(data, null, 2), { mode: 0o600 });
  let interrupted = false; let session; let adapter; let resourcesStarted = false;
  const interrupt = () => { interrupted = true; if (session && adapter) adapter.abort(session).catch(() => {}); };
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  try {
    await save({ state: 'starting', startedAt: new Date().toISOString() });
    await writeFile(brokerEnv, [envLine('JETREE_CODE_PROVIDER', provider), envLine('JETREE_CODE_MODEL', model), envLine('JETREE_CODE_API_KEY', key), envLine('JETREE_CODE_GATEWAY_TOKEN', gatewayToken)].join('\n'), { mode: 0o600, flag: 'wx' });
    await writeFile(engineEnv, [envLine('OPENCODE_SERVER_PASSWORD', password), envLine('OPENCODE_CONFIG_CONTENT', JSON.stringify(engineConfig(model, gatewayToken)))].join('\n'), { mode: 0o600, flag: 'wx' });
    await execute('docker', ['network', 'create', '--internal', net]); resourcesStarted = true;
    await execute('docker', [...isolationArgs({ name: broker, network: 'bridge' }), '--env-file', brokerEnv, IMAGE, 'node', '/opt/jetree-code/gateway.mjs']);
    await execute('docker', ['network', 'connect', '--alias', 'broker', net, broker]);
    await execute('docker', [...isolationArgs({ name: engine, network: net, uid: process.getuid?.() || 1000, gid: process.getgid?.() || 1000 }), '--env-file', engineEnv, '--mount', `type=bind,source=${workspace},target=/workspace`, IMAGE]);
    // Keep the API entirely inside the container; no host port is published.
    // Docker exec transports a bounded HTTP result, never a shell interpolation.
    const transport = async (url, options) => {
      const timeout = new URL(url).pathname.endsWith('/message') ? 240000 : 10000;
      const input = Buffer.from(JSON.stringify({ path: new URL(url).pathname, method: options.method, body: options.body, timeout })).toString('base64');
      const script = `const input=JSON.parse(Buffer.from(process.argv[1],'base64'));fetch('http://127.0.0.1:4096'+input.path,{method:input.method,headers:{Authorization:'Basic '+Buffer.from('opencode:'+process.env.OPENCODE_SERVER_PASSWORD).toString('base64'),'Content-Type':'application/json'},body:input.body,redirect:'error',signal:AbortSignal.timeout(input.timeout)}).then(async r=>console.log(JSON.stringify({status:r.status,body:await r.text()}))).catch(()=>process.exit(1));`;
      const result = JSON.parse(await execute('docker', ['exec', engine, 'node', '-e', script, input], { timeout: timeout + 5000, maxBytes: 2 * 1024 * 1024 }));
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
    const message = await adapter.message(session, prompt + '\nTrabajá solamente en /workspace. No publiques cambios. Ejecutá y verificá los tests del pedido. El resultado será revisado por el usuario.', model);
    if (interrupted) throw new Error('RUN_INTERRUPTED');
    if (message.info?.error || !Array.isArray(message.parts) || !message.parts.some(part => part.type === 'text' && part.text?.trim())) throw new Error('ENGINE_TASK_FAILED');
    await save({ state: 'verifying', session });
    let verification;
    try { const logs = await execute('docker', ['exec', '-w', '/workspace', engine, 'sh', '-lc', testCommand], { timeout: 120000, maxBytes: 256 * 1024 }); verification = { command: testCommand, exitCode: 0, output: logs }; }
    catch (error) { verification = { command: testCommand, exitCode: error.exitCode ?? null, output: error.output || error.message }; }
    if (interrupted) throw new Error('RUN_INTERRUPTED');
    const files = await changes(root);
    const report = { state: verification.exitCode === 0 ? 'ready_for_review' : 'tests_failed', session, provider, model, files, verification,
      summary: message.parts.filter(part => part.type === 'text').map(part => part.text).join('\n').slice(0, 6000), finishedAt: new Date().toISOString(), originalModified: false };
    await writeFile(path.join(root, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600, flag: 'wx' }); await save({ state: report.state, session }); return report;
  } catch (error) { await save({ state: interrupted ? 'interrupted' : 'failed', session, error: /^[A-Z_:a-z-]+$/.test(error.message) ? error.message : 'RUN_FAILED', retry: 'Create a new snapshot; never automatically replay this run.' }); throw error; }
  finally {
    process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
    if (adapter && session) await adapter.abort(session).catch(() => {});
    if (resourcesStarted) {
      await execute('docker', ['rm', '-f', engine, broker]).catch(() => {});
      await execute('docker', ['network', 'rm', net]).catch(() => {});
    }
    for (const file of [brokerEnv, engineEnv]) await unlink(file).catch(() => {});
  }
}
