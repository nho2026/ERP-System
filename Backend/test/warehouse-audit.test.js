import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/shared/database/client.js";
import { listReductions } from "../src/modules/inventory/stock/reductions.service.js";
import { listThresholds } from "../src/modules/inventory/stock/threshold.service.js";
import { listTopProducts } from "../src/modules/inventory/reports/top-products.service.js";
import { paginate } from "../src/modules/inventory/shared/pagination.model.js";

function replace(t, target, key, value) { const original = target[key]; target[key] = value; t.after(() => { target[key] = original; }); }

test("warehouse pagination recovers after the final page disappears", async t => {
  replace(t, prisma.inventoryProduct, "count", async () => 10);
  replace(t, prisma.inventoryProduct, "findMany", async args => {
    assert.equal(args.where.status, "active");
    assert.deepEqual(args.orderBy, [{ name: "asc" }, { id: "asc" }]);
    return args.skip === 0 ? [{ id: "remaining" }] : [];
  });
  replace(t, prisma, "$transaction", async values => Promise.all(values));
  const result = await paginate({ page: 2, pageSize: 10 }, "inventoryProduct", { where: { status: "active" }, orderBy: { name: "asc" } });
  assert.equal(result.pagination.page, 1);
  assert.equal(result.items[0].id, "remaining");
});

test("reduction rows and totals respect the assigned warehouse", async t => {
  replace(t, prisma.inventoryMovement, "findMany", async args => {
    assert.equal(args.where.warehouseId, "assigned");
    assert.equal(args.where.movementType, "item_reduction");
    return [];
  });
  replace(t, prisma.inventoryMovement, "count", async args => {
    assert.equal(args.where.warehouseId, "assigned");
    return 0;
  });
  replace(t, prisma, "$transaction", async values => Promise.all(values));
  await listReductions({ query: { warehouseId: "assigned" } });
});

test("threshold warehouse choices respect access scope without trapping ordinary filters", async t => {
  let warehouseWhere;
  replace(t, prisma, "$transaction", async run => run({
    inventoryStock: { count: async () => 0, findMany: async () => [] },
    inventoryWarehouse: { findMany: async args => { warehouseWhere = args.where; return []; } },
    productCategory: { findMany: async () => [] },
  }));
  await listThresholds({ query: { warehouseId: "assigned" }, warehouseScope: "assigned" });
  assert.deepEqual(warehouseWhere, { id: "assigned" });
  await listThresholds({ query: { warehouseId: "chosen" } });
  assert.equal(warehouseWhere, undefined);
});

test("top products excludes reversed sales, scopes storage and paginates ranked products", async () => {
  const db = {
    posSaleItem: { groupBy: async args => {
      assert.deepEqual(args.where.sale, { status: "completed", warehouseId: "assigned" });
      assert.equal(args.where.product.OR[0].name.contains, "sample");
      assert.deepEqual(args.orderBy, [{ _sum: { quantity: "desc" } }, { productId: "asc" }]);
      return [{ productId: "first", _sum: { quantity: 9 } }, { productId: "second", _sum: { quantity: 3 } }];
    } },
    inventoryProduct: { findMany: async args => {
      assert.deepEqual(args.where.id.in, ["second"]);
      return [{ id: "second", name: "Sample", sku: "S" }];
    } },
  };
  const result = await listTopProducts({ query: { warehouseId: "assigned", search: "sample", page: 2, pageSize: 1 } }, db);
  assert.equal(result.pagination.total, 2);
  assert.deepEqual(result.items, [{ id: "second", name: "Sample", sku: "S", quantity: 3 }]);
});
