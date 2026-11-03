/** Shown instead of the app when required settings are missing, so the problem is obvious after deploying. */
export function SetupNeeded({ missing }: { missing: string[] }) {
  const needsRedeploy = missing.some((m) => m.startsWith("NEXT_PUBLIC_"));
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-5 py-10">
      <h1 className="text-2xl font-bold text-brand-800">Pharmacy Bill Log needs setup</h1>
      <p className="text-slate-700">These settings are missing on the server:</p>
      <ul className="space-y-2">
        {missing.map((m) => (
          <li key={m} className="rounded-xl bg-white px-3 py-2 font-mono text-sm ring-1 ring-slate-200">
            {m}
          </li>
        ))}
      </ul>
      <ol className="list-decimal space-y-1 pl-5 text-slate-700">
        <li>
          In Vercel, open your project → <b>Settings → Environment Variables</b> and add them for <b>Production</b> (and Preview if you use it).
        </li>
        <li>
          Open <b>Deployments</b>, click <b>⋯</b> on the latest one and choose <b>Redeploy</b>.
          {needsRedeploy && " Settings starting with NEXT_PUBLIC_ only take effect after a redeploy."}
        </li>
      </ol>
      <p className="text-sm text-slate-500">The values are on Supabase → Project Settings → API Keys, and console.anthropic.com → API Keys. See the README, step 4.</p>
    </main>
  );
}
