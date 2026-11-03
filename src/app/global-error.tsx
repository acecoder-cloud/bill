"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, background: "#f1f5f9" }}>
        <h1>Pharmacy Bill Log couldn&apos;t start</h1>
        <p>{/is not set/.test(error.message) ? `Setup problem: ${error.message}.` : "Please check your connection and try again."}</p>
        <button onClick={reset} style={{ minHeight: 48, padding: "0 20px", borderRadius: 12, border: 0, background: "#0f766e", color: "#fff", fontWeight: 600 }}>
          Try again
        </button>
      </body>
    </html>
  );
}
