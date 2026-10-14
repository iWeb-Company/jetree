import { readFile, mkdir, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { isolationArgs, IMAGE } from './sandbox.mjs';
import { hash } from './workspace.mjs';

export function dependencyPolicy(value) {
  if (value === undefined || value === 'none') return 'none';
  if (value === 'npm-ci') return value;
  throw new Error('DEPENDENCY_POLICY_INVALID');
}
export function validateNpmLock(pkg, lock) {
  if (!pkg || !lock || lock.lockfileVersion !== 3 || !lock.packages || pkg.workspaces || pkg.overrides || pkg.bundleDependencies || pkg.bundledDependencies) throw new Error('DEPENDENCY_LOCK_UNSUPPORTED');
  const entries = Object.entries(lock.packages);
  if (!entries.length || entries.length > 1000) throw new Error('DEPENDENCY_LOCK_LIMIT');
  const specs = object => {
    for (const group of ['dependencies','devDependencies','optionalDependencies','peerDependencies']) {
      if (!object[group]) continue;
      for (const [name, value] of Object.entries(object[group])) {
        if (!/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name) || typeof value !== 'string' || !/^[A-Za-z0-9*~^<>=| .+-]+$/.test(value)) throw new Error('DEPENDENCY_SOURCE_UNSUPPORTED');
      }
    }
  };
  specs(pkg);
  for (const [name, entry] of entries) {
    if (!entry || typeof entry !== 'object') throw new Error('DEPENDENCY_LOCK_UNSUPPORTED');
    specs(entry);
    if (name === '') continue;
    if (!/^(node_modules\/(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)(\/node_modules\/(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)*$/i.test(name) || entry.link || !/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(entry.version || '')) throw new Error('DEPENDENCY_SOURCE_UNSUPPORTED');
    let url; try { url = new URL(entry.resolved); } catch { throw new Error('DEPENDENCY_SOURCE_UNSUPPORTED'); }
    if (url.protocol !== 'https:' || url.hostname !== 'registry.npmjs.org' || url.port || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('.tgz') || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(entry.integrity || '')) throw new Error('DEPENDENCY_SOURCE_UNSUPPORTED');
  }
}
export async function prepareDependencies({ root, workspace, id, execute, signal }) {
  const files = {};
  for (const name of ['package.json','package-lock.json']) {
    const file = path.join(workspace, name); const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 1048576) throw new Error('DEPENDENCY_LOCK_UNSUPPORTED');
    files[name] = await readFile(file);
  }
  validateNpmLock(JSON.parse(files['package.json']), JSON.parse(files['package-lock.json']));
  const metadata = path.join(root, 'dependency-input'); await mkdir(metadata, { mode: 0o700 });
  await mkdir(path.join(metadata,'node_modules'), { mode: 0o700 });
  await mkdir(path.join(workspace,'node_modules'), { mode: 0o700 });
  for (const [name, data] of Object.entries(files)) await writeFile(path.join(metadata, name), data, { mode: 0o600, flag: 'wx' });
  // Only package metadata reaches this container. No code, keys, npmrc or host
  // node_modules. Dependencies live in a bounded tmpfs Docker volume.
  const uid = process.getuid?.() || 1000; const gid = process.getgid?.() || 1000;
  const volume = id + '-deps'; const container = id + '-installer';
  await execute('docker', ['volume','create','--driver','local','--opt','type=tmpfs','--opt','device=tmpfs','--opt',`o=size=512m,uid=${uid},gid=${gid},mode=0700`,volume]);
  try {
    await execute('docker', [...isolationArgs({ name: container, network: 'bridge', uid, gid }),
      '--mount',`type=bind,source=${metadata},target=/workspace,readonly`,
      '--mount',`type=volume,source=${volume},target=/workspace/node_modules`,
      '--env','HOME=/tmp','--env','NPM_CONFIG_USERCONFIG=/tmp/jetree-user.npmrc','--env','NPM_CONFIG_GLOBALCONFIG=/tmp/jetree-global.npmrc',
      IMAGE,'node','-e','setTimeout(()=>process.exit(0),480000)']);
    try {
      await execute('docker', ['exec','-w','/workspace',container,'npm','ci','--ignore-scripts','--no-audit','--no-fund','--registry=https://registry.npmjs.org','--cache=/tmp/npm-cache','--fetch-retries=0','--fetch-timeout=30000'], { timeout: 180000, maxBytes: 65536, signal });
    } catch(error) { throw new Error(signal?.aborted ? 'RUN_INTERRUPTED' : 'DEPENDENCY_INSTALL_FAILED'); }
    // The engine cannot alter installed packages. If it changes the lockfile,
    // verification fails rather than testing against the old dependencies.
    return { volume, container, hashes: Object.fromEntries(Object.entries(files).map(([name,data]) => [name,hash(data)])) };
  } catch (error) { await execute('docker', ['rm','-f',container]).catch(() => {}); await execute('docker',['volume','rm',volume]).catch(() => {}); throw error; }
}
export async function verifyDependencyInputs(workspace, hashes) {
  for (const [name, expected] of Object.entries(hashes)) {
    const info = await lstat(path.join(workspace,name));
    if (!info.isFile() || info.isSymbolicLink() || info.size > 1048576 || hash(await readFile(path.join(workspace,name))) !== expected) throw new Error('DEPENDENCY_INPUT_CHANGED');
  }
}
