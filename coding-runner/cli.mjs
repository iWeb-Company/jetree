#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { command } from './process.mjs';
import { prepare, changes } from './workspace.mjs';
import { runSandbox, IMAGE } from './sandbox.mjs';

const usage = `Jetree code — experimento local, sin conexión al panel todavía.
  node coding-runner/cli.mjs doctor
  node coding-runner/cli.mjs build
  node coding-runner/cli.mjs prepare --project <raíz Git> --output <carpeta nueva fuera del proyecto>
  node coding-runner/cli.mjs run --output <copia> --provider groq|openrouter|deepseek --model <ID> --prompt <pedido> --test <comando> --allow-inference
  node coding-runner/cli.mjs status --output <copia>
  node coding-runner/cli.mjs diff --output <copia>
run requiere JETREE_CODE_API_KEY en el entorno. Edita y ejecuta dentro de una copia aislada; envía contexto al proveedor elegido. No modifica ni publica el proyecto original.`;
export function options(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i]; if (!/^--(?:project|output|provider|model|prompt|test|allow-inference)$/.test(key) || key in result) throw new Error('CLI_ARGUMENT_INVALID');
    if (key === '--allow-inference') result[key] = true;
    else { const value = args[++i]; if (!value || value.startsWith('--')) throw new Error('CLI_ARGUMENT_INVALID'); result[key] = value; }
  }
  return result;
}
async function main() {
  const [action, ...args] = process.argv.slice(2); const input = options(args);
  if (!action || action === 'help') { console.log(usage); return; }
  if (action === 'doctor') {
    const result = { node: Number(process.versions.node.split('.')[0]) >= 22, git: false, dockerLinux: false, image: false };
    try { await command('git', ['--version']); result.git = true; } catch {}
    try { result.dockerLinux = (await command('docker', ['info', '--format', '{{.OSType}}'])).trim() === 'linux'; if (result.dockerLinux) { await command('docker', ['image','inspect',IMAGE]); result.image = true; } } catch {}
    console.log(JSON.stringify(result, null, 2)); if (!result.node || !result.git || !result.dockerLinux || !result.image) process.exitCode = 1; return;
  }
  if (action === 'build') { const directory = path.dirname(fileURLToPath(import.meta.url)); await command('docker', ['build','-t',IMAGE,directory], { timeout: 600000, maxBytes: 4 * 1024 * 1024 }); console.log('Imagen del ejecutor construida.'); return; }
  if (!input['--output']) throw new Error('OUTPUT_REQUIRED');
  let result;
  if (action === 'prepare') { if (!input['--project']) throw new Error('PROJECT_REQUIRED'); result = await prepare(input['--project'], input['--output']); }
  else if (action === 'diff') result = await changes(input['--output']);
  else if (action === 'status') result = JSON.parse(await readFile(path.join(input['--output'],'status.json'),'utf8'));
  else if (action === 'run') {
    if (!input['--allow-inference']) throw new Error('INFERENCE_AUTHORIZATION_REQUIRED');
    const report = await runSandbox({ output: input['--output'], provider: input['--provider'], model: input['--model'], prompt: input['--prompt'], testCommand: input['--test'], key: process.env.JETREE_CODE_API_KEY });
    result = { state: report.state, files: report.files, testsExitCode: report.verification.exitCode, report: path.resolve(input['--output'],'report.json') };
    if (report.state !== 'ready_for_review') process.exitCode = 1;
  } else throw new Error('CLI_COMMAND_INVALID');
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(() => { console.error('La operación no pudo completarse. Revisá los requisitos y status.json; no reintentes una ejecución sobre la misma copia. Usá help para ver los comandos.'); process.exitCode = 1; });
