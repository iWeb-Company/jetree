import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceIsOnline, selectedModelSource, validDeviceToken } from '../../src/lib/model-device-contract';
import { readBoundedJson } from '../../src/lib/server/bounded-json';

test('a personal connection stays selected on failure instead of switching to API', () => {
  assert.equal(selectedModelSource('local'), 'local');
  assert.throws(() => selectedModelSource('oauth-pretend'), /MODEL_SOURCE_INVALID/);
  assert.equal(selectedModelSource(undefined), 'api');
});
test('revoked or stale devices cannot be selected as online', () => {
  const now = Date.now();
  assert.equal(deviceIsOnline(new Date(now - 1000).toISOString(), null, now), true);
  assert.equal(deviceIsOnline(new Date(now - 21_000).toISOString(), null, now), false);
  assert.equal(deviceIsOnline(new Date(now).toISOString(), new Date(now).toISOString(), now), false);
  assert.equal(deviceIsOnline('invalid', null, now), false);
  assert.equal(deviceIsOnline(new Date(now + 1000).toISOString(), null, now), false);
  assert.equal(validDeviceToken('a'.repeat(64)), true);
  assert.equal(validDeviceToken('weak-token'), false);
});
test('public pairing bounds chunked JSON even when content length is absent or false', async () => {
  const request = new Request('https://example.test', { method: 'POST', body: JSON.stringify({ code: 'a'.repeat(5000) }), headers: { 'Content-Length': '1' } });
  await assert.rejects(() => readBoundedJson(request, 2048), /BODY_TOO_LARGE/);
  await assert.rejects(() => readBoundedJson(new Request('https://example.test', { method: 'POST', body: 'null' }), 2048), /BODY_INVALID/);
});
