import { spawn } from 'node:child_process';

// A daemon container must not keep running indefinitely if its CLI is killed.
// This supervisor lives in the read-only image, outside the project mount.
const child = spawn('opencode', ['serve', '--hostname', '127.0.0.1', '--port', '4096'], { stdio: 'inherit', detached: true });
let expired = false;
const stop = () => {
  expired = true;
  try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} process.exit(124); }, 3000);
};
const deadline = setTimeout(stop, 8 * 60 * 1000);
for (const signal of ['SIGINT','SIGTERM']) process.once(signal, stop);
child.on('error', () => { clearTimeout(deadline); process.exit(1); });
child.on('exit', code => { clearTimeout(deadline); process.exit(expired ? 124 : code ?? 1); });
