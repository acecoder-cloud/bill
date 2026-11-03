"use client";
import Link from "next/link";
import { useRef } from "react";

/** Big "Scan Bill" (opens the camera) + "Choose from gallery" + "Enter manually". */
export function ScanButtons({ onFile, manualHref, onManual }: { onFile: (f: File) => void; manualHref?: string; onManual?: () => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  function picked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same photo again
    if (file) onFile(file);
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => cameraRef.current?.click()}
        className="flex min-h-24 w-full items-center justify-center gap-3 rounded-2xl bg-brand-700 px-4 text-2xl font-bold text-white shadow-md active:bg-brand-800"
      >
        <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        Scan Bill
      </button>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          className="min-h-14 rounded-2xl bg-white px-3 font-semibold text-brand-800 shadow-sm ring-1 ring-slate-200 active:bg-slate-50"
        >
          Choose from gallery
        </button>
        {manualHref ? (
          <Link href={manualHref} className="flex min-h-14 items-center justify-center rounded-2xl bg-white px-3 font-semibold text-brand-800 shadow-sm ring-1 ring-slate-200 active:bg-slate-50">
            Enter manually
          </Link>
        ) : (
          <button type="button" onClick={onManual} className="min-h-14 rounded-2xl bg-white px-3 font-semibold text-brand-800 shadow-sm ring-1 ring-slate-200 active:bg-slate-50">
            Enter manually
          </button>
        )}
      </div>
      {/* capture="environment" opens the back camera directly on phones */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={picked} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={picked} />
    </div>
  );
}
