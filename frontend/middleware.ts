import { NextResponse, type NextRequest } from "next/server";

const accessCookieName = process.env.NEXT_PUBLIC_AUTH_COOKIE_NAME ?? "access_token";

export function middleware(request: NextRequest) {
  const hasAccessCookie = Boolean(request.cookies.get(accessCookieName)?.value);
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/chat") && !hasAccessCookie) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if ((pathname === "/login" || pathname === "/register") && hasAccessCookie) {
    return NextResponse.redirect(new URL("/chat", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/chat/:path*", "/login", "/register"],
};
