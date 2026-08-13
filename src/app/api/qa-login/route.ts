// TEMPORARY QA-ONLY ROUTE — DELETE BEFORE COMMITTING.
// Signs the local dev browser in as the writable test account so the signup /
// onboarding flow can be walked end to end. The password is read from the
// server environment and never leaves the server. Hard-refuses in production.
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not available" }, { status: 404 });
  }
  const email = process.env.NEXT_PUBLIC_TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) {
    return NextResponse.json({ error: "test creds not configured" }, { status: 412 });
  }
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  return NextResponse.json({ ok: true, email });
}
