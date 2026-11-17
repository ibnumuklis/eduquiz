"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="id">
      <body style={{ fontFamily: "system-ui", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center" }}>
          <h1>EDUQUIZ sedang mengalami gangguan</h1>
          <p>Silakan muat ulang halaman.</p>
          <button onClick={reset} style={{ padding: "8px 16px", borderRadius: 12, background: "#4f46e5", color: "white", border: 0 }}>Muat ulang</button>
        </div>
      </body>
    </html>
  );
}
