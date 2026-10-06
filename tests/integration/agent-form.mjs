import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';

const origin = process.env.JETREE_APP_URL;
assert.equal(new URL(origin).hostname, '127.0.0.1');
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname, 'lgimqhuohkjtwfxbaecb.supabase.co');
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const run = randomUUID();
const email = `jetree-form-${run}@example.invalid`;
const password = randomBytes(32).toString('base64url') + '!Aa1';
let userId, departmentId, browser;
function checked(result) { assert.equal(result.error, null); return result.data; }
try {
  userId = checked(await service.auth.admin.createUser({ email, password, email_confirm: true })).user.id;
  departmentId = checked(await service.from('departments').insert({ name: `Form-${run}`, created_by: userId }).select('id').single()).id;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('**/api/departments', async route => { await new Promise(resolve => setTimeout(resolve, 500)); await route.continue(); });
  await page.goto(origin);
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.getByRole('button', { name: 'Acceder al Workspace' }).click();
  await page.getByRole('button', { name: 'Cerrar Sesión' }).waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Agentes IA', exact: true }).click();
  await page.getByRole('button', { name: /Crear Nuevo Agente/ }).click();
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Crear y Activar Agente' }) });
  await form.locator('input').first().fill(`Agent-${run}`);
  assert.equal(await form.locator('select').first().inputValue(), departmentId);
  // Do not change the department selector: this reproduces the initial-state bug.
  const saved = page.waitForResponse(response => response.url().endsWith('/api/agents') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Crear y Activar Agente' }).click();
  const response = await saved;
  assert.equal(response.status(), 201);
  assert.equal((await response.json()).agent.department_id, departmentId);
  await page.reload();
  await page.getByText(`Agent-${run}`, { exact: true }).first().waitFor({ timeout: 60000 });
  if (process.env.JETREE_UI_SCREENSHOT) await page.screenshot({ path: process.env.JETREE_UI_SCREENSHOT, fullPage: true });
  await page.getByRole('button', { name: 'Cerrar Sesión' }).click();
  await page.locator('input[type=password]').waitFor();
  console.log('PASS delayed department loading, untouched selector, HTTP agent creation and reload persistence');
} finally {
  await browser?.close();
  if (userId) {
    checked(await service.from('activity_logs').delete().eq('user_id', userId));
    if (departmentId) checked(await service.from('departments').delete().eq('id', departmentId));
    checked(await service.auth.admin.deleteUser(userId));
  }
  console.log('Synthetic form fixtures cleaned');
}
