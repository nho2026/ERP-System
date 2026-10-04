import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// Run in separate processes so the host timezone cannot hide the regression.
for (const timezone of ["UTC", "Asia/Baghdad", "America/New_York"]) {
  test(`HR attendance uses Baghdad dates and schedules on a ${timezone} server`, () => {
    const moduleUrl = new URL("../src/modules/hr/reports/monthly-calculations.js", import.meta.url).href;
    const output = execFileSync(process.execPath, ["--input-type=module", "-e", `
      import { monthlyCalculations } from ${JSON.stringify(moduleUrl)};
      const calc = monthlyCalculations({ hr: { weekends: [], graceMinutes: 0 } });
      const employee = { id: "employee", checkInTime: "09:00", checkOutTime: "17:00" };
      const event = (eventType, occurredAt) => ({ eventType, occurredAt, person: { employeeId: employee.id } });
      const records = calc.deviceAttendanceRecords([
        event("check_in", "2026-09-15T06:00:00Z"),
        event("check_out", "2026-09-15T14:00:00Z"),
      ], [], [employee], "2026-09");
      const boundary = calc.deviceAttendanceRecords([
        event("check_in", "2026-08-31T21:30:00Z"),
        event("check_out", "2026-09-01T05:30:00Z"),
      ], [], [{ ...employee, checkInTime: "00:30", checkOutTime: "08:30" }], "2026-09");
      const late = calc.deviceAttendanceRecords([
        event("check_in", "2026-09-15T06:15:00Z"),
        event("check_out", "2026-09-15T13:30:00Z"),
      ], [], [employee], "2026-09");
      console.log(JSON.stringify({ records, boundary, lost: calc.lostMinutes(records[0]), lateLost: calc.lostMinutes(late[0]) }));
    `], { env: { ...process.env, TZ: timezone }, encoding: "utf8" });
    const result = JSON.parse(output);
    assert.equal(result.records[0].attendanceDate, "2026-09-15");
    assert.equal(result.records[0].workedMinutes, 480);
    assert.equal(result.lost, 0);
    assert.equal(result.lateLost, 45);
    assert.equal(result.boundary.length, 1);
    assert.equal(result.boundary[0].attendanceDate, "2026-09-01");
    assert.equal(result.boundary[0].workedMinutes, 480);
    assert.equal(result.boundary[0].lateMinutes, 0);
    assert.equal(result.boundary[0].earlyLeaveMinutes, 0);
  });
}
