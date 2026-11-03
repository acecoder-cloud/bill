"use client";

export function DateRange({
  from,
  to,
  onChange,
  label = "Bill date",
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  label?: string;
}) {
  const cls = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-2";
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-slate-700">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-xs text-slate-500">From</span>
          <input type="date" value={from} max={to || undefined} onChange={(e) => onChange(e.target.value, to)} className={cls} />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">To</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => onChange(from, e.target.value)} className={cls} />
        </label>
      </div>
    </fieldset>
  );
}

/** Converts a YYYY-MM-DD "to" date into an exclusive timestamp bound for timestamptz columns. */
export function nextDayISO(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(y, m - 1, d + 1);
  return next.toISOString();
}

export function startOfDayISO(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toISOString();
}
