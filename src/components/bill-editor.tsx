"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { emptyRow, formatMoney, parseNum, rowHasMismatch, sumTotals, validateRows, round2 } from "@/lib/bill";
import type { ItemRow } from "@/lib/types";
import { Button, ErrorBox, InfoBox, friendlyError } from "./ui";
import { PhotoViewer, useBillPhotoUrl } from "./photo-viewer";

interface Props {
  billId?: string;
  initialDate: string;
  initialRows: ItemRow[];
  imagePath?: string | null;
  localImageUrl?: string | null;
  canEdit: boolean;
  notice?: { tone: "info" | "warn" | "success"; text: string } | null;
  submitLabel?: string;
  onSaved: (billId: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

const FIELDS = [
  { key: "qty", label: "Qty.", mode: "decimal" },
  { key: "rate", label: "Rate", mode: "decimal" },
  { key: "total_amount", label: "Tot. Amt.", mode: "decimal" },
] as const;

export function BillEditor({
  billId,
  initialDate,
  initialRows,
  imagePath,
  localImageUrl,
  canEdit,
  notice,
  submitLabel = "Submit",
  onSaved,
  onDirtyChange,
}: Props) {
  const [date, setDate] = useState(initialDate);
  const [rows, setRows] = useState<ItemRow[]>(initialRows.length ? initialRows : [emptyRow(1)]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [problemKeys, setProblemKeys] = useState<Set<string>>(new Set());
  const [problems, setProblems] = useState<string[]>([]);
  const [showPhoto, setShowPhoto] = useState(false);
  const [dirty, setDirty] = useState(false);
  const photo = useBillPhotoUrl(imagePath, localImageUrl);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  // Warn before closing the tab with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const total = useMemo(() => sumTotals(rows.map((r) => parseNum(r.total_amount))), [rows]);
  const mismatchCount = useMemo(() => rows.filter(rowHasMismatch).length, [rows]);

  function update(key: string, field: keyof ItemRow, value: string) {
    setDirty(true);
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setDirty(true);
    setRows((rs) => {
      const maxSerial = rs.reduce((m, r) => Math.max(m, parseNum(r.serial_no) ?? 0), 0);
      return [...rs, emptyRow(maxSerial + 1)];
    });
    // focus the new row's name field after render
    setTimeout(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>("[data-item-name]");
      const visible = [...inputs].filter((i) => i.offsetParent !== null);
      visible[visible.length - 1]?.focus();
    }, 50);
  }

  function deleteRow(key: string) {
    const row = rows.find((r) => r.key === key);
    const hasData = row && (row.item_name || row.qty || row.rate || row.total_amount);
    if (hasData && !window.confirm(`Delete "${row.item_name || "this row"}"?`)) return;
    setDirty(true);
    setRows((rs) => (rs.length === 1 ? [emptyRow(1)] : rs.filter((r) => r.key !== key)));
  }

  function fillTotal(key: string) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const q = parseNum(r.qty);
        const rate = parseNum(r.rate);
        return q !== null && rate !== null ? { ...r, total_amount: String(round2(q * rate)) } : r;
      }),
    );
    setDirty(true);
  }

  async function submit() {
    setError("");
    if (!date) {
      setError("Enter the bill date.");
      return;
    }
    const { items, problems } = validateRows(rows);
    setProblems(problems.map((p) => p.message));
    setProblemKeys(new Set(problems.map((p) => p.key).filter(Boolean)));
    if (problems.length) return;
    if (mismatchCount > 0 && !window.confirm(`${mismatchCount} row(s) have Qty × Rate different from Tot. Amt. Save anyway?`)) return;

    setSaving(true);
    try {
      const { data, error } = await createClient().rpc("save_bill", {
        p_bill_id: billId ?? null,
        p_bill_date: date,
        p_image_url: imagePath ?? null,
        p_items: items,
      });
      if (error) throw error;
      setDirty(false);
      onSaved(data as string);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  const inputCls = (bad: boolean, width = "w-full") =>
    `min-h-11 ${width} rounded-lg border px-2 tabular outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-200 disabled:bg-slate-50 disabled:text-slate-700 ${bad ? "border-red-400 bg-red-50" : "border-slate-300 bg-white"}`;

  return (
    <div className="space-y-4">
      {/* Date + photo */}
      <div className="flex items-end gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <label className="flex-1">
          <span className="mb-1 block text-sm font-medium text-slate-700">Bill date</span>
          <input
            type="date"
            value={date}
            disabled={!canEdit}
            onChange={(e) => {
              setDate(e.target.value);
              setDirty(true);
            }}
            className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-lg font-semibold disabled:bg-slate-50"
          />
        </label>
        {(imagePath || localImageUrl) && (
          <button
            type="button"
            onClick={() => photo.url && setShowPhoto(true)}
            disabled={!photo.url}
            className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-300"
            aria-label="View bill photo"
          >
            {photo.url ? (
              <img src={photo.url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs text-slate-500">{photo.error || "Photo…"}</span>
            )}
          </button>
        )}
      </div>

      {notice && <InfoBox tone={notice.tone}>{notice.text}</InfoBox>}
      {mismatchCount > 0 && (
        <InfoBox tone="warn">
          <b>{mismatchCount}</b> row{mismatchCount > 1 ? "s" : ""} highlighted: Qty × Rate doesn&apos;t match Tot. Amt. Please check.
        </InfoBox>
      )}

      {/* Phones: one card per row */}
      <ol className="space-y-3 sm:hidden">
        {rows.map((row, i) => {
          const mismatch = rowHasMismatch(row);
          const q = parseNum(row.qty);
          const rate = parseNum(row.rate);
          return (
            <li
              key={row.key}
              className={`rounded-2xl bg-white p-3 shadow-sm ring-1 ${mismatch ? "ring-2 ring-amber-400 bg-amber-50/40" : problemKeys.has(row.key) ? "ring-2 ring-red-400" : "ring-slate-200"}`}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="whitespace-nowrap text-sm font-semibold text-slate-500">Row {i + 1}</span>
                <label className="ml-auto flex items-center gap-1 text-sm text-slate-600">
                  S.No.
                  <input
                    inputMode="numeric"
                    value={row.serial_no}
                    disabled={!canEdit}
                    onChange={(e) => update(row.key, "serial_no", e.target.value)}
                    className={`${inputCls(false, "w-16")} text-center`}
                    aria-label={`Serial number, row ${i + 1}`}
                  />
                </label>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => deleteRow(row.key)}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-red-600 active:bg-red-50"
                    aria-label={`Delete row ${i + 1}`}
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
              <input
                data-item-name
                value={row.item_name}
                disabled={!canEdit}
                placeholder="Item name"
                onChange={(e) => update(row.key, "item_name", e.target.value)}
                className={`${inputCls(problemKeys.has(row.key) && !row.item_name.trim())} mb-2 font-medium`}
                aria-label={`Item name, row ${i + 1}`}
              />
              <div className="grid grid-cols-3 gap-2">
                {FIELDS.map((f) => (
                  <label key={f.key} className="block">
                    <span className="mb-0.5 block text-xs font-medium text-slate-500">{f.label}</span>
                    <input
                      inputMode={f.mode}
                      value={row[f.key]}
                      disabled={!canEdit}
                      onChange={(e) => update(row.key, f.key, e.target.value)}
                      className={`${inputCls(f.key === "total_amount" && mismatch)} text-right`}
                    />
                  </label>
                ))}
              </div>
              {mismatch && q !== null && rate !== null && (
                <div className="mt-2 flex items-center justify-between gap-2 text-sm text-amber-800">
                  <span>
                    Qty × Rate = <b className="tabular">{formatMoney(q * rate)}</b>
                  </span>
                  {canEdit && (
                    <button type="button" onClick={() => fillTotal(row.key)} className="min-h-10 rounded-lg px-2 font-semibold text-brand-700 underline">
                      Use this
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {/* Tablets / desktop: table */}
      <div className="hidden overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 sm:block">
        <table className="w-full min-w-[640px] text-left">
          <thead className="bg-slate-50 text-sm text-slate-600">
            <tr>
              <th className="w-20 px-2 py-2">Serial no.</th>
              <th className="px-2 py-2">Item name</th>
              <th className="w-24 px-2 py-2 text-right">Qty.</th>
              <th className="w-28 px-2 py-2 text-right">Rate</th>
              <th className="w-32 px-2 py-2 text-right">Tot. Amt.</th>
              {canEdit && <th className="w-12" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const mismatch = rowHasMismatch(row);
              const q = parseNum(row.qty);
              const rate = parseNum(row.rate);
              return (
                <tr key={row.key} className={`border-t border-slate-100 ${mismatch ? "bg-amber-50" : problemKeys.has(row.key) ? "bg-red-50" : ""}`}>
                  <td className="px-2 py-1.5">
                    <input inputMode="numeric" value={row.serial_no} disabled={!canEdit} onChange={(e) => update(row.key, "serial_no", e.target.value)} className={`${inputCls(false)} text-center`} aria-label={`Serial number, row ${i + 1}`} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input data-item-name value={row.item_name} disabled={!canEdit} placeholder="Item name" onChange={(e) => update(row.key, "item_name", e.target.value)} className={inputCls(problemKeys.has(row.key) && !row.item_name.trim())} aria-label={`Item name, row ${i + 1}`} />
                  </td>
                  {FIELDS.map((f) => (
                    <td key={f.key} className="px-2 py-1.5">
                      <input
                        inputMode={f.mode}
                        value={row[f.key]}
                        disabled={!canEdit}
                        onChange={(e) => update(row.key, f.key, e.target.value)}
                        className={`${inputCls(f.key === "total_amount" && mismatch)} text-right`}
                        title={mismatch && f.key === "total_amount" && q !== null && rate !== null ? `Qty × Rate = ${formatMoney(q * rate)}` : undefined}
                        aria-label={`${f.label}, row ${i + 1}`}
                      />
                    </td>
                  ))}
                  {canEdit && (
                    <td className="px-1">
                      <button type="button" onClick={() => deleteRow(row.key)} className="flex h-11 w-11 items-center justify-center rounded-lg text-red-600 hover:bg-red-50" aria-label={`Delete row ${i + 1}`}>
                        <TrashIcon />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <Button variant="secondary" onClick={addRow} className="w-full border-dashed">
          + Add row
        </Button>
      )}

      {problems.length > 0 && (
        <ErrorBox>
          <span className="block font-semibold">Please fix:</span>
          {problems.map((p) => (
            <span key={p} className="block">
              {p}
            </span>
          ))}
        </ErrorBox>
      )}
      <ErrorBox onRetry={error ? submit : undefined}>{error}</ErrorBox>

      {/* Sticky total + submit, sits above the bottom navigation */}
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:shadow">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-xs text-slate-500">
              {rows.filter((r) => r.item_name.trim()).length} items · Total
            </div>
            <div className="tabular text-xl font-bold">₹ {formatMoney(total)}</div>
          </div>
          {canEdit && (
            <Button onClick={submit} loading={saving} className="min-w-36 text-lg">
              {saving ? "Saving…" : submitLabel}
            </Button>
          )}
        </div>
      </div>

      {showPhoto && photo.url && <PhotoViewer url={photo.url} onClose={() => setShowPhoto(false)} />}
    </div>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
    </svg>
  );
}
