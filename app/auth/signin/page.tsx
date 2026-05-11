"use client";

import * as React from "react";
import Link from "next/link";
import { Chrome, UserRound } from "lucide-react";
import { signIn, signOut } from "next-auth/react";
import { motion } from "motion/react";

import {
  GlassPanel,
  LMLogo,
  LMWordmark,
  PageShell,
  SecondaryButton
} from "@/components/ui/brand";

const spring = { type: "spring" as const, stiffness: 300, damping: 30 };

export default function SignInPage() {
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    window.sessionStorage.removeItem("lecturemind_demo");
    window.sessionStorage.removeItem("lecturemind-demo");
  }, []);

  async function handleGoogleSignIn() {
    setPending(true);
    clearClientAuthState();

    try {
      await signOut({ callbackUrl: "/", redirect: false });
    } catch {
      setPending(false);
    }

    clearClientAuthState();
    await signIn(
      "google",
      { callbackUrl: "/dashboard" },
      { prompt: "select_account" }
    );
  }

  return (
    <PageShell>
      <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="w-full max-w-3xl"
        >
          <GlassPanel className="p-8 sm:p-10">
            <div className="flex flex-col items-center text-center">
              <LMLogo size={54} />
              <LMWordmark className="mt-3 text-3xl" />
              <h1 className="mt-8 font-space-grotesk text-3xl font-semibold">
                Continue to LectureMind
              </h1>
              <p className="mt-4 max-w-2xl leading-7 text-black/70 dark:text-white/70">
                LectureMind uses sign in to save chats, notes, transcripts,
                study materials, and chat history so you can return later.
              </p>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <button
                type="button"
                disabled={pending}
                onClick={handleGoogleSignIn}
                className="group rounded-lg border border-black/10 bg-black/[0.04] p-5 text-left shadow-lg shadow-black/10 transition hover:border-[rgba(245,181,68,0.4)] focus:outline-none focus:ring-2 focus:ring-[rgba(245,181,68,0.6)] disabled:pointer-events-none disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.06]"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-lm-indigo text-white">
                  <Chrome className="h-5 w-5" />
                </span>
                <span className="mt-5 block text-lg font-semibold">
                  Continue with Google
                </span>
                <span className="mt-2 block text-sm leading-6 text-black/65 dark:text-white/65">
                  Save your lectures, study materials, and chat history.
                </span>
              </button>

              <Link
                href="/demo"
                className="group rounded-lg border border-black/10 bg-black/[0.04] p-5 text-left shadow-lg shadow-black/10 transition hover:border-[rgba(245,181,68,0.4)] focus:outline-none focus:ring-2 focus:ring-[rgba(245,181,68,0.6)] dark:border-white/10 dark:bg-white/[0.06]"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-lm-amber text-lm-ink">
                  <UserRound className="h-5 w-5" />
                </span>
                <span className="mt-5 block text-lg font-semibold">
                  Continue as Demo User
                </span>
                <span className="mt-2 block text-sm leading-6 text-black/65 dark:text-white/65">
                  No account needed. Your session is private and nothing is
                  saved.
                </span>
              </Link>
            </div>

            <div className="mt-8 flex justify-center">
              <SecondaryButton asChild>
                <Link href="/start">Back to audience selection</Link>
              </SecondaryButton>
            </div>
          </GlassPanel>
        </motion.div>
      </div>
    </PageShell>
  );
}

function clearClientAuthState() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem("lecturemind_demo");
  window.sessionStorage.removeItem("lecturemind-demo");
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
