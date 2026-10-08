import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { childEnvironment, isolatedSettings, CLI_VERSION } from '../runtime.mjs';

test('pinned CLI actually loads private user isolation settings without admin ownership', { timeout: 120000 }, () => {
  const fixture = mkdtempSync(join(tmpdir(), 'jetree-cli-settings-'));
  try {
    const home = join(fixture, 'home'); const workspace = join(fixture, 'empty-workspace');
    mkdirSync(join(home, '.gemini'), { recursive: true }); mkdirSync(workspace);
    const policy = join(fixture, 'deny.toml');
    writeFileSync(policy, '[[rule]]\ntoolName = "*"\ndecision = "deny"\npriority = 999\n');
    writeFileSync(join(home, '.gemini', 'settings.json'), JSON.stringify(isolatedSettings(policy)));
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '@google', 'gemini-cli');
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')); assert.equal(pkg.version, CLI_VERSION);
    const bundle = join(root, 'bundle');
    const loader = readdirSync(bundle).find(name => name.startsWith('chunk-') && name.endsWith('.js') && /function loadSettings\(/.test(readFileSync(join(bundle, name), 'utf8')));
    assert.ok(loader, 'real pinned CLI settings loader must exist');
    const script = `const {loadSettings}=await import(${JSON.stringify(pathToFileURL(join(bundle, loader)).href)}); const loaded=loadSettings(process.cwd()); console.log(JSON.stringify({core:loaded.merged.tools.core,hooks:loaded.merged.hooksConfig.enabled,skills:loaded.merged.skills.enabled,mcp:loaded.merged.mcpServers,policy:loaded.merged.policyPaths,auth:loaded.merged.security.auth,errors:loaded.errors}));`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: workspace, env: childEnvironment(process.env, home, join(fixture, 'absent-system.json')),
      encoding: 'utf8', timeout: 90000, windowsHide: true, shell: false,
    });
    const output = (result.stdout || '') + (result.stderr || '');
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, output);
    const loaded = JSON.parse(result.stdout.trim());
    assert.deepEqual(loaded.core, []); assert.equal(loaded.hooks, false); assert.equal(loaded.skills, false);
    assert.deepEqual(loaded.mcp, {}); assert.deepEqual(loaded.policy, [policy]);
    assert.equal(loaded.auth.enforcedType, 'oauth-personal'); assert.equal(loaded.auth.selectedType, 'oauth-personal');
    assert.deepEqual(loaded.errors, []);
    assert.doesNotMatch(output, /Skipping system settings|is insecure/i);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});
