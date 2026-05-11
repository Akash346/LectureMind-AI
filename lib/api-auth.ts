import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { logAuthDebug } from "@/lib/auth-debug";
import { getDemoUserFromCookie } from "@/lib/demo-user";

export async function getApiUser() {
  const demoUser = await getDemoUserFromCookie();

  if (demoUser) {
    logAuthDebug("api_demo_user", {
      sessionUserId: demoUser.id,
      providerEmail: demoUser.email
    });

    return demoUser;
  }

  const session = await getServerSession(authOptions);

  if (session?.user?.id) {
    logAuthDebug("api_user", {
      sessionUserId: session.user.id,
      providerEmail: session.user.email ?? null
    });
  }

  return session?.user?.id ? session.user : null;
}
