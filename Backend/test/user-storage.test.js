import assert from 'node:assert/strict';
import { test } from 'node:test';
import { userModel } from '../src/modules/access-control/users/users.model.js';
import { userService } from '../src/modules/access-control/users/users.service.js';

test('assigns active storage to hospital department users and preserves it during unrelated edits', async t => {
  t.mock.method(userModel, 'findById', async () => ({ warehouseId: 'w1', department: 'Clinical', roles: [{ role: { id: 'r1', name: 'Warehouse Staff' } }] }));
  t.mock.method(userModel, 'isHospitalDepartment', async () => true);
  t.mock.method(userModel, 'findWarehouse', async id => ({ id, status: 'active' }));
  let saved;
  t.mock.method(userModel, 'update', async (_id, data) => { saved = data; return { ...data, roles: [] }; });
  await userService.update('u1', { warehouseId: 'w2' });
  assert.equal(saved.warehouseId, 'w2');
  await userService.update('u1', { name: 'Updated' });
  assert.equal(Object.hasOwn(saved, 'warehouseId'), false);
});

test('rejects invalid storage and clears assignment when hospital department is changed', async t => {
  t.mock.method(userModel, 'findById', async () => ({ warehouseId: 'w1', department: 'Clinical', roles: [{ role: { id: 'r1', name: 'Warehouse Staff' } }] }));
  const staff = t.mock.method(userModel, 'isHospitalDepartment', async () => true);
  t.mock.method(userModel, 'findWarehouse', async () => null);
  await assert.rejects(userService.update('u1', { warehouseId: 'missing' }), { status: 400 });
  staff.mock.mockImplementation(async () => false);
  t.mock.method(userModel, 'hasSuperadminRole', async () => false);
  let saved;
  t.mock.method(userModel, 'update', async (_id, data) => { saved = data; return { ...data, roles: [] }; });
  await userService.update('u1', { department: 'Office' });
  assert.equal(saved.warehouseId, null);
  await assert.rejects(userService.update('u1', { warehouseId: 'w1' }), { status: 400 });
});

test('storage eligibility uses hospital department type and active status', async t => {
  const { prisma } = await import('../src/shared/database/client.js');
  let query;
  const original = prisma.department.count;
  prisma.department.count = async args => { query = args; return 1; };
  t.after(() => { prisma.department.count = original; });
  assert.equal(await userModel.isHospitalDepartment('Clinical'), true);
  assert.deepEqual(query.where, { name: 'Clinical', type: 'hospital', status: 'active' });
  assert.equal(await userModel.isHospitalDepartment(''), false);
});

test('role API cannot overwrite the system code', async () => {
  const { roleSchema } = await import('../src/modules/access-control/roles/roles.schema.js');
  const parsed = roleSchema.parse({ name: 'Renamed warehouse team', code: 'warehouse_staff' });
  assert.equal(Object.hasOwn(parsed, 'code'), false);
});
