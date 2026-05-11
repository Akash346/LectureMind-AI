"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";

import {
  GlassPanel,
  PageShell,
  PrimaryButton,
  SecondaryButton
} from "@/components/ui/brand";

const prompts = [
  "Are you a Student",
  "Are you Faculty",
  "Are you Administration"
];

const spring = { type: "spring" as const, stiffness: 300, damping: 30 };

function TypewriterPrompt() {
  const [promptIndex, setPromptIndex] = React.useState(0);
  const [characterCount, setCharacterCount] = React.useState(0);

  React.useEffect(() => {
    const prompt = prompts[promptIndex];

    if (characterCount < prompt.length) {
      const timeout = window.setTimeout(
        () => setCharacterCount((count) => count + 1),
        48
      );
      return () => window.clearTimeout(timeout);
    }

    const timeout = window.setTimeout(() => {
      setPromptIndex((index) => (index + 1) % prompts.length);
      setCharacterCount(0);
    }, 1200);

    return () => window.clearTimeout(timeout);
  }, [characterCount, promptIndex]);

  return (
    <h1 className="min-h-[4.5rem] text-balance font-space-grotesk text-4xl font-semibold sm:text-5xl">
      {prompts[promptIndex].slice(0, characterCount)}
      <span className="text-lm-amber">|</span>
    </h1>
  );
}

export default function StartPage() {
  return (
    <PageShell>
      <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="w-full max-w-2xl"
        >
          <GlassPanel className="p-8 text-center sm:p-10">
            <TypewriterPrompt />
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <PrimaryButton asChild className="w-full">
                <Link href="/auth/signin">Student</Link>
              </PrimaryButton>
              <SecondaryButton asChild className="w-full">
                <Link href="/start/faculty">Faculty</Link>
              </SecondaryButton>
              <SecondaryButton asChild className="w-full">
                <Link href="/start/administration">Administration</Link>
              </SecondaryButton>
            </div>
            <Link
              href="/demo"
              className="mt-8 inline-flex text-sm font-medium text-black/70 transition hover:text-lm-indigo dark:text-white/70 dark:hover:text-lm-amber"
            >
              Demo user
            </Link>
          </GlassPanel>
        </motion.div>
      </div>
    </PageShell>
  );
}
