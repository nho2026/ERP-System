import assert from "node:assert/strict";
import { test } from "node:test";
import { departmentOrdersModel } from "../src/modules/inventory/department-orders/department-orders.model.js";
import { departmentOrderUpdate } from "../src/modules/inventory/department-orders/department-orders.schema.js";

function fixture(status = "approved", count = 1, issues = [{ productId: "p1", warehouseId: "w1", quantity: -4 }, { productId: "p2", warehouseId: "w2", quantity: -2 }]) {
  let current = { id: "order-1", departmentId: "d1", departmentName: "Cardiology", status };
  const stocks = [], movements = [];
  const tx = {
    inventoryDepartmentOrder: {
      findUnique: async () => current,
      updateMany: async ({ where, data }) => {
        assert.equal(where.status, status);
        if (count) current = { ...current, ...data };
        return { count };
      },
    },
    inventoryStock: { upsert: async args => stocks.push(args) },
    inventoryMovement: {
      findMany: async ({ where }) => { assert.deepEqual(where, { reference: "order-1", movementType: "department_issue" }); return issues; },
      create: async ({ data }) => movements.push(data),
    },
  };
  return { db: { $transaction: async run => run(tx) }, stocks, movements };
}

test("approved and completed orders restore actual issued quantities to original storages", async () => {
  assert.equal(departmentOrderUpdate.parse({ status: "returned" }).status, "returned");
  for (const status of ["approved", "completed"]) {
    const { db, stocks, movements } = fixture(status);
    const order = await departmentOrdersModel.update("order-1", { status: "returned" }, db);
    assert.equal(order.status, "returned");
    assert.deepEqual(stocks.map(item => item.where.productId_warehouseId), [{ productId: "p1", warehouseId: "w1" }, { productId: "p2", warehouseId: "w2" }]);
    assert.deepEqual(stocks.map(item => item.update.quantity.increment), [4, 2]);
    assert.deepEqual(movements.map(item => [item.movementType, item.quantity, item.reference]), [["department_return", 4, "order-1"], ["department_return", 2, "order-1"]]);
    await departmentOrdersModel.update("order-1", { status: "returned" }, db);
    assert.equal(stocks.length, 2, "retry must not restore stock twice");
  }
});

test("pending, cancelled, rejected and conflicting returns do not change stock", async () => {
  for (const [status, count] of [["pending", 1], ["cancelled", 1], ["rejected", 1], ["approved", 0]]) {
    const { db, stocks, movements } = fixture(status, count);
    await assert.rejects(departmentOrdersModel.update("order-1", { status: "returned" }, db), { status: 409 });
    assert.equal(stocks.length, 0);
    assert.equal(movements.length, 0);
  }
});

test("legacy orders without issued movements cannot manufacture returned stock", async () => {
  const { db, stocks } = fixture("approved", 1, []);
  await assert.rejects(departmentOrdersModel.update("order-1", { status: "returned" }, db), /no valid issued stock records/);
  assert.equal(stocks.length, 0);
});
