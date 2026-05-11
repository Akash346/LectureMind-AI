import { NextResponse } from "next/server";

import { createDemoCookieValue, demoCookieName } from "@/lib/demo-cookie";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const response = NextResponse.redirect(
    new URL("/dashboard?demo=1", url.origin)
  );
  const value = await createDemoCookieValue();

  response.cookies.set(demoCookieName, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });

  return response;
}
