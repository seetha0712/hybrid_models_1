// Verifies the site password and, on success, sets the httpOnly auth cookie the middleware checks.
import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/gate";

export const runtime = "edge";

function safeNext(next: string): string {
  // Only allow same-site relative paths (avoid open redirects).
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const next = safeNext(String(form.get("next") ?? "/"));
  const PASSWORD = process.env.SITE_PASSWORD;
  const url = req.nextUrl.clone();
  url.search = "";

  if (PASSWORD && password === PASSWORD) {
    url.pathname = next;
    const res = NextResponse.redirect(url, 303);
    res.cookies.set(AUTH_COOKIE, password, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // one week
    });
    return res;
  }

  url.pathname = "/gate";
  url.searchParams.set("error", "1");
  url.searchParams.set("next", next);
  return NextResponse.redirect(url, 303);
}
