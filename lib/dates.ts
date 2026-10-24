// Calendar-date helpers on plain "YYYY-MM-DD" strings. Everything is built in UTC
// so the server's or the browser's own timezone can never shift a date; the
// caller supplies "today" (Asia/Colombo) as the starting point.

/** Same day one month earlier. A day the earlier month does not have clamps to
 * that month's last day (31 Mar -> 28/29 Feb, 31 May -> 30 Apr). January goes
 * back to December of the previous year. */
export function oneMonthBefore(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  // Date.UTC(y, m, 0) is the last day of the month BEFORE month index m, i.e.
  // of 1-based month (month - 1), which is exactly the month we land in.
  const lastDayOfTarget = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 2, Math.min(day, lastDayOfTarget))).toLocaleDateString(
    "en-CA",
    { timeZone: "UTC" }
  );
}
