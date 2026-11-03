import Link from "next/link";
import { formatMoney } from "@/lib/bill";
import { formatDate, formatDateTime } from "@/lib/format";

export interface BillSummary {
  id: string;
  bill_date: string;
  logged_at: string;
  logged_by: string;
  image_url: string | null;
  logged_by_name: string;
  item_count: number;
  total: number;
}

export function BillCard({ bill }: { bill: BillSummary }) {
  return (
    <Link href={`/bills/${bill.id}`} className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 active:bg-slate-50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-lg font-semibold">{formatDate(bill.bill_date)}</div>
          <div className="text-sm text-slate-500">
            {bill.item_count} item{bill.item_count === 1 ? "" : "s"}
            {bill.image_url ? " · 📷" : ""}
          </div>
        </div>
        <div className="tabular shrink-0 text-right text-lg font-bold">₹ {formatMoney(bill.total)}</div>
      </div>
      <div className="mt-2 truncate text-xs text-slate-500">
        Logged by {bill.logged_by_name} · {formatDateTime(bill.logged_at)}
      </div>
    </Link>
  );
}
