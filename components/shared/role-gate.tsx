import type { Profile } from "@/lib/auth/session";

interface RoleGateProps {
  profile: Pick<Profile, "role">;
  allow: Array<Profile["role"]>;
  children: React.ReactNode;
}

// UI-level convenience only -- the tables and RPCs behind owner-only screens
// enforce the real boundary via RLS, so this is not a security control on
// its own.
export function RoleGate({ profile, allow, children }: RoleGateProps) {
  if (!allow.includes(profile.role)) return null;
  return <>{children}</>;
}
