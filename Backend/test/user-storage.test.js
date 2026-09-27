import assert from 'node:assert/strict';
import { test } from 'node:test';
import { userModel } from '../src/modules/access-control/users/users.model.js';
import { userService } from '../src/modules/access-control/users/users.service.js';

test('assigns active storage to warehouse staff and preserves it during unrelated edits', async t => {
  t.mock.method(userModel, 'findById', async () => ({ warehouseId: 'w1', roles: [{ role: { id: 'r1', name: 'Warehouse Staff' } }] }));
  t.mock.method(userModel, 'hasWarehouseStaffRole', async () => true);
  t.mock.method(userModel, 'findWarehouse', async id => ({ id, status: 'active' }));
  let saved;
  t.mock.method(userModel, 'update', async (_id, data) => { saved = data; return { ...data, roles: [] }; });
  await userService.update('u1', { warehouseId: 'w2' });
  assert.equal(saved.warehouseId, 'w2');
  await userService.update('u1', { name: 'Updated' });
  assert.equal(Object.hasOwn(saved, 'warehouseId'), false);
});

test('rejects invalid storage and clears assignment when staff role is removed', async t => {
  t.mock.method(userModel, 'findById', async () => ({ warehouseId: 'w1', roles: [{ role: { id: 'r1', name: 'Warehouse Staff' } }] }));
  const staff = t.mock.method(userModel, 'hasWarehouseStaffRole', async () => true);
  t.mock.method(userModel, 'findWarehouse', async () => null);
  await assert.rejects(userService.update('u1', { warehouseId: 'missing' }), { status: 400 });
  staff.mock.mockImplementation(async () => false);
  t.mock.method(userModel, 'hasSuperadminRole', async () => false);
  let saved;
  t.mock.method(userModel, 'update', async (_id, data) => { saved = data; return { ...data, roles: [] }; });
  await userService.update('u1', { roleIds: ['other'] });
  assert.equal(saved.warehouseId, null);
  await assert.rejects(userService.update('u1', { warehouseId: 'w1' }), { status: 400 });
});
