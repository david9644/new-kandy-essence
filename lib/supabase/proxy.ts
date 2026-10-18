import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/types/database.types";

const OWNER_ONLY_PREFIXES = [
  "/payments",
  "/cheques",
  "/users",
  "/stock/opening",
  "/stock/adjustments",
];

const PUBLIC_PREFIXES = ["/login", "/api/auth"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  const ownerOnly = OWNER_ONLY_PREFIXES.some((p) => pathname.startsWith(p));

  // The session is verified with Supabase Auth on every request (no local-only
  // JWT trust). For owner-only pages the caller's own profile is fetched at the
  // SAME time instead of after it (one round trip fewer): get_own_profile
  // resolves via auth.uid() from the JWT, and the result only counts if it is
  // the same user getUser() just verified, exactly as lib/auth/session.ts does.
  const [
    {
      data: { user },
    },
    ownProfile,
  ] = await Promise.all([
    supabase.auth.getUser(),
    ownerOnly && !isPublic
      ? supabase.rpc("get_own_profile").maybeSingle()
      : Promise.resolve(null),
  ]);

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (user && ownerOnly) {
    const profile = ownProfile?.data;
    if (!profile || profile.id !== user.id || profile.role !== "owner") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
