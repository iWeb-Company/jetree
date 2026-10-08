import test from 'node:test';
import assert from 'node:assert/strict';
import { childEnvironment, decodeReply, isolatedSettings, validateJob, validateOrigin, plainCliPrompt } from '../runtime.mjs';

test('local runtime cannot inherit API billing, endpoint overrides or Node injection', () => {
  const env = childEnvironment({ GEMINI_API_KEY: 'secret', GOOGLE_API_KEY: 'secret', GOOGLE_GENAI_USE_VERTEXAI: 'true',
    GOOGLE_CLOUD_PROJECT: 'project', GOOGLE_APPLICATION_CREDENTIALS: '/key', NODE_OPTIONS: '--require evil',
    HTTPS_PROXY: 'https://evil', GEMINI_CLI_HOME: '/shared', PATH: '/bin' }, '/personal', '/personal/settings.json');
  assert.equal(env.GEMINI_CLI_HOME, '/personal');
  assert.equal(env.GOOGLE_GENAI_USE_GCA, 'true');
  for (const key of ['GEMINI_API_KEY','GOOGLE_API_KEY','GOOGLE_GENAI_USE_VERTEXAI','GOOGLE_CLOUD_PROJECT',
    'GOOGLE_APPLICATION_CREDENTIALS','NODE_OPTIONS','HTTPS_PROXY']) assert.equal(env[key], undefined);
  const settings = isolatedSettings('/deny.toml');
  assert.deepEqual(settings.tools.core, []);
  assert.equal(settings.admin.mcp.enabled, false);
  assert.equal(settings.admin.extensions.enabled, false);
  assert.equal(settings.hooksConfig.enabled, false);
  assert.equal(settings.security.auth.enforcedType, 'oauth-personal');
});
test('remote text cannot invoke CLI file expansion or slash preprocessing', () => {
  const prompt = '/command\n@/etc/passwd @C:\\secrets.txt @https://resource.test !run\nemail@example.test';
  const encoded = plainCliPrompt(prompt);
  assert.equal(encoded.includes('@'), false);
  assert.equal(encoded.startsWith('/'), false);
  assert.equal(JSON.parse(encoded.slice(encoded.indexOf('\n') + 1)), prompt);
});
test('transport refuses non Jetree origins, expired work and partial/tool replies', () => {
  assert.throws(() => validateOrigin('https://jetree.iwebtecnology.com.evil.test'));
  assert.throws(() => validateOrigin('http://jetree.iwebtecnology.com'));
  assert.throws(() => validateJob({ id: '1'.repeat(36), lease: 'a'.repeat(64), prompt: 'hi', expiresAt: new Date(0).toISOString() }));
  assert.throws(() => decodeReply('{"response":"ok","error":{"code":1}}'));
  assert.throws(() => decodeReply('{"response":"ok","stats":{"tools":{"totalCalls":1}}}'));
  assert.equal(decodeReply('{"response":"account response"}'), 'account response');
});
