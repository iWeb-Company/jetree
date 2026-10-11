import { mkdir, readFile, writeFile, chmod, stat, rename, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { validateOrigin, validateJob, plainCliPrompt } from './runtime.mjs';
import { installAntigravity, antigravityEnvironment, antigravitySettings, antigravityArguments, decodeAntigravityReply, CHAT_AGENT, CHAT_AGENT_SOURCE, validateAntigravityInit, stopAntigravity, availableGeminiModels } from './antigravity.mjs';

const root = join(homedir(), '.jetree-personal');
const providerHome = join(root, 'antigravity');
const workspace = join(providerHome, 'empty-workspace');
const settingsPath = join(providerHome, '.gemini', 'antigravity-cli', 'settings.json');
const connectionPath = join(root, 'connection.json');
// Enable only in a reviewed release after real authentication, model selection,
// effective deny-policy tests, cancellation and revocation pass.
const ANTIGRAVITY_TRANSPORT_APPROVED = false;
const devPreview = process.argv.includes('--dev-preview');
function requirePreviewOrigin(origin) {
  if (!ANTIGRAVITY_TRANSPORT_APPROVED && origin !== 'https://jetree-dev.iwebtecnology.com') throw new Error('Esta prueba solo admite Jetree dev; producción sigue deshabilitada.');
}
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
  await mkdir(dirname(settingsPath), { recursive: true, mode: 0o700 });
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  if ((await readdir(workspace)).length) throw new Error('La carpeta de trabajo aislada debe estar vacía.');
  await writeFile(settingsPath, JSON.stringify(antigravitySettings()), { mode: 0o600 });
  await protect(settingsPath);
  const configDirectory = join(providerHome, '.gemini', 'config');
  await mkdir(configDirectory, { recursive: true, mode: 0o700 });
  await mkdir(join(configDirectory, 'agents'), { recursive: true, mode: 0o700 });
  await writeFile(join(configDirectory, 'agents', `${CHAT_AGENT}.md`), CHAT_AGENT_SOURCE, { mode: 0o600 });
  await writeFile(join(configDirectory, 'hooks.json'), '{}', { mode: 0o600 });
  await writeFile(join(configDirectory, 'mcp_config.json'), '{"mcpServers":{}}', { mode: 0o600 });
  for (const directory of ['Roaming', 'Local']) await mkdir(join(providerHome, 'AppData', directory), { recursive: true, mode: 0o700 });
  return installAntigravity(join(root, 'antigravity-bin'));
}

