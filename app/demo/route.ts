import { NextResponse } from "next/server";

import {
  createDemoCookieValue,
  deleteNextAuthCookies,
  demoCookieName
} from "@/lib/demo-cookie";
import { ensureDemoNotebook } from "@/lib/demo-notebook";
import { getOrCreateDemoUser } from "@/lib/demo-user";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const demoUser = await getOrCreateDemoUser();
  const demoNotebook = await ensureDemoNotebook({ userId: demoUser.id });

  const response = NextResponse.redirect(
    new URL(`/chats/${demoNotebook.notebookId}?demo=1`, url.origin)
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
