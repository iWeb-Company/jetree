import test from 'node:test';
import assert from 'node:assert/strict';
import { antigravityEnvironment, antigravitySettings, antigravityArguments, decodeAntigravityReply, RELEASES, validateAntigravityInit, CHAT_AGENT } from '../antigravity.mjs';

test('Antigravity profile excludes provider billing and configuration overrides', () => {
  const env = antigravityEnvironment({ PATH: '/bin', GEMINI_API_KEY: 'secret', GOOGLE_API_KEY: 'secret', AGY_ACCOUNT: 'other', ANTIGRAVITY_APP_DATA_DIR: '/shared', GOOGLE_APPLICATION_CREDENTIALS: '/key', NODE_OPTIONS: '--require evil', HTTPS_PROXY: 'https://evil' }, '/isolated');
  assert.equal(env.HOME, '/isolated');
  assert.equal(env.USERPROFILE, '/isolated');
  for (const key of ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'AGY_ACCOUNT', 'ANTIGRAVITY_APP_DATA_DIR', 'GOOGLE_APPLICATION_CREDENTIALS', 'NODE_OPTIONS', 'HTTPS_PROXY']) assert.equal(env[key], undefined);
  assert.equal(env.AGY_CLI_DISABLE_AUTO_UPDATE, 'true');
  const settings = antigravitySettings();
  assert.equal(settings.useG1Credits, false);
  assert.equal(settings.toolPermission, 'strict');
  assert.deepEqual(settings.permissions.allow, []);
  for (const action of ['read_file', 'write_file', 'command', 'unsandboxed', 'read_url', 'execute_url', 'mcp']) assert.ok(settings.permissions.deny.includes(`${action}(*)`));
  assert.ok(antigravityArguments().includes('--disable-slash-commands'));
  assert.ok(!antigravityArguments().includes('--dangerously-skip-permissions'));
  for (const release of Object.values(RELEASES)) {
    assert.equal(new URL(release.url).origin, 'https://storage.googleapis.com');
    assert.match(release.sha512, /^[a-f0-9]{128}$/);
  }
});
test('native handshake rejects another model, agent or weakened permissions before prompt delivery', () => {
  const model = 'gemini-3.8-flash-low';
  const event = { event:'init', init:{model,agent:CHAT_AGENT,permission_mode:'strict'} };
  validateAntigravityInit(event, model);
  for (const patch of [{model:'claude-opus-4-6-thinking'},{agent:'other'},{permission_mode:'always-proceed'}]) assert.throws(() => validateAntigravityInit({...event,init:{...event.init,...patch}}, model));
  assert.throws(() => antigravityArguments('claude-sonnet-4-6'));
});
test('Antigravity stream rejects partial, duplicate, failed, tool and subagent results', () => {
  const init = { event: 'init', init: { permission_mode: 'strict' } };
  const final = { event: 'result', result: { status: 'SUCCESS', response: 'respuesta de cuenta' } };
  const stream = (...events) => events.map(event => JSON.stringify(event)).join('\n');
  assert.equal(decodeAntigravityReply(stream(init, final)), 'respuesta de cuenta');
  assert.throws(() => decodeAntigravityReply(stream(final)));
  assert.throws(() => decodeAntigravityReply(stream(init, final, final)));
  assert.throws(() => decodeAntigravityReply(stream(init, { event: 'result', result: { status: 'WAITING', response: 'x' } })));
  assert.throws(() => decodeAntigravityReply(stream(init, { event: 'step_update', step_update: { step_type: 'tool', tool_name: 'view_file' } }, final)));
  assert.throws(() => decodeAntigravityReply(stream(init, { event: 'step_update', step_update: { subagent_info: {} } }, final)));
  assert.throws(() => decodeAntigravityReply(stream(init, { event: 'result', result: { status: 'SUCCESS', response: 'x', error: 'quota' } })));
});
