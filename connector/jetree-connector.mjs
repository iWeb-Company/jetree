import { mkdir, readFile, writeFile, chmod, stat, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { validateOrigin, childEnvironment, isolatedSettings, decodeReply, validateJob, plainCliPrompt, CLI_VERSION } from './runtime.mjs';

const root = join(homedir(), '.jetree-personal');
const providerHome = join(root, 'google');
const workspace = join(root, 'empty-workspace');
const settingsPath = join(root, 'system-settings.json');
const policyPath = join(root, 'deny-tools.toml');
const connectionPath = join(root, 'connection.json');
const cliRoot = join(dirname(fileURLToPath(import.meta.url)), 'node_modules', '@google', 'gemini-cli');
let activeChild;
let stopped = false;

async function protect(path, directory = false) {
  if (process.platform !== 'win32') { await chmod(path, directory ? 0o700 : 0o600); return; }
  const identity = spawnSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', shell: false });
  const sid = identity.stdout?.match(/S-1-5-[0-9-]+/)?.[0];
  if (!sid || identity.status !== 0) throw new Error('No se pudo identificar al usuario para proteger el archivo.');
  const reset = spawnSync('icacls.exe', [path, '/reset'], { windowsHide: true, encoding: 'utf8', shell: false });
  if (reset.status !== 0) throw new Error('No se pudo eliminar un permiso previo del archivo.');
  const acl = spawnSync('icacls.exe', [path, '/inheritance:r', '/grant:r', `*${sid}:${directory ? '(OI)(CI)F' : 'F'}`], { windowsHide: true, encoding: 'utf8', shell: false });
  if (acl.status !== 0) throw new Error('No se pudo proteger el archivo.');
}

async function setup() {
  await mkdir(root, { recursive: true, mode: 0o700 });
  await protect(root, true);
  await mkdir(providerHome, { recursive: true, mode: 0o700 });
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  await writeFile(policyPath, '[[rule]]\ntoolName = "*"\ndecision = "deny"\npriority = 999\n', { mode: 0o600 });
  await writeFile(settingsPath, JSON.stringify(isolatedSettings(policyPath)), { mode: 0o600 });
  await protect(policyPath); await protect(settingsPath);
  const pkg = JSON.parse(await readFile(join(cliRoot, 'package.json'), 'utf8'));
  if (pkg.version !== CLI_VERSION) throw new Error('La versión del Gemini CLI no coincide; instalá con npm ci.');
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.gemini;
  return join(cliRoot, bin);
}

async function runGoogle(cliPath, prompt, deadline) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, '--output-format', 'json'], {
      cwd: workspace, env: childEnvironment(process.env, providerHome, settingsPath),
      shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    activeChild = child;
    let output = ''; let oversized = false;
    const timer = setTimeout(() => child.kill(), Math.max(1, Math.min(160_000, deadline - Date.now())));
    child.stdout.on('data', data => {
      output += data.toString();
      if (Buffer.byteLength(output) > 500_000) { oversized = true; child.kill(); }
    });
    child.stderr.resume(); // Do not print prompts, provider tokens or detailed provider errors.
    child.stdin.on('error', () => {});
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer); activeChild = null;
      if (code !== 0 || oversized || stopped) return reject(new Error('La cuenta Google no completó la respuesta.'));
      try { resolve(decodeReply(output)); } catch (error) { reject(error); }
    });
    child.stdin.end(plainCliPrompt(prompt));
  });
}

async function request(origin, path, body, token) {
  const response = await fetch(`${validateOrigin(origin)}${path}`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(response.status === 409 ? 'Conexión rechazada o revocada. Volvé a vincular desde Jetree.' : 'No se pudo contactar Jetree.');
  return response.json();
}

async function main() {
  const mode = process.argv[2];
  if (!['login', 'pair', 'start'].includes(mode)) throw new Error('Usá npm run login, npm run pair o npm start.');
  const cliPath = await setup();
  if (mode === 'login') {
    console.log('Iniciá sesión con Google en el CLI oficial. Luego cerralo con /quit. No ingreses una API key.');
    const child = spawn(process.execPath, [cliPath], { cwd: workspace, env: childEnvironment(process.env, providerHome, settingsPath), shell: false, stdio: 'inherit' });
    activeChild = child;
    await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error('Login no completado.'))); });
    return;
  }
  if (mode === 'pair') {
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const origin = validateOrigin((await terminal.question('Dominio de Jetree (https://…): ')).trim());
      const pairingCode = (await terminal.question('Código de vinculación de tu usuario (no lo compartas): ')).trim();
      if (!/^[a-f0-9]{64}$/.test(pairingCode)) throw new Error('Código inválido.');
      const name = (await terminal.question('Nombre de este equipo: ')).trim();
      if (!name || name.length > 80) throw new Error('Nombre inválido.');
      const data = await request(origin, '/api/model-devices/connect', { pairingCode, name });
      if (!/^[a-f0-9]{64}$/.test(data.token)) throw new Error('Respuesta de vinculación inválida.');
      const temporary = `${connectionPath}.tmp`;
      await writeFile(temporary, JSON.stringify({ origin, token: data.token, deviceId: data.deviceId }), { mode: 0o600 });
      await protect(temporary); await rename(temporary, connectionPath);
      console.log('Equipo vinculado. Usá npm start para mantenerlo conectado.');
    } finally { terminal.close(); }
    return;
  }
  const metadata = await stat(connectionPath);
  if (process.platform !== 'win32' && (metadata.mode & 0o077)) throw new Error('El archivo de conexión debe tener permisos 600.');
  const connection = JSON.parse(await readFile(connectionPath, 'utf8'));
  validateOrigin(connection.origin);
  if (!/^[a-f0-9]{64}$/.test(connection.token)) throw new Error('Conexión inválida.');
  console.log('Conector personal iniciado. Solo chat web Google; las herramientas se aprueban en Jetree.');
  while (!stopped) {
    const { job } = await request(connection.origin, '/api/model-devices/relay', { action: 'poll' }, connection.token);
    if (job) {
      let response;
      let heartbeatBusy = false;
      const heartbeat = setInterval(async () => {
        if (heartbeatBusy) return;
        heartbeatBusy = true;
        try { await request(connection.origin, '/api/model-devices/relay', { action: 'heartbeat', jobId: job.id, lease: job.lease }, connection.token); }
        catch { activeChild?.kill(); }
        finally { heartbeatBusy = false; }
      }, 5000);
      try { validateJob(job); response = await runGoogle(cliPath, job.prompt, Date.parse(job.expiresAt)); }
      catch { console.log('Ejecución no completada. Revisá tu sesión Google; no se usó API.'); }
      finally { clearInterval(heartbeat); }
      await request(connection.origin, '/api/model-devices/relay', {
        action: response ? 'complete' : 'fail', jobId: job.id, lease: job.lease, response,
      }, connection.token);
      // Retain OAuth login, remove CLI conversation recordings from this isolated profile.
      await rm(join(providerHome, '.gemini', 'tmp'), { recursive: true, force: true });
      console.log(response ? 'Respuesta entregada.' : 'Fallo informado a Jetree.');
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopped = true; activeChild?.kill(); });
main().catch(error => { console.error(error instanceof Error ? error.message : 'Conector detenido.'); process.exitCode = 1; });
