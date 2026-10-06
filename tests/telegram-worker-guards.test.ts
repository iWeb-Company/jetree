import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTelegramOwnerAccess, reserveTelegramExecution } from '../src/lib/telegram-worker-guards';
const allowed = { profileRole: 'member', ownerId: 'owner', departmentCreatorId: 'creator', isMember: true, agentArchived: false, departmentArchived: false };
test('Telegram rejects revoked membership and missing profiles but permits creators and admins', () => {
  assert.doesNotThrow(() => assertTelegramOwnerAccess(allowed));
  assert.throws(() => assertTelegramOwnerAccess({ ...allowed, isMember: false }), /BOT_OWNER_ACCESS_REVOKED/);
  assert.throws(() => assertTelegramOwnerAccess({ ...allowed, profileRole: null }), /BOT_OWNER_ACCESS_REVOKED/);
  assert.doesNotThrow(() => assertTelegramOwnerAccess({ ...allowed, isMember: false, departmentCreatorId: 'owner' }));
  assert.doesNotThrow(() => assertTelegramOwnerAccess({ ...allowed, isMember: false, profileRole: 'admin' }));
});
test('Telegram rejects archived agents and departments even for administrators', () => {
  for (const archived of [{ agentArchived: true }, { departmentArchived: true }]) {
    assert.throws(() => assertTelegramOwnerAccess({ ...allowed, profileRole: 'admin', ...archived }), /ARCHIVED/);
  }
});
test('Telegram fails closed for exhausted quota or database errors', async () => {
  await assert.rejects(reserveTelegramExecution('20', async () => ({ data: false, error: null })), /LIMIT_REACHED/);
  await assert.rejects(reserveTelegramExecution('20', async () => ({ data: true, error: {} })), /QUOTA_UNAVAILABLE/);
  await reserveTelegramExecution('20', async limit => { assert.equal(limit, 20); return { data: true, error: null }; });
});
test('Invalid Telegram execution limits never invoke the quota database', async () => {
  for (const limit of [undefined, '', '0', '-1', '1.5', 'NaN']) {
    await assert.rejects(reserveTelegramExecution(limit, async () => { assert.fail('must not access database'); }), /NOT_CONFIGURED/);
  }
});
