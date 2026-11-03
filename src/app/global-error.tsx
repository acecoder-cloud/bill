"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, background: "#f1f5f9" }}>
        <h1>Pharmacy Bill Log couldn&apos;t start</h1>
        <p>
          {/is not set/.test(error.message)
            ? `Setup problem: ${error.message}.`
            : "Something went wrong on the server. Check your connection and try again. If this keeps happening, the admin should check the Vercel logs and that the Supabase migrations were run."}
        </p>
        {error.digest && <p style={{ color: "#64748b", fontSize: 13 }}>Error code: {error.digest}</p>}
        <button onClick={reset} style={{ minHeight: 48, padding: "0 20px", borderRadius: 12, border: 0, background: "#0f766e", color: "#fff", fontWeight: 600 }}>
          Try again
        </button>
      </body>
    </html>
  );
}
