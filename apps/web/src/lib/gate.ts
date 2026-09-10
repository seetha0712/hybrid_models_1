// Name of the httpOnly cookie that marks a session as having passed the site password gate.
export const AUTH_COOKIE = "sp_auth";

// The set of accepted site passwords, read at runtime from env (never committed, never in the client
// bundle). SITE_PASSWORD is the primary; SITE_PASSWORD_2 and a comma-separated SITE_PASSWORDS add
// alternates. Blank/whitespace entries are dropped, so an unset env fails closed.
export function acceptedPasswords(): string[] {
  const extra = process.env.SITE_PASSWORDS?.split(",") ?? [];
  return [process.env.SITE_PASSWORD, process.env.SITE_PASSWORD_2, ...extra]
    .map((s) => (s ?? "").trim())
    .filter(Boolean);
}