async function runGoogle(cliPath, prompt, deadline, model) {
  return new Promise((resolve, reject) => {
    const child = spawn(cliPath, antigravityArguments(model), {
      cwd: workspace, env: antigravityEnvironment(process.env, providerHome),
      shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    activeChild = child;
    child.stdout.setEncoding('utf8');
    let output = ''; let oversized = false; let pending = ''; let initialized = false; let rejected = false;
    const abort = () => { rejected = true; stopAntigravity(child); };
    const timer = setTimeout(abort, Math.max(1, Math.min(45000, deadline - Date.now())));
    child.stdout.on('data', data => {
      output += data.toString();
      if (Buffer.byteLength(output) > 500_000) { oversized = true; abort(); return; }
      pending += data.toString();
      while (pending.includes('\n')) {
        const end = pending.indexOf('\n'); const line = pending.slice(0, end); pending = pending.slice(end + 1);
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (!initialized) {
            validateAntigravityInit(event, model); initialized = true;
            child.stdin.end(JSON.stringify({ event: 'user', message: { content: plainCliPrompt(prompt) } }) + '\n');
          } else if (event.event === 'init' || event.step_update?.step_type === 'tool' || event.step_update?.subagent_info || event.step_update?.tool_info) abort();
        } catch { abort(); }
      }
    });
    child.stderr.on('data', data => { if (/Authentication required|sign in|consent/i.test(data.toString())) abort(); });
    child.stdin.on('error', () => {});
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer); activeChild = null;
      if (code !== 0 || oversized || stopped || rejected || !initialized) return reject(new Error('La cuenta Google no completó la respuesta.'));
      try { resolve(decodeAntigravityReply(output)); } catch (error) { reject(error); }
    });
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
    console.log('Completá el login oficial de Antigravity con Google. Verificá qué cuenta usás. Luego cerrá con /quit. Jetree no recibe tus credenciales Google.');
    const child = spawn(cliPath, [], { cwd: workspace, env: antigravityEnvironment(process.env, providerHome), shell: false, stdio: 'inherit' });
    activeChild = child;
    await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error('Login no completado.'))); });
    return;
  }
  if (!ANTIGRAVITY_TRANSPORT_APPROVED && !devPreview) throw new Error('Antigravity en validación. La prueba de dev requiere --dev-preview; producción sigue deshabilitada.');
  if (mode === 'pair') {
    const models = availableGeminiModels(cliPath, { cwd: workspace, env: antigravityEnvironment(process.env, providerHome) });
    console.log('Modelos Gemini de tu cuenta:\n' + models.join('\n'));
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const origin = validateOrigin((await terminal.question('Dominio de Jetree (https://…): ')).trim());
      requirePreviewOrigin(origin);
      const model = (await terminal.question('Modelo Gemini (copiá uno de la lista): ')).trim();
      if (!models.includes(model)) throw new Error('El modelo no está disponible en tu cuenta.');
      const pairingCode = (await terminal.question('Código de vinculación de tu usuario (no lo compartas): ')).trim();
      if (!/^[a-f0-9]{64}$/.test(pairingCode)) throw new Error('Código inválido.');
      const name = (await terminal.question('Nombre de este equipo: ')).trim();
      if (!name || name.length > 80) throw new Error('Nombre inválido.');
      const data = await request(origin, '/api/model-devices/connect', { pairingCode, name });
      if (!/^[a-f0-9]{64}$/.test(data.token)) throw new Error('Respuesta de vinculación inválida.');
      const temporary = `${connectionPath}.tmp`;
      await writeFile(temporary, JSON.stringify({ origin, token: data.token, deviceId: data.deviceId, model }), { mode: 0o600 });
      await protect(temporary); await rename(temporary, connectionPath);
      console.log('Equipo vinculado. Usá npm start para mantenerlo conectado.');
    } finally { terminal.close(); }
    return;
  }
  const metadata = await stat(connectionPath);
  if (process.platform !== 'win32' && (metadata.mode & 0o077)) throw new Error('El archivo de conexión debe tener permisos 600.');
  const connection = JSON.parse(await readFile(connectionPath, 'utf8'));
  validateOrigin(connection.origin);
  requirePreviewOrigin(connection.origin);
  if (!/^[a-f0-9]{64}$/.test(connection.token)) throw new Error('Conexión inválida.');
  if (!availableGeminiModels(cliPath, { cwd: workspace, env: antigravityEnvironment(process.env, providerHome) }).includes(connection.model)) throw new Error('Volvé a vincular este equipo eligiendo un modelo Gemini de tu cuenta.');
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
        catch { stopAntigravity(activeChild); }
        finally { heartbeatBusy = false; }
      }, 5000);
      try { validateJob(job); response = await runGoogle(cliPath, job.prompt, Date.parse(job.expiresAt), connection.model); }
      catch { console.log('Ejecución no completada. Revisá tu sesión Google; no se usó API.'); }
      finally { clearInterval(heartbeat); }
      await request(connection.origin, '/api/model-devices/relay', {
        action: response ? 'complete' : 'fail', jobId: job.id, lease: job.lease, response,
      }, connection.token);
      // Antigravity owns its local history and OS keyring. Never inspect its tokens.
      console.log(response ? 'Respuesta entregada.' : 'Fallo informado a Jetree.');
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopped = true; stopAntigravity(activeChild); });
main().catch(error => { console.error(error instanceof Error ? error.message : 'Conector detenido.'); process.exitCode = 1; });
