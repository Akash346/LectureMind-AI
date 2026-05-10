import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { logAuthDebug } from "@/lib/auth-debug";

export async function getApiUser() {
  const session = await getServerSession(authOptions);

  if (session?.user?.id) {
    logAuthDebug("api_user", {
      sessionUserId: session.user.id,
      providerEmail: session.user.email ?? null
    });
  }

  return session?.user?.id ? session.user : null;
}
