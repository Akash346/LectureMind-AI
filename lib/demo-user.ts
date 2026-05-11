import { cookies } from "next/headers";

import {
  demoCookieName,
  verifyDemoCookieValue
} from "@/lib/demo-cookie";
import {
  DEMO_USER_EMAIL,
  DEMO_USER_NAME
} from "@/lib/demo-notebook-content";
import { prisma } from "@/lib/prisma";

export { DEMO_USER_EMAIL, DEMO_USER_NAME };
export const DEMO_IMPERSONATION_EMAIL = "akashnallagonda9@gmail.com";

export type DemoUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  demoSource: "impersonated_existing_user" | "seeded_demo_user";
};

export async function getOrCreateDemoUser(): Promise<DemoUser> {
  const preferredEmail = resolveDemoImpersonationEmail();

  if (preferredEmail) {
    const existing = await prisma.user.findUnique({
      where: { email: preferredEmail },
      select: {
        id: true,
        name: true,
        email: true,
        image: true
      }
    });

    if (existing) {
      console.info(
        "[demo:user]",
        JSON.stringify({
          event: "demo_user_impersonation_resolved",
          email: preferredEmail,
          userId: existing.id
        })
      );

      return {
        ...existing,
        demoSource: "impersonated_existing_user"
      };
    }

    console.warn(
      "[demo:user]",
      JSON.stringify({
        event: "demo_user_impersonation_missing",
        email: preferredEmail
      })
    );
  }

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
  }).then((user) => ({
    ...user,
    demoSource: "seeded_demo_user" as const
  }));
}

export async function getDemoUserFromCookie(): Promise<DemoUser | null> {
  const cookieStore = await cookies();
  const demoCookie = cookieStore.get(demoCookieName)?.value;

  if (!(await verifyDemoCookieValue(demoCookie))) {
    return null;
  }

  return getOrCreateDemoUser();
}

function resolveDemoImpersonationEmail() {
  const configured = process.env.DEMO_IMPERSONATE_EMAIL?.trim();

  if (configured) {
    return configured.toLowerCase();
  }

  return DEMO_IMPERSONATION_EMAIL.toLowerCase();
}
