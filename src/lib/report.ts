"use client";
import type { Entry } from "./types";
import { formatMoney, formatQty, sumTotals, toCsv } from "./bill";
import { formatDate, formatDateTime } from "./format";

export type ColumnKey = "bill_date" | "serial_no" | "item_name" | "qty" | "rate" | "total_amount" | "logged_at" | "logged_by_name";

export interface ColumnDef {
  key: ColumnKey;
  label: string;
  numeric?: boolean;
  /** text for PDF / screen */
  text: (e: Entry) => string;
  /** raw value for CSV / Excel */
  raw: (e: Entry) => string | number | Date | null;
  width: number; // Excel column width
}

export const COLUMNS: ColumnDef[] = [
  { key: "bill_date", label: "Bill date", text: (e) => formatDate(e.bill_date), raw: (e) => e.bill_date, width: 12 },
  { key: "serial_no", label: "Serial no.", numeric: true, text: (e) => (e.serial_no ?? "").toString(), raw: (e) => e.serial_no, width: 9 },
  { key: "item_name", label: "Item name", text: (e) => e.item_name, raw: (e) => e.item_name, width: 36 },
  { key: "qty", label: "Qty.", numeric: true, text: (e) => formatQty(e.qty), raw: (e) => e.qty, width: 8 },
  { key: "rate", label: "Rate", numeric: true, text: (e) => formatMoney(e.rate), raw: (e) => e.rate, width: 10 },
  { key: "total_amount", label: "Tot. Amt.", numeric: true, text: (e) => formatMoney(e.total_amount), raw: (e) => e.total_amount, width: 12 },
  { key: "logged_at", label: "Logged at", text: (e) => formatDateTime(e.logged_at), raw: (e) => formatDateTime(e.logged_at), width: 20 },
  { key: "logged_by_name", label: "Logged by", text: (e) => e.logged_by_name ?? "", raw: (e) => e.logged_by_name ?? "", width: 18 },
];

export interface ReportSpec {
  title: string;
  subtitle: string;
  columns: ColumnDef[];
  entries: Entry[];
}

export function reportFileName(ext: string): string {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return `pharmacy-bills-${stamp}.${ext}`;
}

export function grandTotal(entries: Entry[]): number {
  return sumTotals(entries.map((e) => e.total_amount));
}

export function makeCsv(spec: ReportSpec): Blob {
  const rows = spec.entries.map((e) => spec.columns.map((c) => c.raw(e) as string | number | null));
  if (spec.columns.some((c) => c.key === "total_amount")) {
    rows.push(spec.columns.map((c, i) => (c.key === "total_amount" ? grandTotal(spec.entries) : i === 0 ? "Grand total" : "")));
  }
  return new Blob([toCsv(spec.columns.map((c) => c.label), rows)], { type: "text/csv;charset=utf-8" });
}

export async function makeXlsx(spec: ReportSpec): Promise<Blob> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const header = spec.columns.map((c) => ({ value: c.label, fontWeight: "bold" as const, backgroundColor: "#ccfbf1" }));
  const body = spec.entries.map((e) =>
    spec.columns.map((c) => {
      const v = c.raw(e);
      if (v === null || v === undefined || v === "") return null;
      if (c.key === "bill_date") {
        const [y, m, d] = String(v).split("-").map(Number);
        return { value: new Date(Date.UTC(y, m - 1, d)), type: Date, format: "dd-mmm-yyyy" };
      }
      if (typeof v === "number") return { value: v, type: Number, format: c.key === "rate" || c.key === "total_amount" ? "#,##0.00" : undefined };
      return { value: String(v), type: String };
    }),
  );
  const rows = [header, ...body];
  if (spec.columns.some((c) => c.key === "total_amount")) {
    rows.push(
      spec.columns.map((c, i) =>
        c.key === "total_amount"
          ? { value: grandTotal(spec.entries), type: Number, format: "#,##0.00", fontWeight: "bold" as const }
          : i === 0
            ? { value: "Grand total", type: String, fontWeight: "bold" as const }
            : null,
      ),
    );
  }
  // write-excel-file's cell typing is very strict; the shapes above match its CellObject.
  return writeXlsxFile(rows as never, { sheet: "Bills", columns: spec.columns.map((c) => ({ width: c.width })), stickyRowsCount: 1 }).toBlob();
}

export async function makePdf(spec: ReportSpec): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const wide = spec.columns.length > 5;
  const doc = new jsPDF({ orientation: wide ? "landscape" : "portrait", unit: "pt", format: "a4" });
  doc.setFontSize(16);
  doc.text(spec.title, 40, 40);
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(spec.subtitle, 40, 58);
  doc.text(`Generated ${formatDateTime(new Date().toISOString())} · ${spec.entries.length} rows`, 40, 72);

  const hasTotal = spec.columns.some((c) => c.key === "total_amount");
  // jsPDF's built-in fonts have no ₹ glyph, so amounts are shown without the symbol.
  autoTable(doc, {
    startY: 84,
    head: [spec.columns.map((c) => c.label)],
    body: spec.entries.map((e) => spec.columns.map((c) => c.text(e))),
    foot: hasTotal
      ? [spec.columns.map((c, i) => (c.key === "total_amount" ? formatMoney(grandTotal(spec.entries)) : i === 0 ? "Grand total" : ""))]
      : undefined,
    showFoot: "lastPage",
    styles: { fontSize: 9, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [15, 118, 110], textColor: 255 },
    footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
    columnStyles: Object.fromEntries(spec.columns.map((c, i) => [i, c.numeric ? { halign: "right" } : {}])),
    didDrawPage: () => {
      const pageSize = doc.internal.pageSize;
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`Page ${doc.getNumberOfPages()}`, pageSize.getWidth() - 70, pageSize.getHeight() - 20);
    },
  });
  return doc.output("blob");
}

/** Can this browser share files (WhatsApp, email…) via the phone's share sheet? */
export function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [new File(["x"], "x.csv", { type: "text/csv" })] });
  } catch {
    return false;
  }
}

export async function shareOrDownload(blob: Blob, fileName: string, title: string, preferShare: boolean): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], fileName, { type: blob.type });
  if (preferShare && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text: title });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // fall through to download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
