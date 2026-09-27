import assert from "node:assert/strict";
import { test } from "node:test";
import { actOnDepartmentRequest } from "../src/modules/inventory/department-orders/department-request-actions.js";
import { requestPermission } from "../src/shared/security/access-policy.js";

function fixture({ status = "pending", found = true, count = 1 } = {}) {
  const notifications = [];
  const writes = [];
  const tx = {
    inventoryDepartmentOrder: {
      findFirst: async ({ where }) => {
        assert.deepEqual(where, { id: "order-1", departmentId: "department-1" });
        return found ? { id: "order-1", departmentId: "department-1", departmentName: "Cardiology", items: [{}], status } : null;
      },
      updateMany: async args => { writes.push(args); return { count }; },
    },
    user: { findMany: async () => [{ id: "admin", status: "active", roles: [{ role: { name: "Super Administrator" } }] }] },
    notification: { createMany: async args => notifications.push(...args.data) },
  };
  return { db: { $transaction: async run => run(tx) }, notifications, writes };
}

test("cancels only the department's pending order without stock operations", async () => {
  const { db, writes, notifications } = fixture();
  const result = await actOnDepartmentRequest(db, "order-1", "department-1", "cancel");
  assert.equal(result.status, "cancelled");
  assert.deepEqual(writes, [{ where: { id: "order-1", departmentId: "department-1", status: "pending" }, data: { status: "cancelled" } }]);
  assert.equal(notifications.length, 0);
});

test("reminders produce fresh notification keys on each send", async () => {
  const { db, notifications } = fixture();
  for (let i = 0; i < 2; i++) await actOnDepartmentRequest(db, "order-1", "department-1", "remind");
  assert.equal(notifications.length, 2);
  assert.notEqual(notifications[0].reminderKey, notifications[1].reminderKey);
  assert.equal(notifications[0].title, "Request order reminder");
});

test("missing, other-department, finalized, and concurrently approved orders cannot be acted on", async () => {
  for (const action of ["cancel", "remind"]) {
    for (const options of [{ found: false }, { status: "approved" }, { status: "completed" }, { status: "rejected" }, { status: "cancelled" }, { count: 0 }]) {
      const { db, notifications } = fixture(options);
      await assert.rejects(actOnDepartmentRequest(db, "order-1", "department-1", action), { status: options.found === false ? 404 : 409 });
      assert.equal(notifications.length, 0);
    }
  }
});

test("request actions require request creation permission", () => {
  for (const action of ["cancel", "remind"]) {
    assert.equal(requestPermission("POST", `/api/inventory/department-requests/order-1/${action}`), "inventory.department-requests.create");
  }
});
