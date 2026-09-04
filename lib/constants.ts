// Batches expiring within this many days are flagged as "near expiry" on the
// dashboard and in the Near-Expiry report. The one place this number lives.
export const NEAR_EXPIRY_DAYS = 30;

// Pending cheques due within this many days are flagged as "due soon" on the
// dashboard. Already-overdue pending cheques are always included regardless
// of this window.
export const CHEQUE_DUE_DAYS = 1;

export const BUSINESS_TIMEZONE = "Asia/Colombo";
