"use client";

import Link from "next/link";
import { motion } from "motion/react";

import { GlassPanel, PageShell, PrimaryButton } from "@/components/ui/brand";

const spring = { type: "spring" as const, stiffness: 300, damping: 30 };

export default function FacultyStartPage() {
  return (
    <PageShell>
      <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="w-full max-w-xl"
        >
          <GlassPanel className="p-8 sm:p-10">
            <h1 className="font-space-grotesk text-3xl font-semibold">
              Faculty experience is coming soon.
            </h1>
            <p className="mt-4 leading-7 text-black/70 dark:text-white/70">
              LectureMind will help instructors review lecture accessibility,
              bias risk, and student readiness from the same grounded source.
            </p>
            <form
              className="mt-8 flex flex-col gap-3 sm:flex-row"
              onSubmit={(event) => event.preventDefault()}
            >
              <input
                className="min-h-12 flex-1 rounded-full border border-black/10 bg-black/[0.04] px-4 text-sm outline-none transition placeholder:text-black/40 focus:border-[rgba(245,181,68,0.6)] dark:border-white/10 dark:bg-white/[0.06] dark:placeholder:text-white/40"
                placeholder="Email address"
                type="email"
              />
              <PrimaryButton type="submit">Notify me</PrimaryButton>
            </form>
            <p className="mt-3 text-sm text-black/50 dark:text-white/50">
              This preview is not connected yet.
            </p>
            <Link
              href="/start"
              className="mt-8 inline-flex text-sm font-medium text-black/70 transition hover:text-lm-indigo dark:text-white/70 dark:hover:text-lm-amber"
            >
              Back to audience selection
            </Link>
          </GlassPanel>
        </motion.div>
      </div>
    </PageShell>
  );
}
