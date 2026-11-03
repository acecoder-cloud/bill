"use client";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BILL_BUCKET } from "@/lib/env";
import { itemsToRows } from "@/lib/bill";
import { formatDateTime } from "@/lib/format";
import type { BillItem } from "@/lib/types";
import { useProfile } from "@/components/profile-context";
import { BillEditor } from "@/components/bill-editor";
import { PageHeader } from "@/components/nav";
import { Button, EmptyState, ErrorBox, LoadingBlock, friendlyError } from "@/components/ui";

interface LoadedBill {
  id: string;
  bill_date: string;
  image_url: string | null;
  logged_by: string;
  logged_at: string;
  updated_at: string;
  profiles: { name: string } | null;
  bill_items: BillItem[];
}

export default function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const search = useSearchParams();
  const { profile } = useProfile();
  const [bill, setBill] = useState<LoadedBill | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [savedMsg, setSavedMsg] = useState(search.get("saved") ? "Bill saved." : "");

  const load = useCallback(async () => {
    setError("");
    const { data, error } = await createClient()
      .from("bills")
      .select("id, bill_date, image_url, logged_by, logged_at, updated_at, profiles(name), bill_items(*)")
      .eq("id", id)
      .maybeSingle();
    if (error) setError(friendlyError(error));
    else setBill(data as unknown as LoadedBill | null);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove() {
    if (!bill || !window.confirm("Delete this bill and all its items? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const supabase = createClient();
      const { data: imagePath, error } = await supabase.rpc("delete_bill", { p_bill_id: bill.id });
      if (error) throw error;
      if (imagePath) await supabase.storage.from(BILL_BUCKET).remove([imagePath as string]);
      router.replace("/entries");
    } catch (e) {
      setError(friendlyError(e));
      setDeleting(false);
    }
  }

  if (error && !bill) return <ErrorBox onRetry={load}>{error}</ErrorBox>;
  if (bill === undefined) return <LoadingBlock />;
  if (bill === null)
    return (
      <>
        <PageHeader title="Bill" back="/entries" />
        <EmptyState title="Bill not found">It may have been deleted, or you don&apos;t have access to it.</EmptyState>
      </>
    );

  const canEdit = profile.role === "admin" || bill.logged_by === profile.id;

  return (
    <>
      <PageHeader title={canEdit ? "Edit bill" : "Bill"} back="/entries" />
      <p className="-mt-2 mb-4 text-sm text-slate-500">
        Logged by <b>{bill.profiles?.name ?? "Unknown"}</b> · {formatDateTime(bill.logged_at)}
        {bill.updated_at && new Date(bill.updated_at).getTime() - new Date(bill.logged_at).getTime() > 60_000 && <> · edited {formatDateTime(bill.updated_at)}</>}
      </p>
      {error && <div className="mb-4"><ErrorBox>{error}</ErrorBox></div>}
      <BillEditor
        key={version}
        billId={bill.id}
        initialDate={bill.bill_date}
        initialRows={itemsToRows(bill.bill_items)}
        imagePath={bill.image_url}
        canEdit={canEdit}
        submitLabel="Save changes"
        notice={savedMsg ? { tone: "success", text: savedMsg } : canEdit ? null : { tone: "info", text: "You can view this bill. Only the person who logged it (or an admin) can edit it." }}
        onSaved={async () => {
          setSavedMsg("Changes saved.");
          await load();
          setVersion((v) => v + 1);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
      {canEdit && (
        <Button variant="danger" className="mt-6 w-full" loading={deleting} onClick={remove}>
          Delete bill
        </Button>
      )}
    </>
  );
}
