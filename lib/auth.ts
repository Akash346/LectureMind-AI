import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

import { LectureMindPrismaAdapter } from "@/lib/auth-adapter";
import { logAuthDebug } from "@/lib/auth-debug";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  adapter: LectureMindPrismaAdapter(),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          scope: "openid email profile",
          prompt: "select_account"
        }
      },
      profile(profile) {
        logAuthDebug("google_profile", {
          provider: "google",
          providerEmail:
            typeof profile.email === "string" ? profile.email : null,
          providerAccountId:
            typeof profile.sub === "string" ? profile.sub : null
        });

        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture
        };
      }
    })
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      const linkedUserId =
        account?.provider && account.providerAccountId
          ? await getLinkedInternalUserId({
              provider: account.provider,
              providerAccountId: account.providerAccountId
            })
          : null;

      logAuthDebug("sign_in_callback", {
        provider: account?.provider ?? null,
        providerEmail: getProviderEmail(profile, user.email),
        providerAccountId: account?.providerAccountId ?? null,
        internalUserId: linkedUserId
      });

      return true;
    },
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;

        logAuthDebug("session_created", {
          sessionUserId: session.user.id,
          providerEmail: session.user.email ?? null
        });
      }

      return session;
    }
  },
  events: {
    async createUser({ user }) {
      logAuthDebug("user_created", {
        internalUserId: user.id,
        providerEmail: user.email ?? null
      });
    },
    async linkAccount({ user, account }) {
      logAuthDebug("account_linked", {
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        internalUserId: user.id,
        providerEmail: user.email ?? null
      });
    },
    async signIn({ user, account, isNewUser }) {
      logAuthDebug("sign_in_completed", {
        provider: account?.provider ?? null,
        providerAccountId: account?.providerAccountId ?? null,
        internalUserId: user.id,
        providerEmail: user.email ?? null,
        isNewUser
      });
    }
  },
  pages: {
    signIn: "/"
  },
  session: {
    strategy: "database"
  }
};

async function getLinkedInternalUserId({
  provider,
  providerAccountId
}: {
  provider: string;
  providerAccountId: string;
}) {
  const linkedAccount = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider,
        providerAccountId
      }
    },
    select: {
      userId: true
    }
  });

  return linkedAccount?.userId ?? null;
}

function getProviderEmail(profile: unknown, fallback?: string | null) {
  if (profile && typeof profile === "object" && "email" in profile) {
    const email = (profile as { email?: unknown }).email;

    if (typeof email === "string") {
      return email;
    }
  }

  return fallback ?? null;
}
