"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/queries";
import { formatMoney, formatQty, hasMismatch, sumTotals } from "@/lib/bill";
import { formatDate, formatDateTime } from "@/lib/format";
import type { Entry } from "@/lib/types";
import { DateRange } from "@/components/date-range";
import { PageHeader } from "@/components/nav";
import { EmptyState, ErrorBox, LoadingBlock, friendlyError } from "@/components/ui";

type SortKey = keyof Pick<Entry, "bill_date" | "serial_no" | "item_name" | "qty" | "rate" | "total_amount" | "logged_at" | "logged_by_name">;

const COLS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "bill_date", label: "Bill date" },
  { key: "serial_no", label: "S.No.", numeric: true },
  { key: "item_name", label: "Item name" },
  { key: "qty", label: "Qty.", numeric: true },
  { key: "rate", label: "Rate", numeric: true },
  { key: "total_amount", label: "Tot. Amt.", numeric: true },
  { key: "logged_at", label: "Logged at" },
  { key: "logged_by_name", label: "Logged by" },
];

export default function SummaryPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "bill_date", dir: -1 });

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setRows(null);
    setError("");
    try {
      const supabase = createClient();
      const data = await fetchAll<Entry>((a, b) => {
        let q = supabase.from("entries").select("*").order("bill_date", { ascending: false }).order("item_id").range(a, b);
        if (from) q = q.gte("bill_date", from);
        if (to) q = q.lte("bill_date", to);
        if (debounced) q = q.ilike("item_name", `%${debounced.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
        return q;
      });
      setRows(data);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [from, to, debounced]);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(() => {
    if (!rows) return null;
    const { key, dir } = sort;
    return [...rows].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "en", { numeric: true, sensitivity: "base" });
      return cmp * dir || a.logged_at.localeCompare(b.logged_at);
    });
  }, [rows, sort]);

  const total = useMemo(() => sumTotals((rows ?? []).map((r) => r.total_amount)), [rows]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "item_name" || key === "logged_by_name" ? 1 : -1 }));
  }

  return (
    <>
      <PageHeader title="Summary" />
      <div className="mb-4 space-y-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Search item name</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. Dolo"
            className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3"
          />
        </label>
        <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      </div>

      <div className="mb-3 flex items-center justify-between rounded-2xl bg-brand-700 px-4 py-3 text-white">
        <span className="font-medium">Grand total {rows ? `(${rows.length} items)` : ""}</span>
        <span className="tabular text-xl font-bold">₹ {formatMoney(total)}</span>
      </div>

      {error && <ErrorBox onRetry={load}>{error}</ErrorBox>}
      {!error && sorted === null && <LoadingBlock />}
      {sorted && sorted.length === 0 && <EmptyState title="No items match">Try clearing the search or dates.</EmptyState>}
      {sorted && sorted.length > 0 && (
        <>
          <p className="mb-1 text-xs text-slate-500 sm:hidden">← Swipe the table sideways to see all columns →</p>
          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-slate-600">
                <tr>
                  {COLS.map((c) => (
                    <th key={c.key} className={`px-3 py-1 ${c.numeric ? "text-right" : ""}`} aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                      <button onClick={() => toggleSort(c.key)} className={`inline-flex min-h-11 items-center gap-1 font-semibold ${sort.key === c.key ? "text-brand-800" : ""}`}>
                        {c.label}
                        <span aria-hidden="true" className="text-xs">{sort.key === c.key ? (sort.dir === 1 ? "▲" : "▼") : "↕"}</span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="tabular">
                {sorted.map((r) => {
                  const bad = hasMismatch(r.qty, r.rate, r.total_amount);
                  return (
                    <tr key={r.item_id} className={`border-t border-slate-100 ${bad ? "bg-amber-50" : ""}`}>
                      <td className="whitespace-nowrap px-3 py-2">
                        <Link href={`/bills/${r.bill_id}`} className="font-medium text-brand-700 underline-offset-2 hover:underline">
                          {formatDate(r.bill_date)}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right">{r.serial_no ?? ""}</td>
                      <td className="min-w-48 px-3 py-2">{r.item_name}</td>
                      <td className="px-3 py-2 text-right">{formatQty(r.qty)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(r.rate)}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${bad ? "text-amber-800" : ""}`} title={bad ? "Qty × Rate doesn't match" : undefined}>
                        {formatMoney(r.total_amount)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatDateTime(r.logged_at)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.logged_by_name ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                <tr>
                  <td className="px-3 py-3" colSpan={5}>Grand total</td>
                  <td className="tabular px-3 py-3 text-right">{formatMoney(total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </>
  );
}
