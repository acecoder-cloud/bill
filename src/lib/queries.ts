"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillSummary } from "@/components/bill-card";
import { sumTotals } from "./bill";

export const BILL_LIST_SELECT =
  "id, bill_date, logged_at, logged_by, image_url, profiles(name), bill_items(total_amount)";

interface RawBill {
  id: string;
  bill_date: string;
  logged_at: string;
  logged_by: string;
  image_url: string | null;
  profiles: { name: string } | { name: string }[] | null;
  bill_items: { total_amount: number | null }[];
}

export function toBillSummary(raw: RawBill): BillSummary {
  const p = Array.isArray(raw.profiles) ? raw.profiles[0] : raw.profiles;
  return {
    id: raw.id,
    bill_date: raw.bill_date,
    logged_at: raw.logged_at,
    logged_by: raw.logged_by,
    image_url: raw.image_url,
    logged_by_name: p?.name || "Unknown",
    item_count: raw.bill_items.length,
    total: sumTotals(raw.bill_items.map((i) => i.total_amount)),
  };
}

/** Supabase returns at most 1000 rows per request; this pages through everything. */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
  max = 20000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

export type DB = SupabaseClient;
