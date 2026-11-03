import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site-url";

async function signOut(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const url = new URL("/login", siteUrl(request));
  const reason = new URL(request.url).searchParams.get("reason");
  if (reason) url.searchParams.set("reason", reason);
  return NextResponse.redirect(url, { status: 303 });
}

export const POST = signOut;
export const GET = signOut;
