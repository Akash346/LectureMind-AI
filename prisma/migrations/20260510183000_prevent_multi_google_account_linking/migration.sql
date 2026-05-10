-- Prevent one internal user from being linked to multiple accounts from the
-- same OAuth provider. Google identity is keyed by provider + providerAccountId.
CREATE UNIQUE INDEX "Account_userId_provider_key" ON "Account"("userId", "provider");
