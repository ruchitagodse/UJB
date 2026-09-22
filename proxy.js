import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  USER_COOKIE_NAME,
} from "@/lib/auth/accessControl";

export function proxy(req) {
  const { pathname, search } = req.nextUrl;
  const isPublicProspectFlow =
    /^\/user\/prospects\/[^/]+(?:\/feedback|\/completed)?$/.test(pathname);

  if (pathname.startsWith("/user")) {
    if (isPublicProspectFlow) {
      return NextResponse.next();
    }

    const token = req.cookies.get(USER_COOKIE_NAME)?.value;

    if (!token) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("redirect", `${pathname}${search || ""}`);
      return NextResponse.redirect(loginUrl);
    }
  }

  if (pathname.startsWith("/admin")) {
    const adminToken = req.cookies.get(ADMIN_COOKIE_NAME)?.value;

    if (!adminToken) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/user/:path*", "/admin/:path*"],
};
