import test from "node:test";
import assert from "node:assert/strict";
import { invoiceSchema } from "../src/modules/accounting/billing/billing.schema.js";
import { cashFlowSchema } from "../src/modules/finance/cash-flow/cash-flow.schema.js";
import { defaults, schemas } from "../src/modules/settings/settings.schema.js";
import { summarizeCashFlows } from "../src/modules/finance/cash-flow/cash-flow.report.js";

test("new invoices and cash flows accept only USD and default to USD", () => {
  for (const schema of [invoiceSchema, cashFlowSchema]) {
    assert.equal(schema.shape.currency.parse(undefined), "USD");
    assert.equal(schema.shape.currency.parse("USD"), "USD");
    for (const currency of ["IQD", "EUR", ""]) {
      assert.equal(schema.shape.currency.safeParse(currency).success, false);
    }
  }
  assert.equal(defaults.finance.currency, "USD");
  assert.equal(schemas.finance.shape.currency.safeParse("IQD").success, false);
});

test("historical currency amounts never become USD report totals", () => {
  const report = summarizeCashFlows([
    { departmentId: null, category: "test", currency: "IQD", flowType: "inflow", _sum: { amount: 1500 } },
    { departmentId: null, category: "test", currency: "USD", flowType: "inflow", _sum: { amount: 2 } },
  ]);
  assert.equal(report.totals.find(row => row.currency === "USD").income, "2.00");
  assert.equal(report.totals.find(row => row.currency === "IQD").income, "1500.00");
  assert.deepEqual(summarizeCashFlows([]).totals.map(row => row.currency), ["USD"]);
});
