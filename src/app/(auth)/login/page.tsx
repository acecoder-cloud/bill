"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, ErrorBox, Field, InfoBox, friendlyError } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [signupOpen, setSignupOpen] = useState(false);

  useEffect(() => {
    createClient()
      .rpc("signup_open")
      .then(({ data }) => setSignupOpen(data === true));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setLoading(false);
      setError(
        /invalid login credentials/i.test(error.message)
          ? "Wrong email or password."
          : /email not confirmed/i.test(error.message)
            ? "Please confirm your email first — check your inbox for the link."
            : /banned/i.test(error.message)
              ? "Your account has been disabled. Contact your admin."
              : friendlyError(error),
      );
      return;
    }
    const next = params.get("next");
    router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    router.refresh();
  }

  return (
    <Card className="space-y-4">
      {params.get("reason") === "no-profile" && <InfoBox tone="warn">Your account has no profile. Contact your admin.</InfoBox>}
      {signupOpen && (
        <InfoBox>
          <b>First time here?</b> No accounts exist yet.{" "}
          <Link href="/signup" className="font-semibold underline">
            Create the admin account
          </Link>
          .
        </InfoBox>
      )}
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <ErrorBox>{error}</ErrorBox>
        <Button type="submit" loading={loading} className="w-full">
          Sign in
        </Button>
      </form>
      <Link
        href="/signup"
        className="flex min-h-12 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 font-semibold text-brand-800 active:bg-slate-100"
      >
        Create an account
      </Link>
      <div className="text-center text-sm">
        <Link href="/forgot-password" className="inline-block min-h-10 py-2 font-medium text-brand-700">
          Forgot password?
        </Link>
      </div>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
