"use client";
import { useEffect, useState } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { createClient } from "@/lib/supabase/client";
import { BILL_BUCKET } from "@/lib/env";
import { Spinner } from "./ui";

/** Gets a short-lived link to a private bill photo. */
export function useBillPhotoUrl(imagePath: string | null | undefined, localUrl?: string | null) {
  const [url, setUrl] = useState<string | null>(localUrl ?? null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (localUrl) {
      setUrl(localUrl);
      return;
    }
    if (!imagePath) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    createClient()
      .storage.from(BILL_BUCKET)
      .createSignedUrl(imagePath, 60 * 60)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) setError("Couldn't load the photo.");
        else setUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [imagePath, localUrl]);
  return { url, error };
}

/** Full-screen photo with pinch-to-zoom, double-tap zoom and pan. */
export function PhotoViewer({ url, onClose }: { url: string; onClose: () => void }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Bill photo">
      <div className="pt-safe flex items-center justify-between bg-black/80 px-3 py-2 text-white">
        <span className="text-sm text-slate-300">Pinch or double-tap to zoom</span>
        <button onClick={onClose} className="min-h-11 rounded-lg px-4 font-semibold active:bg-white/10">
          Close
        </button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <Spinner className="h-8 w-8" />
          </div>
        )}
        <TransformWrapper minScale={1} maxScale={6} doubleClick={{ mode: "toggle", step: 2.5 }} centerOnInit>
          <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }} contentStyle={{ width: "100%", height: "100%" }}>
            <img src={url} alt="Bill photo" onLoad={() => setLoaded(true)} className="h-full w-full object-contain" />
          </TransformComponent>
        </TransformWrapper>
      </div>
    </div>
  );
}
