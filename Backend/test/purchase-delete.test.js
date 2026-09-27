import assert from "node:assert/strict";
import { test } from "node:test";
import { reversePurchase } from "../src/modules/inventory/purchases/purchases.service.js";

function fixture(quantity, status = "completed", overrides = {}) {
  const purchase = { id: "p1", status, attachmentUrl: "/public/product-images/invoice.png", paidAmount: 0,
    invoiceNumber: "INV-1", items: [{ productId: "product", warehouseId: "warehouse", productName: "Bandages", warehouseName: "Main", quantity: 100 }] };
  Object.assign(purchase, overrides);
  const movements = [];
  const tx = {
    $queryRaw: async () => [],
    inventoryPurchase: { findUnique: async () => purchase, updateMany: async () => ({ count: 1 }) },
    inventoryStock: { updateMany: async () => ({ count: quantity >= 100 ? 1 : 0 }), findUnique: async () => ({ quantity }) },
    inventoryMovement: { create: async ({ data }) => { movements.push(data); } },
  };
  return { db: { $transaction: (run) => run(tx) }, movements };
}

test("delete reverses available stock once", async () => {
  const f = fixture(100);
  assert.equal((await reversePurchase(f.db, "p1", "deleted")).status, "deleted");
  assert.equal(f.movements.length, 1);
  assert.equal(f.movements[0].quantity, -100);
});

test("delete with insufficient stock identifies the item and required quantity", async () => {
  const f = fixture(0);
  await assert.rejects(reversePurchase(f.db, "p1", "deleted"), (error) =>
    error.status === 409 && error.code === "PURCHASE_INSUFFICIENT_STOCK" && error.details.product === "Bandages" && error.details.warehouse === "Main" && error.details.required === 100 && error.details.available === 0 && /Bandages in Main requires reversing 100 units, but only 0/.test(error.message));
  assert.equal(f.movements.length, 0);
});

test("deleting returned or already deleted purchases does not reverse stock again", async () => {
  for (const status of ["returned", "deleted"]) {
    const f = fixture(0, status);
    assert.equal((await reversePurchase(f.db, "p1", "deleted")).status, "deleted");
    assert.equal(f.movements.length, 0);
  }
});

test("delete permits purchases explicitly marked no invoice", async () => {
  const f = fixture(100, "completed", { hasInvoice: false, attachmentUrl: null });
  assert.equal((await reversePurchase(f.db, "p1", "deleted")).status, "deleted");
  assert.equal(f.movements.length, 1);
});

test("no-invoice deletion still enforces stock and payment checks", async () => {
  for (const [stock, paidAmount] of [[0, 0], [100, 10]]) {
    const f = fixture(stock, "completed", { hasInvoice: false, attachmentUrl: null, paidAmount });
    await assert.rejects(reversePurchase(f.db, "p1", "deleted"), { status: 409 });
    assert.equal(f.movements.length, 0);
  }
});
