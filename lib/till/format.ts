// "Rs 1,250.50" -- the till screen's money format (the rest of the app shows LKR).
export function formatRs(amount: number): string {
  return (
    "Rs " +
    amount.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}
