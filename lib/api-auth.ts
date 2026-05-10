import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";

export async function getApiUser() {
  const session = await getServerSession(authOptions);

  return session?.user?.id ? session.user : null;
}
