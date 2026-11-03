"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BILL_LIST_SELECT, toBillSummary } from "@/lib/queries";
import { formatMoney, sumTotals } from "@/lib/bill";
import { useProfile } from "@/components/profile-context";
import { BillCard, type BillSummary } from "@/components/bill-card";
import { DateRange } from "@/components/date-range";
import { PageHeader } from "@/components/nav";
import { Button, EmptyState, ErrorBox, LoadingBlock, friendlyError } from "@/components/ui";

const PAGE = 30;

export default function EntriesPage() {
  const { profile, settings } = useProfile();
  const canSeeAll = profile.role === "admin" || settings.users_view_all;
  const [scope, setScope] = useState<"all" | "mine">(canSeeAll ? "all" : "mine");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [bills, setBills] = useState<BillSummary[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const fetchPage = useCallback(
    async (offset: number) => {
      let q = createClient()
        .from("bills")
        .select(BILL_LIST_SELECT)
        .order("bill_date", { ascending: false })
        .order("logged_at", { ascending: false })
        .range(offset, offset + PAGE - 1);
      if (scope === "mine") q = q.eq("logged_by", profile.id);
      if (from) q = q.gte("bill_date", from);
      if (to) q = q.lte("bill_date", to);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(toBillSummary as never) as BillSummary[];
    },
    [scope, from, to, profile.id],
  );

  const reload = useCallback(async () => {
    setBills(null);
    setError("");
    try {
      const page = await fetchPage(0);
      setBills(page);
      setHasMore(page.length === PAGE);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [fetchPage]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function loadMore() {
    if (!bills) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(bills.length);
      setBills([...bills, ...page]);
      setHasMore(page.length === PAGE);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <PageHeader title="Bills" />
      <div className="mb-4 space-y-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
        {canSeeAll && (
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="tablist">
            {(["all", "mine"] as const).map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={scope === s}
                onClick={() => setScope(s)}
                className={`min-h-10 rounded-lg font-semibold ${scope === s ? "bg-white text-brand-800 shadow-sm" : "text-slate-600"}`}
              >
                {s === "all" ? "All bills" : "My bills"}
              </button>
            ))}
          </div>
        )}
        <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        {(from || to) && (
          <button className="min-h-10 text-sm font-semibold text-brand-700" onClick={() => { setFrom(""); setTo(""); }}>
            Clear dates
          </button>
        )}
      </div>

      {error && <ErrorBox onRetry={reload}>{error}</ErrorBox>}
      {!error && bills === null && <LoadingBlock />}
      {bills && bills.length === 0 && <EmptyState title="No bills found">{from || to ? "Try a different date range." : "Scanned bills will appear here."}</EmptyState>}
      {bills && bills.length > 0 && (
        <>
          <p className="mb-2 text-sm text-slate-500">
            Showing {bills.length} bill{bills.length === 1 ? "" : "s"} · ₹ {formatMoney(sumTotals(bills.map((b) => b.total)))}
          </p>
          <div className="space-y-3">
            {bills.map((b) => (
              <BillCard key={b.id} bill={b} />
            ))}
          </div>
          {hasMore && (
            <Button variant="secondary" className="mt-4 w-full" loading={loadingMore} onClick={loadMore}>
              Load more
            </Button>
          )}
        </>
      )}
    </>
  );
}
