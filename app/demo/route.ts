import { NextResponse } from "next/server";

import {
  createDemoCookieValue,
  deleteNextAuthCookies,
  demoCookieName
} from "@/lib/demo-cookie";
import { getOrCreateDemoUser } from "@/lib/demo-user";

export async function GET(request: Request) {
  const url = new URL(request.url);
  await getOrCreateDemoUser();

  const response = NextResponse.redirect(
    new URL("/dashboard", url.origin)
  );
  const value = await createDemoCookieValue();

  deleteNextAuthCookies(response);
  response.cookies.set(demoCookieName, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });

  return response;
}
