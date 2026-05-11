import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

import { demoCookieName, verifyDemoCookieValue } from "@/lib/demo-cookie";

export async function middleware(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  });
  const hasSessionCookie =
    request.cookies.has("next-auth.session-token") ||
    request.cookies.has("__Secure-next-auth.session-token");

  if (token || hasSessionCookie) {
    const response = NextResponse.next();
    if (request.cookies.has(demoCookieName)) {
      response.cookies.delete(demoCookieName);
    }
    return response;
  }

  const demoCookie = request.cookies.get(demoCookieName)?.value;
  const hasValidDemoCookie = await verifyDemoCookieValue(demoCookie);

  if (hasValidDemoCookie) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-lecturemind-demo", "true");
    return NextResponse.next({
      request: {
        headers: requestHeaders
      }
    });
  }

  const signInUrl = new URL("/auth/signin", request.url);
  signInUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/chats/:path*", "/notebooks/:path*"]
};
