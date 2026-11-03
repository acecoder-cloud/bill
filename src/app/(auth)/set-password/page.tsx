"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, ErrorBox, Field, InfoBox, LoadingBlock, friendlyError } from "@/components/ui";

export default function SetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setReady(!!data.user));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError("The two passwords don't match.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    setLoading(true);
    setError("");
    const { error } = await createClient().auth.updateUser({ password });
    setLoading(false);
    if (error) return setError(/different from the old/i.test(error.message) ? "Choose a password you haven't used before." : friendlyError(error));
    router.replace("/");
    router.refresh();
  }

  if (ready === null) return <LoadingBlock />;
  if (!ready)
    return (
      <Card className="space-y-4">
        <InfoBox tone="warn">This link has expired or was already used. Ask for a new one.</InfoBox>
        <Link href="/forgot-password" className="block text-center font-semibold text-brand-700">
          Send a new link
        </Link>
      </Card>
    );

  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-4">
        <h2 className="text-lg font-semibold">Set your password</h2>
        <Field label="New password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
        <Field label="Repeat password" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <ErrorBox>{error}</ErrorBox>
        <Button type="submit" loading={loading} className="w-full">
          Save password
        </Button>
      </form>
    </Card>
  );
}
