import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

const PUBLIC_PATHS = new Set(["/sign-in", "/offline", "/suspended"]);

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIES.some((name) => request.cookies.has(name));
}

/**
 * UX-level routing only: cookie presence decides redirects, while real
 * authorization always happens server-side in layouts and services.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const authenticated = hasSessionCookie(request);

  if (PUBLIC_PATHS.has(pathname)) {
    // Never redirect away from sign-in based only on cookie presence. An expired,
    // malformed, or pre-upgrade JWT must be allowed to reach the sign-in page
    // instead of creating a /sign-in <-> /new redirect loop.
    return NextResponse.next();
  }

  if (!authenticated) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/new",
    "/projects/:path*",
    "/usage",
    "/account",
    "/admin/:path*",
    "/sign-in/:path*",
    "/sign-in",
  ],
};
