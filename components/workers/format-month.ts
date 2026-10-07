// "2026-10-08" or "2026-10-01" -> "October 2026". Parsed as UTC and formatted
// as UTC so the label never shifts a month with the viewer's timezone.
export function formatMonth(isoDate: string): string {
  return new Date(`${isoDate.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
