"use client";

import { signIn, signOut } from "next-auth/react";
import { LogIn, LogOut } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function SignInButton() {
  const [pending, setPending] = useState(false);

  async function handleSignIn() {
    setPending(true);
    clearClientAuthState();

    try {
      await signOut({ callbackUrl: "/", redirect: false });
    } catch {
      // Starting OAuth with select_account is still safer than leaving the user stuck.
    }

    clearClientAuthState();
    await signIn(
      "google",
      { callbackUrl: "/dashboard" },
      { prompt: "select_account" }
    );
  }

  return (
    <Button disabled={pending} onClick={handleSignIn}>
      <LogIn className="h-4 w-4" />
      Sign in with Google
    </Button>
  );
}

export function SignOutButton() {
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    clearClientAuthState();
    await signOut({ callbackUrl: "/" });
  }

  return (
    <button
      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
      disabled={pending}
      onClick={handleSignOut}
      type="button"
    >
      <LogOut className="h-4 w-4" />
      Sign out
    </button>
  );
}

function clearClientAuthState() {
  if (typeof window === "undefined") {
    return;
  }

  removeAuthStorageKeys(window.localStorage);
  removeAuthStorageKeys(window.sessionStorage);
}

function removeAuthStorageKeys(storage: Storage) {
  const keysToRemove = new Set(["nextauth.message"]);

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);

    if (
      key &&
      (key.startsWith("lecturemind:auth") ||
        key.startsWith("lecturemind:user") ||
        key.startsWith("lecturemind:session"))
    ) {
      keysToRemove.add(key);
    }
  }

  for (const key of keysToRemove) {
    storage.removeItem(key);
  }
}
