"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BILL_BUCKET } from "@/lib/env";
import { compressImage } from "@/lib/image";
import { takePendingFile } from "@/lib/pending-file";
import { emptyRow, extractedToRows, todayISO } from "@/lib/bill";
import type { ExtractResponse, ItemRow } from "@/lib/types";
import { useProfile } from "@/components/profile-context";
import { BillEditor } from "@/components/bill-editor";
import { ScanButtons } from "@/components/scan-buttons";
import { PageHeader } from "@/components/nav";
import { Button, ErrorBox, Spinner, friendlyError } from "@/components/ui";

type Step = "compress" | "upload" | "extract";
type Notice = { tone: "info" | "warn" | "success"; text: string } | null;
type State =
  | { kind: "pick" }
  | { kind: "working"; step: Step; previewUrl: string }
  | { kind: "uploadFailed"; message: string; file: File; previewUrl: string }
  | {
      kind: "edit";
      date: string;
      rows: ItemRow[];
      imagePath: string | null;
      previewUrl: string | null;
      notice: Notice;
    };

const STEPS: { key: Step; label: string }[] = [
  { key: "compress", label: "Preparing photo" },
  { key: "upload", label: "Uploading" },
  { key: "extract", label: "Reading bill with AI" },
];

function NewBill() {
  const router = useRouter();
  const params = useSearchParams();
  const { profile } = useProfile();
  const [state, setState] = useState<State>({ kind: "pick" });
  const started = useRef(false);

  const manual = useCallback((notice: Notice = null, imagePath: string | null = null, previewUrl: string | null = null) => {
    setState({ kind: "edit", date: todayISO(), rows: [emptyRow(1)], imagePath, previewUrl, notice });
  }, []);

  const process = useCallback(
    async (file: File) => {
      const previewUrl = URL.createObjectURL(file);
      let imagePath: string | null = null;
      try {
        setState({ kind: "working", step: "compress", previewUrl });
        const blob = await compressImage(file);

        setState({ kind: "working", step: "upload", previewUrl });
        const supabase = createClient();
        const path = `${profile.id}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage.from(BILL_BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
        if (upErr) throw upErr;
        imagePath = path;
      } catch (e) {
        setState({ kind: "uploadFailed", message: friendlyError(e), file, previewUrl });
        return;
      }

      setState({ kind: "working", step: "extract", previewUrl });
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 65_000);
        const res = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imagePath }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        const body = (await res.json().catch(() => ({}))) as Partial<ExtractResponse> & { error?: string };
        if (!res.ok || !body.rows) throw new Error(body.error || "The bill could not be read.");
        setState({
          kind: "edit",
          date: body.bill_date ?? todayISO(),
          rows: extractedToRows(body.rows),
          imagePath,
          previewUrl,
          notice: {
            tone: body.bill_date ? "success" : "warn",
            text: body.bill_date
              ? `Read ${body.rows.length} item(s). Check every value against the photo before submitting.`
              : `Read ${body.rows.length} item(s), but no date was found — please set the bill date.`,
          },
        });
      } catch (e) {
        const msg = e instanceof DOMException && e.name === "AbortError" ? "Reading the bill took too long." : friendlyError(e);
        manual({ tone: "warn", text: `${msg} Enter the items below — the photo is saved with the bill.` }, imagePath, previewUrl);
      }
    },
    [profile.id, manual],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const file = takePendingFile();
    if (file) process(file);
    else if (params.get("manual")) manual();
  }, [params, process, manual]);

  async function discard() {
    if (state.kind === "edit" && state.imagePath) {
      await createClient().storage.from(BILL_BUCKET).remove([state.imagePath]);
    }
    router.push("/");
  }

  if (state.kind === "pick") {
    return (
      <>
        <PageHeader title="New bill" back="/" />
        <ScanButtons onFile={process} onManual={() => manual()} />
      </>
    );
  }

  if (state.kind === "working") {
    const idx = STEPS.findIndex((s) => s.key === state.step);
    return (
      <>
        <PageHeader title="New bill" />
        <div className="space-y-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <img src={state.previewUrl} alt="Bill being read" className="mx-auto max-h-60 rounded-xl object-contain" />
          <ol className="space-y-3" aria-live="polite">
            {STEPS.map((s, i) => (
              <li key={s.key} className={`flex items-center gap-3 text-lg ${i > idx ? "text-slate-400" : "text-slate-900"}`}>
                {i < idx ? (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white">✓</span>
                ) : i === idx ? (
                  <Spinner className="h-7 w-7 text-brand-700" />
                ) : (
                  <span className="h-7 w-7 rounded-full border-2 border-slate-300" />
                )}
                {s.label}
              </li>
            ))}
          </ol>
          {state.step === "extract" && <p className="text-center text-sm text-slate-500">This usually takes 10–30 seconds.</p>}
        </div>
      </>
    );
  }

  if (state.kind === "uploadFailed") {
    return (
      <>
        <PageHeader title="New bill" back="/" />
        <div className="space-y-4">
          <img src={state.previewUrl} alt="" className="mx-auto max-h-60 rounded-xl object-contain" />
          <ErrorBox>Upload failed: {state.message}</ErrorBox>
          <Button className="w-full" onClick={() => process(state.file)}>
            Try again
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => manual({ tone: "info", text: "Entering without a photo." })}>
            Enter manually without photo
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Review bill"
        actions={
          <button onClick={discard} className="min-h-11 rounded-lg px-3 font-semibold text-red-600 active:bg-red-50">
            Discard
          </button>
        }
      />
      <BillEditor
        initialDate={state.date}
        initialRows={state.rows}
        imagePath={state.imagePath}
        localImageUrl={state.previewUrl}
        notice={state.notice}
        canEdit
        onSaved={(id) => router.replace(`/bills/${id}?saved=1`)}
      />
    </>
  );
}

export default function NewBillPage() {
  return (
    <Suspense>
      <NewBill />
    </Suspense>
  );
}
