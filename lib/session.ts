import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { logAuthDebug } from "@/lib/auth-debug";
import { getDemoUserFromCookie } from "@/lib/demo-user";

export async function requireUser() {
  const demoUser = await getDemoUserFromCookie();

  if (demoUser) {
    logAuthDebug("require_demo_user", {
      sessionUserId: demoUser.id,
      providerEmail: demoUser.email
    });

    return demoUser;
  }

  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  logAuthDebug("require_user", {
    sessionUserId: session.user.id,
    providerEmail: session.user.email ?? null
  });

  return session.user;
}
