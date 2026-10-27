import { Suspense } from "react";
import { requireProfile } from "@/lib/auth/session";

// Print routes live outside the (app) group on purpose: no header, nav,
// footer or page padding -- nothing but the toolbar (hidden when printing)
// and the sheet itself.
//
// The signed-in check runs NEXT TO the page, not before it: awaiting it here made the page
// wait a whole database round trip before it could even start reading the bill. (The proxy
// has already refused a request without a valid session, and the bill's own reads are
// protected by the database's row rules, so the page never shows anything to anyone else.)
async function ProfileGuard() {
  await requireProfile();
  return null;
}

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <ProfileGuard />
      </Suspense>
    </>
  );
}
