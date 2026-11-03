"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, ErrorBox, Field, InfoBox, LoadingBlock, friendlyError } from "@/components/ui";

export default function SignupPage() {
  const router = useRouter();
  const [open, setOpen] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    createClient()
      .rpc("signup_open")
      .then(({ data, error }) => setOpen(error ? true : data === true));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Sign-up failed.");
      if (body.session) {
        await createClient().auth.setSession(body.session);
        router.replace("/");
        router.refresh();
        return;
      }
      setSent(true);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  if (open === null) return <LoadingBlock />;
  if (!open)
    return (
      <Card className="space-y-4">
        <InfoBox tone="warn">
          New accounts are added by the admin. Ask your admin to add you, or to turn on <b>Anyone can create an account</b> in Admin settings.
        </InfoBox>
        <Link href="/login" className="block text-center font-semibold text-brand-700">
          Back to sign in
        </Link>
      </Card>
    );
  if (sent)
    return (
      <Card className="space-y-4">
        <InfoBox tone="success">
          Check <b>{email}</b> for a confirmation link. Open it on this phone to finish signing up.
        </InfoBox>
        <Link href="/login" className="block text-center font-semibold text-brand-700">
          Back to sign in
        </Link>
      </Card>
    );

  return (
    <Card className="space-y-4">
      <InfoBox>If this is the first account, it becomes the <b>admin</b>. Otherwise you&apos;ll join as a regular user.</InfoBox>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Your name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Password" type="password" autoComplete="new-password" minLength={8} hint="At least 8 characters" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <ErrorBox>{error}</ErrorBox>
        <Button type="submit" loading={loading} className="w-full">
          Create account
        </Button>
      </form>
      <Link href="/login" className="block text-center text-sm font-medium text-brand-700">
        Already have an account? Sign in
      </Link>
    </Card>
  );
}
