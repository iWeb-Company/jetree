import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appBaseUrl } from '../src/lib/server/tool-connections';

test('OAuth permits HTTP loopback and HTTPS while rejecting unsafe origins', () => {
  const previous = process.env.JETREE_APP_URL;
  try {
    for (const origin of ['http://localhost:3058', 'http://127.0.0.1:3058', 'http://[::1]:3058', 'https://jetree.example']) {
      process.env.JETREE_APP_URL = origin;
      assert.equal(appBaseUrl(), origin);
    }
    for (const origin of ['http://jetree.example', 'ftp://localhost', 'https://user:password@jetree.example', 'http://127.0.0.1.attacker.example']) {
      process.env.JETREE_APP_URL = origin;
      assert.throws(appBaseUrl, /TOOL_OAUTH_NOT_CONFIGURED/);
    }
  } finally {
    if (previous === undefined) delete process.env.JETREE_APP_URL;
    else process.env.JETREE_APP_URL = previous;
  }
});
