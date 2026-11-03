import { NextResponse } from "next/server";
import { createEmailClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site-url";

/** Sends a "set a new password" email. Always answers OK so it can't be used to discover accounts. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return NextResponse.json({ error: "Enter your email." }, { status: 400 });
  const { error } = await createEmailClient().auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl(request)}/auth/complete?next=/set-password`,
  });
  if (error && error.status === 429) {
    return NextResponse.json({ error: "Too many emails sent. Please wait a few minutes and try again." }, { status: 429 });
  }
  if (error) console.error("reset email failed", error.message);
  return NextResponse.json({ ok: true });
}
