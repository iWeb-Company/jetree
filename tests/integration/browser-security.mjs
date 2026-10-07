import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const origin = process.env.JETREE_SMOKE_URL || 'http://127.0.0.1:3057';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const first = await fetch(origin);
const second = await fetch(origin);
const firstPolicy = first.headers.get('content-security-policy');
const secondPolicy = second.headers.get('content-security-policy');
assert.ok(firstPolicy && secondPolicy);
assert.notEqual(firstPolicy, secondPolicy, 'nonces must change per response');
assert.match(first.headers.get('cache-control'), /no-store/);
assert.equal(first.headers.get('x-frame-options'), 'DENY');
assert.equal(first.headers.get('x-content-type-options'), 'nosniff');
assert.equal(first.headers.get('referrer-policy'), 'no-referrer');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', event => {
      window.__cspViolations.push(event.effectiveDirective);
    });
  });
  const response = await page.goto(origin, { waitUntil: 'networkidle' });
  const policy = response.headers()['content-security-policy'];
  const nonce = policy.match(/'nonce-([^']+)'/)[1];
  const inlineNonces = await page.locator('script:not([src])').evaluateAll(scripts => scripts.map(script => script.nonce));
  assert.ok(inlineNonces.length > 0);
  assert.ok(inlineNonces.every(value => value === nonce), 'Next.js inline scripts need the response nonce');
  assert.deepEqual(await page.evaluate(() => window.__cspViolations), []);
  console.log('PASS dynamic CSP, security headers, inline nonce propagation and browser execution');
} finally {
  await browser.close();
}
