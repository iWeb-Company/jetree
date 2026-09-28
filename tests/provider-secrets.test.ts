import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptProviderSecret, encryptProviderSecret } from '../src/lib/server/provider-secrets';

test('provider keys are encrypted with a unique IV and can be decrypted server-side', () => {
  const previousKey = process.env.JETREE_CREDENTIALS_ENCRYPTION_KEY;
  process.env.JETREE_CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

  try {
    const apiKey = 'provider-secret-example';
    const first = encryptProviderSecret(apiKey);
    const second = encryptProviderSecret(apiKey);

    assert.equal(decryptProviderSecret(first), apiKey);
    assert.notEqual(first.ciphertext, apiKey);
    assert.notEqual(first.iv, second.iv);
    assert.notEqual(first.ciphertext, second.ciphertext);
  } finally {
    if (previousKey === undefined) delete process.env.JETREE_CREDENTIALS_ENCRYPTION_KEY;
    else process.env.JETREE_CREDENTIALS_ENCRYPTION_KEY = previousKey;
  }
});

test('the credential vault refuses a missing or incorrectly sized encryption key', () => {
  const previousKey = process.env.JETREE_CREDENTIALS_ENCRYPTION_KEY;
  delete process.env.JETREE_CREDENTIALS_ENCRYPTION_KEY;
  assert.throws(() => encryptProviderSecret('provider-secret-example'), /SERVER_CONFIGURATION_ERROR/);

  process.env.JETREE_CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(16, 7).toString('base64');
  assert.throws(() => encryptProviderSecret('provider-secret-example'), /SERVER_CONFIGURATION_ERROR/);

  if (previousKey === undefined) delete process.env.JETREE_CREDENTIALS_ENCRYPTION_KEY;
  else process.env.JETREE_CREDENTIALS_ENCRYPTION_KEY = previousKey;
});
