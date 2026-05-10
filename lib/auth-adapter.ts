import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { Adapter, AdapterAccount } from "next-auth/adapters";

import { logAuthDebug } from "@/lib/auth-debug";
import { prisma } from "@/lib/prisma";

export function LectureMindPrismaAdapter(): Adapter {
  const adapter = PrismaAdapter(prisma);

  return {
    ...adapter,
    async getUserByAccount(
      providerAccountId: Pick<AdapterAccount, "provider" | "providerAccountId">
    ) {
      const user = await adapter.getUserByAccount?.(providerAccountId);

      if (user && providerAccountId.provider === "google") {
        await assertGoogleUserHasSingleProviderAccount({
          userId: user.id,
          providerAccountId: providerAccountId.providerAccountId
        });
      }

      logAuthDebug("adapter_get_user_by_account", {
        provider: providerAccountId.provider,
        providerAccountId: providerAccountId.providerAccountId,
        internalUserId: user?.id ?? null,
        providerEmail: user?.email ?? null
      });

      return user ?? null;
    },
    async linkAccount(account: AdapterAccount) {
      await assertGoogleAccountLinkIsSafe(account);

      const linked = await adapter.linkAccount?.(account);

      logAuthDebug("adapter_link_account", {
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        internalUserId: account.userId
      });

      return linked;
    }
  };
}

async function assertGoogleUserHasSingleProviderAccount({
  userId,
  providerAccountId
}: {
  userId: string;
  providerAccountId: string;
}) {
  const googleAccountsForUser = await prisma.account.findMany({
    where: {
      userId,
      provider: "google"
    },
    select: {
      providerAccountId: true
    },
    take: 2
  });

  const hasAnotherGoogleAccount = googleAccountsForUser.some(
    (account) => account.providerAccountId !== providerAccountId
  );

  if (!hasAnotherGoogleAccount) {
    return;
  }

  logAuthDebug("blocked_ambiguous_google_identity", {
    provider: "google",
    providerAccountId,
    internalUserId: userId
  });

  throw new Error(
    "This internal user has multiple Google identities. Clean up duplicate account links before signing in."
  );
}

async function assertGoogleAccountLinkIsSafe(account: AdapterAccount) {
  if (account.provider !== "google") {
    return;
  }

  const linkedProviderAccount = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: account.provider,
        providerAccountId: account.providerAccountId
      }
    },
    select: {
      userId: true
    }
  });

  if (
    linkedProviderAccount &&
    linkedProviderAccount.userId !== account.userId
  ) {
    logAuthDebug("blocked_google_account_relink", {
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      attemptedInternalUserId: account.userId,
      existingInternalUserId: linkedProviderAccount.userId
    });

    throw new Error("This Google account is already linked to another user.");
  }

  const existingGoogleAccountForUser = await prisma.account.findFirst({
    where: {
      userId: account.userId,
      provider: "google",
      NOT: {
        providerAccountId: account.providerAccountId
      }
    },
    select: {
      providerAccountId: true
    }
  });

  if (existingGoogleAccountForUser) {
    logAuthDebug("blocked_multiple_google_accounts_for_user", {
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      existingProviderAccountId: existingGoogleAccountForUser.providerAccountId,
      internalUserId: account.userId
    });

    throw new Error(
      "Google account linking is disabled. Sign out before switching accounts."
    );
  }
}
