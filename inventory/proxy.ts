import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Paths anyone can open without logging in.
const PUBLIC_PATHS = new Set(["/login", "/api/auth/login", "/api/auth/logout"]);

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const session = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value
  );

  if (PUBLIC_PATHS.has(pathname)) {
    // Already logged in: skip the login page.
    if (pathname === "/login" && session) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  }

  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ message: "Please log in again." }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);

  if (pathname !== "/") {
    loginUrl.searchParams.set("next", pathname + search);
  }

  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Everything except Next.js build assets and the logo/icons shown on the
  // login page. Uploaded files (/uploads/...) are protected too.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|logo.png|logo-mark.png|fonts/|brand/).*)"],
};
