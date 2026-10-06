import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

assert.equal(process.env.CI, 'true');
const status = JSON.parse(fs.readFileSync(path.join(process.env.RUNNER_TEMP, 'jetree-local-status.json'), 'utf8'));
assert.equal(status.API_URL, 'http://127.0.0.1:54321');
assert.ok(status.ANON_KEY && status.SERVICE_ROLE_KEY);
const env = {
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  JETREE_APP_URL: 'http://127.0.0.1:3057',
  JETREE_CREDENTIALS_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  JETREE_TELEGRAM_WORKER_SECRET: randomBytes(32).toString('hex'),
  JETREE_WORKSPACE_DAILY_EXECUTION_LIMIT: '20',
  JETREE_DISPOSABLE_CI: 'true',
  GITHUB_OAUTH_CLIENT_ID: 'synthetic-client',
  GITHUB_OAUTH_CLIENT_SECRET: 'synthetic-secret',
  GOOGLE_OAUTH_CLIENT_ID: 'synthetic-client',
  GOOGLE_OAUTH_CLIENT_SECRET: 'synthetic-secret',
};
for (const [key, value] of Object.entries(env)) {
  assert.ok(!/[\r\n]/.test(value));
  console.log(`::add-mask::${value}`);
  fs.appendFileSync(process.env.GITHUB_ENV, `${key}=${value}\n`);
}
