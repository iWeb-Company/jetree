import assert from 'node:assert/strict';
import { test } from 'node:test';
import { githubAccessForCredentials, githubScopeGranted } from '../../src/lib/agents/github-access';

test('private repositories require both an explicit choice and a granted repo scope', () => {
  assert.equal(githubAccessForCredentials('repo,read:user', 'private'), 'private');
  assert.equal(githubAccessForCredentials('repo,read:user', 'public'), 'public');
  assert.equal(githubAccessForCredentials('repo,read:user', undefined), 'public');
  assert.equal(githubAccessForCredentials('public_repo,read:user', 'private'), 'public');
});

test('normalized broad scopes satisfy public access without silently selecting private mode', () => {
  assert.equal(githubScopeGranted('repo,read:user', 'public'), true);
  assert.equal(githubScopeGranted('public_repo,read:user', 'public'), true);
  assert.equal(githubScopeGranted('public_repo,read:user', 'private'), false);
  assert.equal(githubScopeGranted('read:user', 'public'), false);
});
