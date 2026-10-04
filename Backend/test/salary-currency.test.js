import { test } from "node:test";
import assert from "node:assert/strict";
import { salarySchema } from "../src/modules/hr/salaries/salaries.schema.js";

const salary = { employeeId: "employee", baseSalary: 750000, payType: "monthly" };

test("salaries default to IQD without changing the entered amount", () => {
  const result = salarySchema.parse(salary);
  assert.equal(result.currencyId, "IQD");
  assert.equal(result.baseSalary, 750000);
  assert.equal(salarySchema.parse({ ...salary, currencyId: "IQD" }).currencyId, "IQD");
});

test("existing USD salaries remain supported and unsupported currencies are rejected", () => {
  assert.equal(salarySchema.parse({ ...salary, currencyId: "USD" }).currencyId, "USD");
  assert.equal(salarySchema.safeParse({ ...salary, currencyId: "EUR" }).success, false);
});
