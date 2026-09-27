import assert from "node:assert/strict";
import { test } from "node:test";
import { setStockQuantity } from "../src/modules/inventory/stock/set-quantity.js";
function fixture(quantity, count = 1) {
  const movements = [], updates = [];
  const db = { $transaction: async run => run({
    inventoryStock: {
      upsert: async () => ({ quantity }),
      updateMany: async args => { updates.push(args); return { count }; },
    },
    inventoryMovement: { create: async ({ data }) => movements.push(data) },
  }) };
  return { db, movements, updates };
}
const input = { mode: "set", productId: "p1", warehouseId: "w1", expectedQuantity: 10, quantity: 100, notes: "Physical count" };
test("quantity corrections record only the difference and permit zero", async () => {
  for (const quantity of [100, 5, 0]) {
    const f = fixture(10);
    const result = await setStockQuantity(f.db, { ...input, quantity });
    assert.equal(result.quantity, quantity);
    assert.equal(f.movements[0].quantity, quantity - 10);
    assert.equal(f.movements[0].movementType, quantity > 10 ? "adjustment_in" : "adjustment_out");
    assert.deepEqual(f.updates[0].where, { productId: "p1", warehouseId: "w1", quantity: 10 });
  }
});
test("stale quantities and concurrent changes cannot overwrite stock", async () => {
  for (const f of [fixture(20), fixture(10, 0)]) {
    await assert.rejects(setStockQuantity(f.db, input), { status: 409 });
    assert.equal(f.movements.length, 0);
  }
});
test("unchanged quantity creates no movement and negative target is rejected", async () => {
  const f = fixture(10);
  await setStockQuantity(f.db, { ...input, quantity: 10 });
  assert.equal(f.movements.length, 0);
  assert.equal(f.updates.length, 0);
  await assert.rejects(setStockQuantity(f.db, { ...input, quantity: -1 }), { name: "ZodError" });
});
