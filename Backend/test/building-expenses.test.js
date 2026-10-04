import test from "node:test";
import assert from "node:assert/strict";
import { requestSchema, expenseSchema, productSchema, validateTransition } from "../src/modules/building-expenses/building.schema.js";
import { requestPermission, missingRequestPermissions } from "../src/shared/security/access-policy.js";

test("purchase approval requires ordering before completion", () => {
  validateTransition("draft", "pending", "purchase");
  validateTransition("pending", "approved", "purchase");
  validateTransition("approved", "ordered", "purchase");
  validateTransition("ordered", "completed", "purchase");
  assert.throws(() => validateTransition("approved", "completed", "purchase"));
});
test("sales complete after approval and terminal requests cannot complete twice", () => {
  validateTransition("approved", "completed", "sale");
  assert.throws(() => validateTransition("approved", "ordered", "sale"));
  for (const status of ["completed", "cancelled", "rejected", "draft", "pending"]) assert.throws(() => validateTransition(status, "completed", "sale"));
});
test("rejection and cancellation require a reason", () => {
  assert.throws(() => validateTransition("pending", "rejected", "purchase", " "));
  validateTransition("pending", "rejected", "purchase", "Outside budget");
  assert.throws(() => validateTransition("draft", "cancelled", "sale"));
});
test("request quantities and expense values reject invalid input", () => {
  const request = { departmentId: "dept", kind: "purchase", items: [{ productId: null, name: "Chair", quantity: 2, price: 20 }] };
  assert.equal(requestSchema.parse(request).items[0].name, "Chair");
  assert.throws(() => requestSchema.parse({ ...request, items: [] }));
  assert.throws(() => requestSchema.parse({ ...request, items: [{ ...request.items[0], quantity: -1 }] }));
  assert.throws(() => expenseSchema.parse({ departmentId: "dept", category: "drinks", description: "Water", amount: -1, date: "2026-09-30", paidBy: "User" }));
  assert.equal(productSchema.parse({ name: "Chair", category: "Furniture", barcode: "", price: 20 }).barcode, null);
});
test("building access and approval are registered separately", () => {
  assert.equal(requestPermission("GET", "/api/building-expenses"), "building-expenses.view");
  assert.equal(requestPermission("PATCH", "/api/building-expenses/requests/id/status"), "building-expenses.approve");
  assert.deepEqual(missingRequestPermissions(new Set(["building-expenses.view", "building-expenses.update"]), "PATCH", "/api/building-expenses/requests/id/status"), ["building-expenses.approve"]);
});
