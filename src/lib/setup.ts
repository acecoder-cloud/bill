import "server-only";

/**
 * Names of required settings that are missing on the server.
 * NEXT_PUBLIC_ values are fixed when the app is built, so after adding them in Vercel you must redeploy.
 */
export function missingSettings(): string[] {
  const missing: string[] = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }
  if (!process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SECRET_KEY");
  if (!process.env.ANTHROPIC_API_KEY) missing.push("ANTHROPIC_API_KEY");
  return missing;
}
