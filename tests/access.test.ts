import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessDepartment, isWorkspaceAdmin } from '../src/lib/auth/access';

test('configured administrators can access every department', () => {
  assert.equal(isWorkspaceAdmin('facundod@iwebtecnology.com'), true);
  assert.equal(canAccessDepartment('valentind@iwebtecnology.com', 'department-x'), true);
});

test('non administrators are limited to assigned departments', () => {
  assert.equal(canAccessDepartment('member@example.com', 'department-x', ['department-y']), false);
  assert.equal(canAccessDepartment('member@example.com', 'department-y', ['department-y']), true);
});
