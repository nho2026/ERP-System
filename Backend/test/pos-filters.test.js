import assert from "node:assert/strict";
import { test } from "node:test";
import { posSalesQuerySchema } from "../src/modules/pos/pos.schema.js";
import { saleFiltersWhere, saleAmountFields } from "../src/modules/pos/pos-filters.js";
import { posService } from "../src/modules/pos/pos.service.js";
import { posModel } from "../src/modules/pos/pos.model.js";

test("sale filters combine text, product, exact values, dates and zero amounts", () => {
  const where = saleFiltersWhere(posSalesQuerySchema.parse({
    saleNumber: " POS-1 ", cashierName: "Cashier", customerName: "Customer", notes: "note",
    warehouseId: "warehouse", status: "completed", paymentMethod: "card", product: "ABC",
    fromDate: "2026-09-01", toDate: "2026-09-30", min_totalAmount: "0", max_totalAmount: "25.50",
  }));
  assert.deepEqual(where, {
    saleNumber: { contains: "POS-1" }, cashierName: { contains: "Cashier" }, customerName: { contains: "Customer" }, notes: { contains: "note" },
    warehouseId: "warehouse", paymentMethod: "card", status: "completed",
    items: { some: { product: { OR: ["name", "sku", "barcode"].map((field) => ({ [field]: { contains: "ABC" } })) } } },
    soldAt: { gte: new Date("2026-09-01T00:00:00Z"), lt: new Date("2026-10-01T00:00:00Z") },
    totalAmount: { gte: 0, lte: 25.5 },
  });
  assert.deepEqual(saleFiltersWhere(posSalesQuerySchema.parse({ saleNumber: "", min_totalAmount: "", fromDate: "" })), {});
});

test("all amount ranges support bounds and reject invalid or reversed values", () => {
  for (const field of saleAmountFields) {
    assert.deepEqual(saleFiltersWhere(posSalesQuerySchema.parse({ [`min_${field}`]: "0", [`max_${field}`]: "10" })), { [field]: { gte: 0, lte: 10 } });
    for (const query of [{ [`min_${field}`]: "-1" }, { [`max_${field}`]: "Infinity" }, { [`min_${field}`]: "20", [`max_${field}`]: "10" }]) assert.throws(() => posSalesQuerySchema.parse(query));
  }
  for (const query of [{ fromDate: "2026-02-30" }, { fromDate: "2026-09-30", toDate: "2026-09-01" }, { paymentMethod: "invalid" }, { status: "deleted" }]) assert.throws(() => posSalesQuerySchema.parse(query));
});

test("sale pagination applies identical filters to rows and count", async (t) => {
  const calls = [];
  const db = {
    posSale: {
      findMany: (args) => { calls.push(args); return Promise.resolve([]); },
      count: (args) => { calls.push(args); return Promise.resolve(55); },
    },
    $transaction: (queries) => Promise.all(queries),
  };
  const originalList = posModel.list;
  t.mock.method(posModel, "list", (skip, take, where) => originalList(skip, take, where, db));
  const result = await posService.list({ page: "2", pageSize: "50", status: "cancelled", min_paidAmount: "0" });
  assert.equal(calls[0].skip, 50);
  assert.equal(calls[0].take, 50);
  assert.deepEqual(calls[0].where, { status: "cancelled", paidAmount: { gte: 0 } });
  assert.deepEqual(calls[0].where, calls[1].where);
  assert.deepEqual(result.pagination, { page: 2, pageSize: 50, total: 55, totalPages: 2 });
});

test("invalid filters fail before querying sales", async (t) => {
  const list = t.mock.method(posModel, "list", () => { throw new Error("Unexpected query"); });
  await assert.rejects(posService.list({ min_totalAmount: "20", max_totalAmount: "10" }), { name: "ZodError" });
  assert.equal(list.mock.callCount(), 0);
});
