import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, chmod, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export const ANTIGRAVITY_VERSION = '1.3.1';
export const RELEASES = {
  x64: { url: 'https://storage.googleapis.com/antigravity-public/antigravity-cli/1.3.1-4582356770750464/windows-x64/cli_windows_x64.exe', sha512: 'f346d2cd9d68e7e5395cb94ff95e7e8ab2e0c65cf2ad835d0eb671fb41f12f5fc713d7a26ceb4510678eb9baa62c6cd9ab8205211e3661c6cd1e23ca7bc69781' },
  arm64: { url: 'https://storage.googleapis.com/antigravity-public/antigravity-cli/1.3.1-4582356770750464/windows-arm/cli_windows_arm64.exe', sha512: '5b1e761a46bdf3b4c2fb8dcce35ea0bdff6c548b5b28e6177a994a8273d57119a94258fdcb18a72a49c231db88d43f70ba9016b495875febbf174189c8cba3ca' },
};
export function antigravityEnvironment(parent, home) {
  const env = {};
  for (const name of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'LANG']) {
    if (typeof parent[name] === 'string') env[name] = parent[name];
  }
  env.HOME = home;
  env.USERPROFILE = home;
  env.APPDATA = join(home, 'AppData', 'Roaming');
  env.LOCALAPPDATA = join(home, 'AppData', 'Local');
  env.AGY_CLI_DISABLE_AUTO_UPDATE = 'true';
  return env;
}
export function antigravitySettings() {
  return {
    toolPermission: 'strict', allowNonWorkspaceAccess: false,
    useG1Credits: false, enableTelemetry: false,
    permissions: { allow: [], ask: [], deny: ['read_file(*)', 'write_file(*)', 'command(*)', 'unsandboxed(*)', 'read_url(*)', 'execute_url(*)', 'mcp(*)'] },
    hooks: {},
  };
}
export function antigravityArguments() {
  return ['--input-format', 'stream-json', '--output-format', 'stream-json', '--disable-slash-commands', '--print-timeout', '40s'];
}
export function decodeAntigravityReply(output) {
  const events = output.trim().split(/\r?\n/).map(line => JSON.parse(line));
  const starts = events.filter(event => event.event === 'init');
  if (starts.length !== 1 || starts[0].init?.permission_mode !== 'strict') throw new Error('Antigravity no confirmó el modo de permisos estricto.');
  for (const event of events) {
    if (event.step_update?.step_type === 'tool' || event.step_update?.tool_info || event.step_update?.subagent_info) throw new Error('Se rechazó una ejecución de herramienta local.');
  }
  const results = events.filter(event => event.event === 'result');
  const result = results[0]?.result;
  if (results.length !== 1 || result?.status !== 'SUCCESS' || result.error || typeof result.response !== 'string' || !result.response.trim() || result.response.length > 48_000) throw new Error('Respuesta incompleta.');
  return result.response;
}
export async function installAntigravity(directory) {
  if (process.platform !== 'win32' || !RELEASES[process.arch]) throw new Error('Esta versión del conector Antigravity requiere Windows x64 o ARM64.');
  const release = RELEASES[process.arch];
  await mkdir(directory, { recursive: true });
  const binary = join(directory, 'agy.exe');
  try {
    await stat(binary);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    console.log('Descargando Antigravity oficial; se verificará su SHA-512.');
    const response = await fetch(release.url, { redirect: 'error', signal: AbortSignal.timeout(180_000) });
    if (!response.ok) throw new Error('No se pudo descargar Antigravity.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 300_000_000 || createHash('sha512').update(bytes).digest('hex') !== release.sha512) throw new Error('La descarga no coincide con el manifiesto oficial.');
    await writeFile(binary + '.tmp', bytes, { mode: 0o700 });
    await rename(binary + '.tmp', binary);
    await chmod(binary, 0o700);
  }
  if (createHash('sha512').update(await readFile(binary)).digest('hex') !== release.sha512) throw new Error('El ejecutable cambió. Reinstalá el conector revisado.');
  const version = spawnSync(binary, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 10_000 });
  if (version.status !== 0 || version.stdout.trim() !== ANTIGRAVITY_VERSION) throw new Error('Versión de Antigravity inesperada.');
  return binary;
}
