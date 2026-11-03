"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/nav";
import { Button, EmptyState, ErrorBox, LoadingBlock, friendlyError } from "@/components/ui";

interface AuditRow {
  id: number;
  user_id: string | null;
  action: string;
  entity_id: string | null;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
  profiles: { name: string; email: string } | null;
}

const PAGE = 40;
const ACTIONS: Record<string, string> = {
  "bill.create": "Bill created",
  "bill.update": "Bill edited",
  "bill.delete": "Bill deleted",
  "user.create": "User added",
  "user.role_change": "Role changed",
  "user.rename": "User renamed",
  "user.disable": "User disabled",
  "user.enable": "User enabled",
  "user.delete": "User deleted",
  "user.password_set": "Password set by admin",
  "settings.update": "Settings changed",
};

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [filter, setFilter] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  const fetchPage = useCallback(
    async (offset: number) => {
      let q = createClient()
        .from("audit_log")
        .select("id, user_id, action, entity_id, old_value, new_value, created_at, profiles(name, email)")
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE - 1);
      if (filter) q = q.like("action", `${filter}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AuditRow[];
    },
    [filter],
  );

  const reload = useCallback(async () => {
    setRows(null);
    setError("");
    try {
      const page = await fetchPage(0);
      setRows(page);
      setHasMore(page.length === PAGE);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [fetchPage]);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <>
      <PageHeader title="Audit log" back="/admin" />
      <select value={filter} onChange={(e) => setFilter(e.target.value)} className="mb-4 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3" aria-label="Filter by action">
        <option value="">All activity</option>
        <option value="bill.">Bills</option>
        <option value="user.">Users</option>
        <option value="settings.">Settings</option>
      </select>
      {error && <ErrorBox onRetry={reload}>{error}</ErrorBox>}
      {!error && rows === null && <LoadingBlock />}
      {rows && rows.length === 0 && <EmptyState title="No activity yet" />}
      <ul className="space-y-2">
        {rows?.map((r) => (
          <li key={r.id} className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <button className="w-full p-3 text-left" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{ACTIONS[r.action] ?? r.action}</span>
                <span className="shrink-0 text-xs text-slate-500">{formatDateTime(r.created_at)}</span>
              </div>
              <div className="text-sm text-slate-600">
                by {r.profiles?.name || r.profiles?.email || "system"}
                {describe(r) && <> · {describe(r)}</>}
              </div>
            </button>
            {open === r.id && (
              <div className="grid gap-2 border-t border-slate-100 p-3 text-xs sm:grid-cols-2">
                <Json label="Before" value={r.old_value} />
                <Json label="After" value={r.new_value} />
              </div>
            )}
          </li>
        ))}
      </ul>
      {hasMore && (
        <Button
          variant="secondary"
          className="mt-4 w-full"
          loading={loadingMore}
          onClick={async () => {
            if (!rows) return;
            setLoadingMore(true);
            try {
              const page = await fetchPage(rows.length);
              setRows([...rows, ...page]);
              setHasMore(page.length === PAGE);
            } catch (e) {
              setError(friendlyError(e));
            } finally {
              setLoadingMore(false);
            }
          }}
        >
          Load more
        </Button>
      )}
    </>
  );
}

function describe(r: AuditRow): string {
  const v = (r.new_value ?? r.old_value) as Record<string, unknown> | null;
  if (!v) return "";
  if (r.action.startsWith("bill.")) {
    const items = Array.isArray(v.items) ? v.items.length : 0;
    return `bill of ${v.bill_date} (${items} items)`;
  }
  if (r.action === "user.role_change") return `${v.email}: ${(r.old_value as { role?: string })?.role} → ${v.role}`;
  if (typeof v.email === "string") return v.email;
  return "";
}

function Json({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 font-semibold text-slate-600">{label}</div>
      <pre className="max-h-64 overflow-auto rounded-lg bg-slate-50 p-2 text-[11px] leading-snug">{value == null ? "—" : JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}
