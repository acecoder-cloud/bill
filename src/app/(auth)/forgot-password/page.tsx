"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button, Card, ErrorBox, Field, InfoBox, friendlyError } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setSent(true);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="space-y-4">
      {sent ? (
        <InfoBox tone="success">If an account exists for <b>{email}</b>, we sent a link to set a new password.</InfoBox>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-slate-600">Enter your email and we&apos;ll send you a link to set a new password.</p>
          <Field label="Email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <ErrorBox>{error}</ErrorBox>
          <Button type="submit" loading={loading} className="w-full">
            Send link
          </Button>
        </form>
      )}
      <Link href="/login" className="block text-center text-sm font-medium text-brand-700">
        Back to sign in
      </Link>
    </Card>
  );
}
