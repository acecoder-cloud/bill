"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { setPendingFile } from "@/lib/pending-file";
import { BILL_LIST_SELECT, toBillSummary } from "@/lib/queries";
import { ScanButtons } from "@/components/scan-buttons";
import { InstallPrompt } from "@/components/pwa";
import { BillCard, type BillSummary } from "@/components/bill-card";
import { useProfile } from "@/components/profile-context";
import { ErrorBox, Spinner, friendlyError } from "@/components/ui";

export default function HomePage() {
  const router = useRouter();
  const { profile } = useProfile();
  const [recent, setRecent] = useState<BillSummary[] | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const { data, error } = await createClient()
      .from("bills")
      .select(BILL_LIST_SELECT)
      .eq("logged_by", profile.id)
      .order("logged_at", { ascending: false })
      .limit(5);
    if (error) setError(friendlyError(error));
    else setRecent((data ?? []).map(toBillSummary as never));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-slate-500">Hello,</p>
        <h1 className="text-2xl font-bold">{profile.name || profile.email}</h1>
      </div>

      <ScanButtons
        onFile={(file) => {
          setPendingFile(file);
          router.push("/bills/new");
        }}
        manualHref="/bills/new?manual=1"
      />

      <InstallPrompt />

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your recent bills</h2>
          <Link href="/entries" className="min-h-10 py-2 text-sm font-semibold text-brand-700">
            See all
          </Link>
        </div>
        {error ? (
          <ErrorBox onRetry={load}>{error}</ErrorBox>
        ) : recent === null ? (
          <div className="flex justify-center py-8 text-brand-700">
            <Spinner />
          </div>
        ) : recent.length === 0 ? (
          <p className="rounded-2xl bg-white p-4 text-center text-slate-500 ring-1 ring-slate-200">No bills yet. Tap <b>Scan Bill</b> to log your first one.</p>
        ) : (
          <div className="space-y-3">
            {recent.map((b) => (
              <BillCard key={b.id} bill={b} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
