import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hashPinForLookup, isValidPinFormat, verifyPin } from "@/lib/auth/pin";
import { clearAttempts, isThrottled, recordFailedAttempt } from "@/lib/auth/rate-limit";

interface ProfileRow {
  id: string;
  full_name: string;
  role: "owner" | "store_keeper";
  active: boolean;
}

export async function POST(request: NextRequest) {
  let pin: unknown;
  try {
    ({ pin } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (typeof pin !== "string" || !isValidPinFormat(pin)) {
    return NextResponse.json({ error: "Enter a 4-6 digit PIN." }, { status: 400 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const admin = createAdminClient();

  if (await isThrottled(admin, ip)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 }
    );
  }

  const lookupHash = hashPinForLookup(pin);

  const { data: credential } = await admin
    .from("profile_credentials")
    .select("profile_id, pin_hash, profiles!inner(id, full_name, role, active)")
    .eq("pin_lookup_hash", lookupHash)
    .maybeSingle<{
      profile_id: string;
      pin_hash: string;
      profiles: ProfileRow;
    }>();

  const profile = credential?.profiles;
  const pinMatches = credential ? await verifyPin(pin, credential.pin_hash) : false;

  if (!credential || !profile?.active || !pinMatches) {
    await recordFailedAttempt(admin, ip);
    return NextResponse.json({ error: "Incorrect PIN." }, { status: 401 });
  }

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(profile.id);
  if (userError || !userData.user?.email) {
    return NextResponse.json({ error: "Login is not set up for this user." }, { status: 500 });
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userData.user.email,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    return NextResponse.json({ error: "Could not start a session." }, { status: 500 });
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkData.properties.hashed_token,
  });

  if (verifyError) {
    return NextResponse.json({ error: "Could not start a session." }, { status: 500 });
  }

  await clearAttempts(admin, ip);

  return NextResponse.json({
    profile: { id: profile.id, full_name: profile.full_name, role: profile.role },
  });
}
