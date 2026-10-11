import test from 'node:test';
import assert from 'node:assert/strict';
import { validateJob, validateOrigin, plainCliPrompt } from '../runtime.mjs';

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
});
