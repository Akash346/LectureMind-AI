import { NextResponse } from "next/server";

import { deleteDemoAndAuthCookies } from "@/lib/demo-cookie";

export function GET(request: Request) {
  const url = new URL(request.url);
  const response = NextResponse.redirect(new URL("/start", url.origin));

  deleteDemoAndAuthCookies(response);

  return response;
}
