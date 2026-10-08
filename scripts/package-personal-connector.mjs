import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const destination = resolve('public/downloads');
mkdirSync(destination, { recursive: true });
// Fixed, reviewed file allowlist. Never package credentials, local profiles or dependencies.
execFileSync('tar', ['-czf', resolve(destination, 'jetree-google-connector.tar.gz'), '-C', resolve('connector'), 'package.json', 'package-lock.json', 'jetree-connector.mjs', 'runtime.mjs', 'README.md'], { stdio: 'inherit' });
