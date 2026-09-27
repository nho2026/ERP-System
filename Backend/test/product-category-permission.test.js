import assert from 'node:assert/strict';
import { test } from 'node:test';
import { effectivePermissions, missingRequestPermissions } from '../src/shared/security/access-policy.js';

test('product viewers can read categories without category write access', () => {
  const permissions = effectivePermissions(['inventory.products.view']);
  assert.ok(permissions.has('inventory.categories.view'));
  assert.deepEqual(missingRequestPermissions(permissions, 'GET', '/api/inventory/categories?all=true'), []);
  for (const action of ['create', 'update', 'delete']) assert.equal(permissions.has(`inventory.categories.${action}`), false);
});
test('unrelated permissions do not grant category access', () => {
  assert.equal(effectivePermissions(['profile.view']).has('inventory.categories.view'), false);
});
