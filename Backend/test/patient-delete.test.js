import assert from "node:assert/strict";
import { test } from "node:test";
import { deletePatient } from "../src/modules/crm/patient/delete-patient.js";
const counts = { laboratoryOrders: 0, prescriptions: 0, icuCases: 0, surgeryAppointments: 0, payments: 0 };
test("each restricted patient relation blocks deletion with a helpful conflict", async () => {
  for (const key of Object.keys(counts)) {
    const db = { patient: {
      findUnique: async () => ({ _count: { ...counts, [key]: 2 } }),
      delete: () => assert.fail("Must preserve linked patient records"),
    } };
    await assert.rejects(deletePatient(db, "patient-1"), error => error.status === 409 && /2 /.test(error.message) && /inactive/.test(error.message));
  }
});
test("unlinked patients can be deleted", async () => {
  const db = { patient: { findUnique: async () => ({ _count: counts }), delete: async ({ where }) => where } };
  assert.deepEqual(await deletePatient(db, "patient-1"), { id: "patient-1" });
});
test("concurrent linked records receive a conflict and missing patients receive 404", async () => {
  const db = { patient: { findUnique: async () => ({ _count: counts }), delete: async () => { throw { code: "P2003" }; } } };
  await assert.rejects(deletePatient(db, "patient-1"), { status: 409 });
  db.patient.findUnique = async () => null;
  await assert.rejects(deletePatient(db, "missing"), { status: 404 });
});
