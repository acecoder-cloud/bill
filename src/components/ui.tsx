"use client";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const variants: Record<Variant, string> = {
  primary: "bg-brand-700 text-white active:bg-brand-800 disabled:bg-slate-400",
  secondary: "bg-white text-slate-900 border border-slate-300 active:bg-slate-100 disabled:text-slate-400",
  danger: "bg-red-600 text-white active:bg-red-700 disabled:bg-red-300",
  ghost: "bg-transparent text-brand-700 active:bg-brand-50 disabled:text-slate-400",
};

export function Button({
  variant = "primary",
  loading = false,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 font-semibold transition-colors ${variants[variant]} ${className}`}
    >
      {loading && <Spinner className="h-5 w-5" />}
      {children}
    </button>
  );
}

export function Spinner({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Field({
  label,
  hint,
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input
        {...rest}
        className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-200"
      />
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function ErrorBox({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  if (!children) return null;
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
      <p>{children}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 min-h-10 font-semibold text-red-700 underline">
          Try again
        </button>
      )}
    </div>
  );
}

export function InfoBox({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "success" | "warn" }) {
  const tones = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
  };
  return <div className={`rounded-xl border p-3 ${tones[tone]}`}>{children}</div>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 ${className}`}>{children}</div>;
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500" role="status">
      <Spinner className="h-8 w-8 text-brand-700" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="py-12 text-center text-slate-500">
      <p className="text-lg font-semibold text-slate-700">{title}</p>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

/** Turn Supabase/PostgREST/network errors into short human messages. */
export function friendlyError(e: unknown): string {
  const msg =
    typeof e === "string"
      ? e
      : e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string"
        ? (e as { message: string }).message
        : "Something went wrong.";
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return "No internet connection. Check your connection and try again.";
  if (/jwt expired|invalid jwt|not signed in|sign in again/i.test(msg)) return "Your session expired. Please sign in again.";
  if (/row-level security|permission denied/i.test(msg)) return "You don't have permission to do that.";
  return msg;
}
