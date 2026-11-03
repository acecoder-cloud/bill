import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabasePublishableKey, supabaseSecretKey, supabaseUrl } from "@/lib/env";

/** Supabase client acting as the signed-in user (from cookies). Use in server components and route handlers. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a server component: the proxy refreshes the session instead.
        }
      },
    },
  });
}

/** Full-access client using the secret key. Bypasses RLS — only use after checking the caller is an admin. */
export function createAdminClient() {
  return createPlainClient(supabaseUrl(), supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Anonymous client for sending auth emails (sign-up confirmation, password set/reset).
 * Uses the "implicit" flow so the email link works even if it opens in a different
 * browser than the one that asked for it (common on phones with in-app browsers).
 */
export function createEmailClient() {
  return createPlainClient(supabaseUrl(), supabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false, flowType: "implicit" },
  });
}
