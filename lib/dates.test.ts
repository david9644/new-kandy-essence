import { test } from "node:test";
import assert from "node:assert/strict";
import { oneMonthBefore } from "./dates";

test("oneMonthBefore: the same day one month earlier", () => {
  assert.equal(oneMonthBefore("2026-10-24"), "2026-09-24");
  assert.equal(oneMonthBefore("2026-07-01"), "2026-06-01");
  assert.equal(oneMonthBefore("2026-12-15"), "2026-11-15");
});

test("oneMonthBefore: a day the earlier month lacks clamps to its last day", () => {
  assert.equal(oneMonthBefore("2026-03-31"), "2026-02-28"); // 31 Mar -> 28 Feb
  assert.equal(oneMonthBefore("2026-03-30"), "2026-02-28");
  assert.equal(oneMonthBefore("2026-03-29"), "2026-02-28");
  assert.equal(oneMonthBefore("2026-03-28"), "2026-02-28");
  assert.equal(oneMonthBefore("2026-05-31"), "2026-04-30"); // 31 May -> 30 Apr
  assert.equal(oneMonthBefore("2026-10-31"), "2026-09-30");
  assert.equal(oneMonthBefore("2026-07-31"), "2026-06-30");
  assert.equal(oneMonthBefore("2026-08-31"), "2026-07-31"); // July has 31: no clamp
  assert.equal(oneMonthBefore("2026-12-31"), "2026-11-30");
});

test("oneMonthBefore: leap years", () => {
  assert.equal(oneMonthBefore("2028-03-31"), "2028-02-29"); // 2028 is a leap year
  assert.equal(oneMonthBefore("2028-03-29"), "2028-02-29");
  assert.equal(oneMonthBefore("2027-03-31"), "2027-02-28");
  assert.equal(oneMonthBefore("2100-03-31"), "2100-02-28"); // 2100 is not
  assert.equal(oneMonthBefore("2000-03-31"), "2000-02-29"); // 2000 is
});

test("oneMonthBefore: January goes back to December of the previous year", () => {
  assert.equal(oneMonthBefore("2026-01-01"), "2025-12-01");
  assert.equal(oneMonthBefore("2026-01-31"), "2025-12-31");
  assert.equal(oneMonthBefore("2026-01-15"), "2025-12-15");
});

test("oneMonthBefore: the result never depends on the machine's timezone", () => {
  const saved = process.env.TZ;
  try {
    for (const tz of ["Asia/Colombo", "UTC", "Pacific/Auckland", "America/Los_Angeles"]) {
      process.env.TZ = tz;
      assert.equal(oneMonthBefore("2026-03-31"), "2026-02-28", tz);
      assert.equal(oneMonthBefore("2026-01-01"), "2025-12-01", tz);
    }
  } finally {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  }
});
