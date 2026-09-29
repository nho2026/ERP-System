import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taskSchema, updateTaskSchema } from '../src/modules/task-management/tasks/tasks.schema.js';
import { taskService } from '../src/modules/task-management/tasks/tasks.service.js';
import { taskModel } from '../src/modules/task-management/tasks/tasks.model.js';

const hr = new Set(['tasks.list.manage_all', 'tasks.list.approve']);
test('task schemas support the workflow statuses', () => {
  for (const status of ['todo', 'in_progress', 'incomplete', 'review', 'completed', 'rejected']) {
    assert.equal(updateTaskSchema.safeParse({ status }).success, true);
    assert.equal(taskSchema.safeParse({ title: 'Task', description: 'Description', assigneeIds: ['employee'], status }).success, true);
  }
  assert.equal(updateTaskSchema.safeParse({ status: 'cancelled' }).success, false);
});
test('project filter is passed to task rows and status counts', async (t) => {
  t.mock.method(taskModel, 'findPage', async (where) => where);
  const result = await taskService.list({ projectId: 'project-a' }, { id: 'hr' }, hr);
  assert.equal(result.projectId, 'project-a');
});
test('HR rejection records reviewer and requires review', async (t) => {
  let status = 'review';
  t.mock.method(taskModel, 'findAccess', async () => ({ status, createdById: 'hr', assignees: [] }));
  t.mock.method(taskModel, 'update', async (_, data) => ({ ...data, id: 'task', assignees: [] }));
  t.mock.method(taskModel, 'hrUserIds', async () => []);
  t.mock.method(taskModel, 'employeeScopes', async () => []);
  t.mock.method(taskModel, 'notify', async () => {});
  const result = await taskService.update('task', { id: 'hr' }, hr, { status: 'rejected' });
  assert.equal(result.status, 'rejected');
  assert.equal(result.completedAt, null);
  assert.ok(result.reviewedAt instanceof Date);
  assert.deepEqual(result.reviewedBy, { connect: { id: 'hr' } });
  status = 'todo';
  await assert.rejects(taskService.update('task', { id: 'hr' }, hr, { status: 'rejected' }), { status: 409 });
  status = 'review';
  await assert.rejects(taskService.update('task', { id: 'hr' }, new Set(), { status: 'rejected' }), { status: 403 });
});

test('assigned users can update progress but cannot approve or reject', async (t) => {
  const employee = { id: 'user', employee: { id: 'employee' } };
  let currentStatus = 'todo';
  t.mock.method(taskModel, 'findAccess', async () => ({ status: currentStatus, createdById: 'creator', assignees: [{ employeeId: 'employee', employee: {} }] }));
  t.mock.method(taskModel, 'update', async (_, data) => ({ ...data, id: 'task', assignees: [] }));
  t.mock.method(taskModel, 'hrUserIds', async () => []);
  t.mock.method(taskModel, 'employeeScopes', async () => []);
  t.mock.method(taskModel, 'notify', async () => {});
  for (const status of ['todo', 'in_progress', 'incomplete', 'review']) {
    const input = updateTaskSchema.parse({ status });
    assert.deepEqual(Object.keys(input), ['status']);
    const result = await taskService.update('task', employee, new Set(), input);
    assert.equal(result.status, status);
  }
  for (const status of ['completed', 'rejected']) {
    await assert.rejects(taskService.update('task', employee, new Set(), { status }), { status: 403 });
    await assert.rejects(taskService.update('task', { id: 'manager' }, new Set(['tasks.list.manage_all']), { status }), { status: 403 });
  }
  await assert.rejects(taskService.update('task', { id: 'creator' }, new Set(), { status: 'in_progress' }), { status: 403 });
  currentStatus = 'completed';
  await assert.rejects(taskService.update('task', employee, new Set(), { status: 'todo' }), { status: 403 });
});
