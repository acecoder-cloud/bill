"use client";
import { useEffect, useState } from "react";

/** Registers the service worker and shows a banner while the phone is offline. */
export function PwaSetup() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => console.warn("SW registration failed", e));
    }
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;
  return (
    <div role="status" className="pt-safe fixed inset-x-0 top-0 z-50 bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-amber-950">
      You&apos;re offline. Bills can&apos;t be scanned or saved until you reconnect.
    </div>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pbl-install-dismissed";

/** "Install app" card: a real install button on Android/desktop Chrome, instructions on iPhone. */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {}
    if (standalone || dismissed) return;

    const ua = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
    if (isIos) {
      setIos(true);
      setHidden(false);
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    const onInstalled = () => setHidden(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  }

  if (hidden) return null;
  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
      <div className="flex items-start gap-3">
        <img src="/icons/icon-192.png" alt="" className="h-11 w-11 rounded-xl" />
        <div className="flex-1">
          <p className="font-semibold text-brand-900">Install Bill Log on your phone</p>
          {ios ? (
            <p className="mt-1 text-sm text-brand-900">
              In Safari, tap <b>Share</b>{" "}
              <svg viewBox="0 0 24 24" className="inline h-4 w-4 align-[-2px]" fill="none" stroke="currentColor" strokeWidth="2" aria-label="Share icon">
                <path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8" />
              </svg>{" "}
              then <b>Add to Home Screen</b>.
            </p>
          ) : (
            <p className="mt-1 text-sm text-brand-900">Opens full-screen like an app, straight from your home screen.</p>
          )}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        {deferred && (
          <button
            className="min-h-11 flex-1 rounded-xl bg-brand-700 px-4 font-semibold text-white"
            onClick={async () => {
              await deferred.prompt();
              const choice = await deferred.userChoice;
              setDeferred(null);
              if (choice.outcome === "accepted") setHidden(true);
            }}
          >
            Install app
          </button>
        )}
        <button className="min-h-11 rounded-xl px-4 font-semibold text-brand-800" onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
