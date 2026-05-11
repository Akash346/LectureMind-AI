import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { headers } from "next/headers";

import { authOptions } from "@/lib/auth";

export default async function AppLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const isDemoRequest = requestHeaders.get("x-lecturemind-demo") === "true";

  if (isDemoRequest) {
    return children;
  }

  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  return children;
}
