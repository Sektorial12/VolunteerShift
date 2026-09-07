"use client";

/**
 * Last-resort boundary: catches errors thrown by the root layout itself.
 * It replaces <html>, so it cannot use the app's fonts or Tailwind layer.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          color: "#0f172a",
        }}
      >
        <div style={{ maxWidth: 420, padding: 32, textAlign: "center" }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>VolunteerShift could not start</h1>
          <p style={{ marginTop: 8, fontSize: 14, color: "#64748b" }}>{error.message}</p>
          <button
            onClick={reset}
            style={{
              marginTop: 20,
              height: 36,
              padding: "0 14px",
              borderRadius: 8,
              border: "none",
              background: "#0f172a",
              color: "#fff",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
