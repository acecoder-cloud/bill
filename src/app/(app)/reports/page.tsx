"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/queries";
import { formatMoney } from "@/lib/bill";
import { formatDate } from "@/lib/format";
import type { Entry } from "@/lib/types";
import { COLUMNS, canShareFiles, grandTotal, makeCsv, makePdf, makeXlsx, reportFileName, shareOrDownload, type ColumnKey } from "@/lib/report";
import { DateRange, nextDayISO, startOfDayISO } from "@/components/date-range";
import { PageHeader } from "@/components/nav";
import { Button, ErrorBox, InfoBox, friendlyError } from "@/components/ui";

type Format = "pdf" | "xlsx" | "csv";
const FORMATS: { key: Format; label: string }[] = [
  { key: "pdf", label: "PDF" },
  { key: "xlsx", label: "Excel" },
  { key: "csv", label: "CSV" },
];
const PREVIEW_LIMIT = 50;
const STORAGE_KEY = "pbl-report-columns";

export default function ReportsPage() {
  const [cols, setCols] = useState<Set<ColumnKey>>(new Set(COLUMNS.map((c) => c.key)));
  const [dateField, setDateField] = useState<"bill_date" | "logged_at">("bill_date");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [item, setItem] = useState("");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [format, setFormat] = useState<Format>("pdf");
  const [busy, setBusy] = useState<"share" | "download" | null>(null);
  const [result, setResult] = useState("");
  const [shareable, setShareable] = useState(false);

  useEffect(() => {
    setShareable(canShareFiles());
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (Array.isArray(saved) && saved.length) setCols(new Set(saved));
    } catch {}
  }, []);

  const columns = useMemo(() => COLUMNS.filter((c) => cols.has(c.key)), [cols]);

  function toggleCol(key: ColumnKey) {
    setCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
    setResult("");
  }

  // Changing filters invalidates the preview
  useEffect(() => {
    setEntries(null);
    setResult("");
  }, [dateField, from, to, item]);

  async function preview() {
    setLoading(true);
    setError("");
    setResult("");
    try {
      const supabase = createClient();
      const data = await fetchAll<Entry>((a, b) => {
        let q = supabase.from("entries").select("*").order(dateField, { ascending: true }).order("serial_no").order("item_id").range(a, b);
        if (dateField === "bill_date") {
          if (from) q = q.gte("bill_date", from);
          if (to) q = q.lte("bill_date", to);
        } else {
          if (from) q = q.gte("logged_at", startOfDayISO(from));
          if (to) q = q.lt("logged_at", nextDayISO(to));
        }
        const term = item.trim();
        if (term) q = q.ilike("item_name", `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
        return q;
      });
      setEntries(data);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }

  const subtitle = useMemo(() => {
    const parts = [
      `${dateField === "bill_date" ? "Bill date" : "Logged date"}: ${from ? formatDate(from) : "start"} – ${to ? formatDate(to) : "today"}`,
    ];
    if (item.trim()) parts.push(`Item contains "${item.trim()}"`);
    return parts.join(" · ");
  }, [dateField, from, to, item]);

  async function exportReport(mode: "share" | "download") {
    if (!entries) return;
    setBusy(mode);
    setResult("");
    setError("");
    try {
      const spec = { title: "Pharmacy Bill Report", subtitle, columns, entries };
      const blob = format === "pdf" ? await makePdf(spec) : format === "xlsx" ? await makeXlsx(spec) : makeCsv(spec);
      const outcome = await shareOrDownload(blob, reportFileName(format), "Pharmacy Bill Report", mode === "share");
      if (outcome === "downloaded") setResult("Report downloaded. Check your Downloads folder.");
      if (outcome === "shared") setResult("Report shared.");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title="Reports" />
      <div className="space-y-4">
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-2 font-semibold">1. Columns</h2>
          <div className="grid grid-cols-2 gap-2">
            {COLUMNS.map((c) => (
              <label key={c.key} className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 ${cols.has(c.key) ? "border-brand-500 bg-brand-50" : "border-slate-200"}`}>
                <input type="checkbox" checked={cols.has(c.key)} onChange={() => toggleCol(c.key)} className="h-5 w-5 accent-brand-700" />
                <span className="text-sm font-medium">{c.label}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h2 className="font-semibold">2. Filters</h2>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
            {(["bill_date", "logged_at"] as const).map((f) => (
              <button key={f} onClick={() => setDateField(f)} className={`min-h-10 rounded-lg text-sm font-semibold ${dateField === f ? "bg-white text-brand-800 shadow-sm" : "text-slate-600"}`}>
                {f === "bill_date" ? "By bill date" : "By logged date"}
              </button>
            ))}
          </div>
          <DateRange label={dateField === "bill_date" ? "Bill date" : "Logged date"} from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Item name contains</span>
            <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="Leave empty for all items" className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3" />
          </label>
          <Button className="w-full" onClick={preview} loading={loading} disabled={columns.length === 0}>
            {columns.length === 0 ? "Pick at least one column" : "Preview report"}
          </Button>
        </section>

        <ErrorBox>{error}</ErrorBox>

        {entries && (
          <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">3. Preview</h2>
              <span className="text-sm text-slate-500">{entries.length} rows</span>
            </div>
            <p className="text-sm text-slate-500">{subtitle}</p>
            {entries.length === 0 ? (
              <InfoBox tone="warn">No items match these filters.</InfoBox>
            ) : (
              <>
                <div className="max-h-96 overflow-auto rounded-xl ring-1 ring-slate-200">
                  <table className="w-full min-w-max text-left text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-slate-600">
                      <tr>
                        {columns.map((c) => (
                          <th key={c.key} className={`px-3 py-2 ${c.numeric ? "text-right" : ""}`}>{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="tabular">
                      {entries.slice(0, PREVIEW_LIMIT).map((e) => (
                        <tr key={e.item_id} className="border-t border-slate-100">
                          {columns.map((c) => (
                            <td key={c.key} className={`whitespace-nowrap px-3 py-2 ${c.numeric ? "text-right" : ""}`}>{c.text(e)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {entries.length > PREVIEW_LIMIT && <p className="text-xs text-slate-500">Showing first {PREVIEW_LIMIT} rows. The file will include all {entries.length}.</p>}
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                  <span className="font-medium">Grand total</span>
                  <span className="tabular font-bold">₹ {formatMoney(grandTotal(entries))}</span>
                </div>

                <h2 className="pt-2 font-semibold">4. Download or share</h2>
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
                  {FORMATS.map((f) => (
                    <button key={f.key} onClick={() => setFormat(f.key)} className={`min-h-11 rounded-lg font-semibold ${format === f.key ? "bg-white text-brand-800 shadow-sm" : "text-slate-600"}`}>
                      {f.label}
                    </button>
                  ))}
                </div>
                <div className={`grid gap-2 ${shareable ? "grid-cols-2" : "grid-cols-1"}`}>
                  {shareable && (
                    <Button onClick={() => exportReport("share")} loading={busy === "share"} disabled={busy !== null}>
                      Share (WhatsApp, email…)
                    </Button>
                  )}
                  <Button variant={shareable ? "secondary" : "primary"} onClick={() => exportReport("download")} loading={busy === "download"} disabled={busy !== null}>
                    Download
                  </Button>
                </div>
                {result && <InfoBox tone="success">{result}</InfoBox>}
              </>
            )}
          </section>
        )}
      </div>
    </>
  );
}
