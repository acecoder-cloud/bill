import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="pt-safe mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <img src="/icons/icon-192.png" alt="" className="mx-auto mb-3 h-16 w-16 rounded-2xl shadow" />
        <h1 className="text-2xl font-bold text-brand-800">Pharmacy Bill Log</h1>
      </div>
      {children}
    </main>
  );
}
