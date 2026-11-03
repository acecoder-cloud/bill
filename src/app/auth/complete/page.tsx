"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { LoadingBlock } from "@/components/ui";

/**
 * Landing page for links in emails (confirm sign-up, set/reset password, invites).
 * Supports all three link styles Supabase can send: #access_token=… (default),
 * ?token_hash=…&type=… (custom email templates) and ?code=… (PKCE).
 */
export default function AuthCompletePage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
      { isSingleton: false, auth: { detectSessionInUrl: false } },
    );
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const nextParam = query.get("next");
    const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

    (async () => {
      const linkError = hash.get("error_description") || query.get("error_description");
      if (linkError) throw new Error(linkError);

      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const tokenHash = query.get("token_hash");
      const code = query.get("code");
      const type = (hash.get("type") || query.get("type")) as EmailOtpType | null;

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (error) throw error;
      } else if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (error) throw error;
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
      } else {
        throw new Error("This link is incomplete.");
      }
      // Password reset and invite links should go to "set password"
      const dest = type === "recovery" || type === "invite" ? "/set-password" : next;
      window.history.replaceState(null, "", "/auth/complete");
      router.replace(dest);
      router.refresh();
    })().catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      setError(/expired|invalid/i.test(msg) ? "This link has expired or was already used." : msg);
    });
  }, [router]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5">
      {error ? (
        <div className="space-y-4 rounded-2xl bg-white p-5 text-center shadow-sm ring-1 ring-slate-200">
          <p className="font-semibold text-red-700">{error}</p>
          <Link href="/forgot-password" className="block font-semibold text-brand-700">
            Get a new link
          </Link>
          <Link href="/login" className="block text-sm text-slate-600">
            Back to sign in
          </Link>
        </div>
      ) : (
        <LoadingBlock label="Signing you in…" />
      )}
    </main>
  );
}
