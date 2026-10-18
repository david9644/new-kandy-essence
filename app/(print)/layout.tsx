import { requireProfile } from "@/lib/auth/session";

// Print routes live outside the (app) group on purpose: no header, nav,
// footer or page padding -- nothing but the toolbar (hidden when printing)
// and the sheet itself.
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await requireProfile();
  return <>{children}</>;
}
