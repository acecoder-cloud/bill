import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/** The signed-in user's profile (cached per request). Redirects to /login when signed out. */
export const requireProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, email, role, created_at")
    .eq("id", auth.user.id)
    .single();
  if (!profile) redirect("/auth/signout?reason=no-profile");
  return profile as Profile;
});

/** For API routes: returns the caller if they are an admin, otherwise null. */
export async function getAdminCaller() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: profile } = await supabase.from("profiles").select("id, role").eq("id", auth.user.id).single();
  if (!profile || profile.role !== "admin") return null;
  return { supabase, userId: auth.user.id };
}
