import { open, rename, unlink, mkdir, readFile, rmdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

// The old record survives a crash until the complete new record is durable.
export async function atomicJson(file, value) {
  const temporary = file + '.' + randomBytes(12).toString('hex') + '.tmp';
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(JSON.stringify(value, null, 2));
    await handle.sync(); await handle.close(); handle = undefined;
    for (let attempt = 0; ; attempt++) {
      try { await rename(temporary, file); break; }
      catch (error) {
        if (process.platform !== 'win32' || !['EPERM','EACCES','EBUSY'].includes(error.code) || attempt >= 10) throw error;
        await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)));
      }
    }
    if (process.platform !== 'win32') {
      const directory = await open(path.dirname(file), 'r');
      try { await directory.sync(); } finally { await directory.close(); }
    }
  } finally { await handle?.close(); await unlink(temporary).catch(() => {}); }
}
async function processIdentity(pid) {
  if (process.platform !== 'linux') return null;
  const boot = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
  const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
  return boot + ':' + stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
}
async function dead(owner) {
  if (!Number.isInteger(owner.pid) || owner.pid < 1 || !/^[a-f0-9]{32}$/.test(owner.nonce)) throw new Error('RUNNER_LOCK_INVALID');
  if (owner.identity !== null && !/^[a-f0-9-]{36}:\d+$/.test(owner.identity)) throw new Error('RUNNER_LOCK_INVALID');
  try { process.kill(owner.pid, 0); }
  catch (error) { if (error.code === 'ESRCH') return true; throw new Error('RUNNER_ALREADY_LISTENING'); }
  // Linux also detects PID reuse and reboot. On other systems an existing PID
  // is conservatively considered live, even if it belongs to another process.
  return Boolean(owner.identity && process.platform === 'linux' && owner.identity !== await processIdentity(owner.pid));
}
export async function listenerLock(root) {
  const lock = path.join(root, 'listener.lock');
  const owner = { pid: process.pid, identity: await processIdentity(process.pid), nonce: randomBytes(16).toString('hex') };
  try { await mkdir(lock, { mode: 0o700 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const recovery = path.join(root, 'listener.recovery');
    try { await mkdir(recovery, { mode: 0o700 }); } catch { throw new Error('RUNNER_ALREADY_LISTENING'); }
    try {
      let previous;
      try { previous = JSON.parse(await readFile(path.join(lock, 'owner.json'), 'utf8')); }
      catch { throw new Error('RUNNER_LOCK_INVALID'); }
      if (!await dead(previous)) throw new Error('RUNNER_ALREADY_LISTENING');
      await unlink(path.join(lock, 'owner.json')); await rmdir(lock);
      await mkdir(lock, { mode: 0o700 });
    } finally { await rmdir(recovery); }
  }
  await atomicJson(path.join(lock, 'owner.json'), owner);
  return async () => {
    const current = JSON.parse(await readFile(path.join(lock, 'owner.json'), 'utf8'));
    if (current.nonce !== owner.nonce) throw new Error('RUNNER_LOCK_INVALID');
    await unlink(path.join(lock, 'owner.json')); await rmdir(lock);
  };
}
