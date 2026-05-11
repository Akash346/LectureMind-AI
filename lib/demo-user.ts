import { cookies } from "next/headers";

import {
  demoCookieName,
  verifyDemoCookieValue
} from "@/lib/demo-cookie";
import { prisma } from "@/lib/prisma";

export const DEMO_USER_EMAIL = "demo@lecturemind.local";
export const DEMO_USER_NAME = "Demo User";

export type DemoUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

export async function getOrCreateDemoUser(): Promise<DemoUser> {
  return prisma.user.upsert({
    where: {
      email: DEMO_USER_EMAIL
    },
    update: {
      name: DEMO_USER_NAME
    },
    create: {
      email: DEMO_USER_EMAIL,
      emailVerified: new Date(0),
      name: DEMO_USER_NAME
    },
    select: {
      id: true,
      name: true,
      email: true,
      image: true
    }
  });
}

export async function getDemoUserFromCookie(): Promise<DemoUser | null> {
  const cookieStore = await cookies();
  const demoCookie = cookieStore.get(demoCookieName)?.value;

  if (!(await verifyDemoCookieValue(demoCookie))) {
    return null;
  }

  return getOrCreateDemoUser();
}
