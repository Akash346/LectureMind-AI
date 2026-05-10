"use client";

import { signIn, signOut } from "next-auth/react";
import { LogIn, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";

export function SignInButton() {
  return (
    <Button onClick={() => signIn("google", { callbackUrl: "/dashboard" })}>
      <LogIn className="h-4 w-4" />
      Sign in with Google
    </Button>
  );
}

export function SignOutButton() {
  return (
    <button
      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
      onClick={() => signOut({ callbackUrl: "/" })}
      type="button"
    >
      <LogOut className="h-4 w-4" />
      Sign out
    </button>
  );
}
