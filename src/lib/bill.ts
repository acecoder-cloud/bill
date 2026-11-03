// Pure helpers for bill rows. No React or Supabase here, so they are easy to unit test.
import type { BillItem, ExtractResponse, ExtractedRow, ItemRow } from "./types.ts";

let keyCounter = 0;
export function newKey(): string {
  keyCounter += 1;
  return `r${Date.now().toString(36)}${keyCounter}`;
}

export function emptyRow(serial = 1): ItemRow {
  return { key: newKey(), serial_no: String(serial), item_name: "", qty: "", rate: "", total_amount: "" };
}

/** Parse what a person typed ("1,250.50", " 12 ", "₹85") into a number, or null when blank/invalid. */
export function parseNum(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = value.replace(/[₹,\s]/g, "").replace(/^rs\.?/i, "");
  if (cleaned === "") return null;
  if (!/^-?\d*\.?\d+$/.test(cleaned) && !/^-?\d+\.$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function isValidNumberInput(value: string): boolean {
  return value.trim() === "" || parseNum(value) !== null;
}

/** True when Qty × Rate does not match Tot. Amt. (allowing for rounding). Rows missing a value are not flagged. */
export function hasMismatch(qty: number | null, rate: number | null, total: number | null): boolean {
  if (qty === null || rate === null || total === null) return false;
  const expected = qty * rate;
  const tolerance = Math.max(0.01, Math.abs(expected) * 0.0005);
  return Math.abs(expected - total) > tolerance + 1e-9;
}

export function rowHasMismatch(row: ItemRow): boolean {
  return hasMismatch(parseNum(row.qty), parseNum(row.rate), parseNum(row.total_amount));
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function sumTotals(values: Array<number | null | undefined>): number {
  return round2(values.reduce<number>((acc, v) => acc + (typeof v === "number" && Number.isFinite(v) ? v : 0), 0));
}

const moneyFmt = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function formatMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return moneyFmt.format(n);
}

export function formatQty(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return String(Number(n.toFixed(3)));
}

/** Today's date as YYYY-MM-DD in the phone's local time zone. */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isISODate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Make sure whatever the AI returned is safe to show in the editor. */
export function normalizeExtraction(raw: unknown): ExtractResponse {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const topDate = isISODate(obj.bill_date) ? obj.bill_date : null;
  const list = Array.isArray(obj.items) ? obj.items : Array.isArray(obj.rows) ? obj.rows : [];
  const rows: ExtractedRow[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const name = typeof r.item_name === "string" ? r.item_name.trim() : "";
    const qty = parseNum(r.qty as string | number | null);
    const rate = parseNum(r.rate as string | number | null);
    const total = parseNum(r.total_amount as string | number | null);
    if (!name && qty === null && rate === null && total === null) continue;
    const serial = parseNum(r.serial_no as string | number | null);
    rows.push({
      serial_no: serial !== null ? Math.trunc(serial) : null,
      bill_date: isISODate(r.bill_date) ? r.bill_date : topDate,
      item_name: name,
      qty,
      rate,
      total_amount: total,
    });
  }
  return { bill_date: topDate ?? rows.find((r) => r.bill_date)?.bill_date ?? null, rows };
}

function numToInput(n: number | null): string {
  return n === null ? "" : String(n);
}

export function extractedToRows(rows: ExtractedRow[]): ItemRow[] {
  return rows.map((r, i) => ({
    key: newKey(),
    serial_no: String(r.serial_no ?? i + 1),
    item_name: r.item_name,
    qty: numToInput(r.qty),
    rate: numToInput(r.rate),
    total_amount: numToInput(r.total_amount),
  }));
}

export function itemsToRows(items: BillItem[]): ItemRow[] {
  return [...items]
    .sort((a, b) => (a.serial_no ?? 1e9) - (b.serial_no ?? 1e9))
    .map((it, i) => ({
      key: newKey(),
      serial_no: String(it.serial_no ?? i + 1),
      item_name: it.item_name,
      qty: numToInput(it.qty),
      rate: numToInput(it.rate),
      total_amount: numToInput(it.total_amount),
    }));
}

export interface RowProblem {
  key: string;
  message: string;
}

/** Check rows before saving. Returns the cleaned items for the database, or a list of problems. */
export function validateRows(rows: ItemRow[]): { items: Array<Record<string, number | string | null>>; problems: RowProblem[] } {
  const problems: RowProblem[] = [];
  const meaningful = rows.filter(
    (r) => r.item_name.trim() || r.qty.trim() || r.rate.trim() || r.total_amount.trim(),
  );
  if (meaningful.length === 0) problems.push({ key: "", message: "Add at least one item." });
  const items = meaningful.map((r, i) => {
    const label = `Row ${i + 1}`;
    if (!r.item_name.trim()) problems.push({ key: r.key, message: `${label}: item name is required.` });
    for (const [field, nice] of [["serial_no", "Serial no."], ["qty", "Qty"], ["rate", "Rate"], ["total_amount", "Tot. Amt."]] as const) {
      if (!isValidNumberInput(r[field])) problems.push({ key: r.key, message: `${label}: ${nice} must be a number.` });
    }
    const serial = parseNum(r.serial_no);
    return {
      serial_no: serial === null ? i + 1 : Math.trunc(serial),
      item_name: r.item_name.trim(),
      qty: parseNum(r.qty),
      rate: parseNum(r.rate),
      total_amount: parseNum(r.total_amount),
    };
  });
  return { items, problems };
}

// ---------- CSV ----------
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // Stop spreadsheet apps from treating cell text as a formula
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(","));
  // BOM so Excel opens UTF-8 (₹, Hindi names, etc.) correctly
  return "﻿" + lines.join("\r\n") + "\r\n";
}
