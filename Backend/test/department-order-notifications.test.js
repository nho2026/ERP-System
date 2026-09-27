import assert from "node:assert/strict";
import { test } from "node:test";
import { notifyDepartmentOrder } from "../src/modules/inventory/department-orders/department-order-notifications.js";
import { departmentOrdersModel } from "../src/modules/inventory/department-orders/department-orders.model.js";

const user = (id, keys = [], name = "Warehouse staff", status = "active") => ({
  id, status, roles: [{ role: { name, permissions: keys.map(key => ({ permission: { key } })) } }],
});
const order = { id: "order-1", departmentName: "Cardiology", items: [{ productId: "product-1", warehouseId: "warehouse-1", quantity: 2 }] };

test("notifies warehouse reviewers and superadmins, excluding unrelated and inactive users", async () => {
  let notificationData;
  await notifyDepartmentOrder({
    user: { findMany: async (args) => {
      assert.equal(args.where.status, "active");
      return [user("staff", ["inventory.department-orders.view"]), user("admin", [], "Super Administrator"), user("requester", ["inventory.department-requests.view"]), user("inactive", ["inventory.department-orders.view"], "Warehouse staff", "inactive")];
    } },
    notification: { createMany: async args => { notificationData = args; } },
  }, order);
  assert.deepEqual(notificationData.data.map(item => item.userId), ["staff", "admin"]);
  assert.equal(notificationData.skipDuplicates, true);
  for (const item of notificationData.data) {
    assert.equal(item.type, "department_order_requested");
    assert.match(item.body, /Cardiology/);
    assert.equal(item.route, "/warehouses/buy/department-orders?search=order-1");
    assert.equal(item.reminderKey, `department-order:order-1:${item.userId}`);
  }
});

test("no eligible recipients does not block an order", async () => {
  await notifyDepartmentOrder({ user: { findMany: async () => [] }, notification: { createMany: () => assert.fail("Unexpected notification") } }, order);
});

test("order creation and notification writes share a transaction and propagate notification failure", async () => {
  let saved = false;
  const db = {
    inventoryProduct: { findUnique: async () => ({ name: "Bandage", status: "active" }) },
    inventoryWarehouse: { findUnique: async () => ({ name: "Main", status: "active" }) },
    $transaction: async run => run({
      inventoryDepartmentOrder: { create: async ({ data }) => { saved = true; assert.equal(data.status, "pending"); return { ...data, id: order.id }; } },
      user: { findMany: async () => [user("admin", [], "Super Administrator")] },
      notification: { createMany: async () => { assert.equal(saved, true); throw new Error("Notification write failed"); } },
    }),
  };
  await assert.rejects(departmentOrdersModel.create(order, db), /Notification write failed/);
});
