import { spawn } from 'node:child_process';

export function command(program, args, { cwd, timeout = 30000, maxBytes = 2 * 1024 * 1024, env = {}, signal, onStdout } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('RUN_INTERRUPTED')); return; }
    const safeArgs = program === 'git' ? ['-c', 'core.fsmonitor=false', ...args] : args;
    const child = spawn(program, safeArgs, { cwd, shell: false, windowsHide: true,
      env: { ...process.env, ...env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_TERMINAL_PROMPT: '0' } });
    const chunks = []; const stdout = []; let size = 0; let problem;
    const abort = () => { problem = new Error('RUN_INTERRUPTED'); child.kill(); };
    signal?.addEventListener('abort', abort, { once: true });
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    const timer = setTimeout(() => { problem = new Error('COMMAND_TIMEOUT'); child.kill(); }, timeout);
    for (const stream of [child.stdout, child.stderr]) stream.on('data', data => {
      size += data.length; if (size > maxBytes) { problem = new Error('COMMAND_OUTPUT_LIMIT'); child.kill(); }
      else { chunks.push(data); if (stream === child.stdout) { stdout.push(data); onStdout?.(data); } }
    });
    child.on('error', error => { cleanup(); reject(error); });
    child.on('close', code => { cleanup(); if (problem) reject(problem);
      else if (code !== 0) { const error = new Error('COMMAND_FAILED:' + program); error.exitCode = code; error.output = Buffer.concat(chunks).toString('utf8'); reject(error); }
      else resolve(Buffer.concat(stdout).toString('utf8')); });
  });
}
