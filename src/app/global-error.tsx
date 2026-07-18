"use client";

/**
 * Root-level crash boundary. This is the LAST line of defense — it fires only
 * when the root layout itself throws, so the app's providers (theme, next-intl,
 * global CSS) are unavailable. It therefore renders its own <html>/<body> and
 * styles itself inline, with no imports from the app. Hebrew + RTL, theme-aware
 * via prefers-color-scheme. Replaces the browser's raw white-screen error.
 *
 * Note: `error.digest` is a stable hash of the server error — surfaced quietly
 * so a student can quote it if they report the problem. When error monitoring
 * (Sentry) is wired, this is the natural place to also report the crash.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="he" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
          background: "#ffffff",
          color: "#1a1a1a",
          padding: "24px",
        }}
      >
        <style>{`
          @media (prefers-color-scheme: dark) {
            body { background: #0e0e10 !important; color: #f5f5f5 !important; }
            .pk-crash-muted { color: #a1a1aa !important; }
            .pk-crash-digest { color: #71717a !important; }
            .pk-crash-btn { background: #f5f5f5 !important; color: #111 !important; }
            .pk-crash-reload { color: #a1a1aa !important; }
          }
          .pk-crash-btn:hover { opacity: 0.9; }
          .pk-crash-reload:hover { text-decoration: underline; }
        `}</style>

        <div style={{ maxWidth: "26rem", textAlign: "center" }}>
          <div
            aria-hidden="true"
            style={{
              width: "64px",
              height: "64px",
              margin: "0 auto 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "9999px",
              background: "rgba(220, 38, 38, 0.1)",
              fontSize: "30px",
              lineHeight: 1,
            }}
          >
            👑
          </div>

          <h1 style={{ margin: "0 0 8px", fontSize: "22px", fontWeight: 700 }}>
            משהו השתבש לרגע
          </h1>
          <p
            className="pk-crash-muted"
            style={{ margin: "0 0 24px", fontSize: "15px", color: "#555", lineHeight: 1.6 }}
          >
            נתקלנו בתקלה בטעינת העמוד. הנתונים שלכם בטוחים — אפשר לנסות שוב, ואם
            זה חוזר, רעננו את הדף.
          </p>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              alignItems: "center",
            }}
          >
            <button
              className="pk-crash-btn"
              onClick={() => reset()}
              style={{
                border: "none",
                cursor: "pointer",
                borderRadius: "10px",
                background: "#1a1a1a",
                color: "#ffffff",
                padding: "11px 28px",
                fontSize: "15px",
                fontWeight: 600,
                fontFamily: "inherit",
              }}
            >
              נסו שוב
            </button>
            <button
              className="pk-crash-reload"
              onClick={() => window.location.reload()}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "#777",
                fontSize: "13px",
                fontFamily: "inherit",
              }}
            >
              רענון הדף
            </button>
          </div>

          {error.digest && (
            <p
              className="pk-crash-digest"
              style={{ marginTop: "20px", fontSize: "12px", color: "#aaa", direction: "ltr" }}
            >
              קוד תקלה: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
