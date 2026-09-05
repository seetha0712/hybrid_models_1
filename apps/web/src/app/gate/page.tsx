// Password prompt shown to unauthenticated visitors (the middleware redirects here). Posts to
// /api/gate, which checks the password and sets the auth cookie on success.
export const metadata = { title: "The Model Spectrum — enter password" };

export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const next = sp?.next ?? "/";
  const failed = sp?.error === "1";

  return (
    <div style={{ maxWidth: 380, margin: "8vh auto", textAlign: "center" }}>
      <h1 className="text-xl font-semibold">The Model Spectrum · live</h1>
      <p className="muted" style={{ marginTop: 8 }}>This demo is password protected.</p>
      <form method="post" action="/api/gate" style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        <input type="hidden" name="next" value={next} />
        <input
          type="password"
          name="password"
          placeholder="Password"
          aria-label="Password"
          autoFocus
          required
          autoComplete="current-password"
          style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-1)" }}
        />
        <button type="submit" style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", fontWeight: 600, cursor: "pointer" }}>
          Enter
        </button>
      </form>
      {failed ? <p style={{ color: "crimson", marginTop: 12 }}>Incorrect password. Try again.</p> : null}
    </div>
  );
}
