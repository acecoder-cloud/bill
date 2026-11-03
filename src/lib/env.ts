// Central place for environment variables, with clear errors when one is missing.

export function supabaseUrl(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!v) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  return v;
}

export function supabasePublishableKey(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!v) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set");
  return v;
}

/** Server only. */
export function supabaseSecretKey(): string {
  const v = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!v) throw new Error("SUPABASE_SECRET_KEY is not set");
  return v;
}

export const BILL_BUCKET = "bill-images";
