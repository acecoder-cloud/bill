import { NextResponse } from "next/server";
import { createEmailClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site-url";

/** Self sign-up. Only works for the very first account (the admin) unless an admin opens public sign-up. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 100) : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });

  const supabase = createEmailClient();
  const { data: open } = await supabase.rpc("signup_open");
  if (open === false) {
    return NextResponse.json({ error: "Sign-up is closed. Ask your admin to add your account." }, { status: 403 });
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name }, emailRedirectTo: `${siteUrl(request)}/auth/complete` },
  });
  if (error) {
    const closed = /database error/i.test(error.message);
    return NextResponse.json(
      { error: closed ? "Sign-up is closed. Ask your admin to add your account." : error.message },
      { status: closed ? 403 : error.status ?? 400 },
    );
  }
  // When "Confirm email" is turned off in Supabase, we get a session right away.
  if (data.session) {
    return NextResponse.json({
      session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token },
    });
  }
  return NextResponse.json({ confirmEmail: true });
}
