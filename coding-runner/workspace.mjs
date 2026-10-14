import { constants } from 'node:fs';
import { lstat, realpath, open, mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { command } from './process.mjs';
import { ensurePrivateDirectory } from './private-directory.mjs';

export const hash = data => createHash('sha256').update(data).digest('hex');
export function within(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
export function excluded(name) {
  return name.split(/[\\/]/).some(part => /^\.(?:git|opencode|ssh|aws|azure|gnupg|jetree)(?:$|-)|^(?:node_modules|dist|target|\.next)$|^\.env(?:$|\.)|^\.(?:npmrc|netrc|pypirc)$|^(?:opencode\.jsonc?|auth\.json|credentials(?:\..*)?|secrets?(?:\..*)?|id_rsa|id_ed25519)$|\.(?:pem|key|p12|pfx|dpapi|exe|msi|pdb|dll|so|dylib)$/i.test(part));
}
export function secretContent(data) {
  return /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|\b(?:sk-(?:proj-|ant-api\d+-|or-v1-)?[A-Za-z0-9_-]{24,}|gsk_[A-Za-z0-9]{24,}|AIza[A-Za-z0-9_-]{30,}|gh[pousr]_[A-Za-z0-9]{30,})\b/.test(data.toString('utf8'));
}
async function boundedFile(root, relative) {
  if (typeof relative !== 'string' || !relative || /[\x00-\x1f\x7f]/.test(relative) || path.isAbsolute(relative)) throw new Error('PATH_NOT_ALLOWED');
  const target = path.resolve(root, relative);
  if (!within(root, target)) throw new Error('PATH_NOT_ALLOWED');
  // Reject symlinks/junctions in every path component, not just the leaf.
  let cursor = root;
  let leaf;
  for (const part of path.relative(root, target).split(path.sep)) {
    cursor = path.join(cursor, part); const info = await lstat(cursor);
    if (info.isSymbolicLink() || !within(root, await realpath(cursor))) throw new Error('LINK_NOT_ALLOWED');
    leaf = info;
  }
  if (!leaf?.isFile() || leaf.size > 1048576) throw new Error('FILE_LIMIT');
  const handle = await open(target, constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW | constants.O_NONBLOCK));
  try {
    const before = await handle.stat(); if (!before.isFile() || before.size > 1048576) throw new Error('FILE_LIMIT');
    const data = await handle.readFile(); const after = await handle.stat();
    if (data.length > 1048576 || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('FILE_CHANGED_DURING_COPY');
    return data;
  } finally { await handle.close(); }
}
export async function prepare(project, output) {
  const root = await realpath(project); const requested = path.resolve(output);
  // Windows temp/home paths can themselves be junctions. Compare canonical
  // locations so an aliased output cannot end up inside the source repository.
  const destination = path.join(await realpath(path.dirname(requested)), path.basename(requested));
  if (within(root, destination)) throw new Error('OUTPUT_MUST_BE_OUTSIDE_PROJECT');
  const top = (await command('git', ['-C', root, 'rev-parse', '--show-toplevel'])).trim();
  if (await realpath(top) !== root) throw new Error('SELECT_REPOSITORY_ROOT');
  const base = (await command('git', ['-C', root, 'rev-parse', 'HEAD'])).trim();
  const names = (await command('git', ['-C', root, 'ls-files', '-z'])).split('\0').filter(Boolean);
  if (!names.length || names.length > 2000 || new Set(names.map(name => name.toLowerCase())).size !== names.length) throw new Error('PROJECT_FILE_LIMIT');
  // Capture first, then create output: no partially prepared snapshot on read failure.
  const captured = []; const skipped = []; let total = 0;
  for (const name of names) {
    if (excluded(name)) { skipped.push(name); continue; }
    const source = path.resolve(root, name); if (!within(root, source)) throw new Error('PATH_NOT_ALLOWED');
    let info; try { info = await lstat(source); } catch (error) { if (error.code === 'ENOENT') { skipped.push(name); continue; } throw error; }
    if (info.isDirectory() && !info.isSymbolicLink()) { skipped.push(name); continue; }
    const data = await boundedFile(root, name);
    if (secretContent(data)) { skipped.push(name); continue; }
    total += data.length; if (total > 20 * 1024 * 1024) throw new Error('PROJECT_BYTE_LIMIT');
    captured.push({ name, data });
  }
  await mkdir(destination, { mode: 0o700 });
  await ensurePrivateDirectory(destination);
  const workspace = path.join(destination, 'workspace'); await mkdir(workspace, { mode: 0o700 });
  const baseline = path.join(destination, 'baseline'); await mkdir(baseline, { mode: 0o700 });
  for (const { name, data } of captured) {
    const target = path.resolve(workspace, name); if (!within(workspace, target)) throw new Error('PATH_NOT_ALLOWED');
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 }); await writeFile(target, data, { mode: 0o600, flag: 'wx' });
    const original = path.join(baseline, name); await mkdir(path.dirname(original), { recursive: true, mode: 0o700 }); await writeFile(original, data, { mode: 0o600, flag: 'wx' });
  }
  const manifest = { version: 1, source: root, base, createdAt: new Date().toISOString(), files: captured.map(({ name, data }) => ({ name, hash: hash(data), bytes: data.length })), skipped };
  await writeFile(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600, flag: 'wx' });
  await writeFile(path.join(destination, 'status.json'), JSON.stringify({ state: 'prepared' }), { mode: 0o600, flag: 'wx' });
  return { output: destination, files: captured.length, skipped, base };
}
function unified(name, before, after) {
  if ((before?.length || 0) + (after?.length || 0) > 32768 || before?.includes(0) || after?.includes(0) || (before && secretContent(before)) || (after && secretContent(after))) return { diffOmitted: 'Large, binary or sensitive file; review locally.' };
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let oldText; let newText; try { oldText = before ? decoder.decode(before) : ''; newText = after ? decoder.decode(after) : ''; } catch { return { diffOmitted: 'Binary file; review locally.' }; }
  const lines = text => text ? text.split('\n').slice(0, text.endsWith('\n') ? -1 : undefined) : [];
  const oldLines = lines(oldText); const newLines = lines(newText);
  if (oldLines.length + newLines.length > 1000) return { diffOmitted: 'Too many lines; review locally.' };
  const section = (items, text, prefix) => items.map((line,index) => prefix + line + '\n' + (index === items.length - 1 && !text.endsWith('\n') ? '\\ No newline at end of file\n' : '')).join('');
  return { diff: `--- ${before ? JSON.stringify('a/' + name) : '/dev/null'}\n+++ ${after ? JSON.stringify('b/' + name) : '/dev/null'}\n@@ -${oldLines.length ? 1 : 0},${oldLines.length} +${newLines.length ? 1 : 0},${newLines.length} @@\n` + section(oldLines, oldText, '-') + section(newLines, newText, '+') };
}
export async function changes(output, includeDiff = false) {
  const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
  const root = await realpath(path.join(output, 'workspace')); const current = new Map(); let count = 0; let total = 0;
  async function visit(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, item.name); const relative = path.relative(root, target).split(path.sep).join('/');
      if (excluded(relative)) continue;
      if (++count > 4000) throw new Error('RESULT_FILE_LIMIT');
      if (item.isSymbolicLink()) throw new Error('LINK_NOT_ALLOWED');
      if (item.isDirectory()) await visit(target);
      else {
        const data = await boundedFile(root, relative); total += data.length;
        if (total > 20 * 1024 * 1024) throw new Error('RESULT_BYTE_LIMIT');
        current.set(relative, { hash: hash(data), bytes: data.length, sensitive: secretContent(data) });
      }
    }
  }
  await visit(root);
  const result = [];
  for (const file of manifest.files) {
    const present = current.get(file.name); current.delete(file.name);
    if (!present) result.push({ name: file.name, status: 'deleted' });
    else if (present.hash !== file.hash) result.push({ name: file.name, status: 'modified', ...present });
  }
  for (const [name, present] of current) result.push({ name, status: 'added', ...present });
  if (includeDiff) {
    const baseline = await realpath(path.join(output, 'baseline')); let remaining = 256 * 1024;
    for (const item of result) {
      const before = item.status === 'added' ? null : await boundedFile(baseline, item.name);
      const expected = manifest.files.find(file => file.name === item.name);
      if (before && hash(before) !== expected?.hash) throw new Error('BASELINE_CHANGED');
      const after = item.status === 'deleted' ? null : await boundedFile(root, item.name);
      const patch = unified(item.name, before, after);
      if (patch.diff && Buffer.byteLength(patch.diff) > remaining) item.diffOmitted = 'Report limit; review locally.';
      else { Object.assign(item, patch); remaining -= patch.diff ? Buffer.byteLength(patch.diff) : 0; }
    }
  }
  return result;
}
