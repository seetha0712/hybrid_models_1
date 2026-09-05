// Site-wide password gate. Runs on the Edge before any page renders. Unauthenticated requests are
// redirected to /gate, which posts the password to /api/gate; on success that route sets an httpOnly
// cookie this middleware checks. The password is read at runtime from SITE_PASSWORD (a Vercel project
// env var — not committed, not in the client bundle); if it is unset the gate fails closed.
// (Basic-Auth prompts can't be used here: Vercel strips the WWW-Authenticate header from middleware.)
import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/gate";

const PASSWORD = process.env.SITE_PASSWORD;

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  // The gate page and its verify endpoint must be reachable while unauthenticated.
  if (pathname === "/gate" || pathname.startsWith("/api/gate")) return NextResponse.next();

  if (PASSWORD && req.cookies.get(AUTH_COOKIE)?.value === PASSWORD) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/gate";
  url.search = "";
  url.searchParams.set("next", pathname + (req.nextUrl.search || ""));
  return NextResponse.redirect(url);
}

// Gate every route except Next's static assets, the image optimizer, and the favicon.
// extraction-scenario is a public, shareable calculator: exclude it from the gate.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|extraction-scenario).*)"] };
