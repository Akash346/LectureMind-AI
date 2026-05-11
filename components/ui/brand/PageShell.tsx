"use client";

import * as React from "react";
import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { useSession } from "next-auth/react";

import { useUIStore } from "@/lib/stores/useUIStore";
import { LMLogo } from "./LMLogo";
import { LMWordmark } from "./LMWordmark";
import { useDemoUiFlag } from "./useDemoUiFlag";

type PageShellProps = {
  children: React.ReactNode;
  className?: string;
  showHeader?: boolean;
  showDemoBadge?: boolean;
};

export function PageShell({
  children,
  className = "",
  showHeader = true,
  showDemoBadge = false
}: PageShellProps) {
  const theme = useUIStore((state) => state.theme);
  const toggleTheme = useUIStore((state) => state.toggleTheme);

  return (
    <main
      className={`min-h-screen overflow-hidden bg-lm-paper text-lm-ink dark:bg-lm-ink dark:text-lm-paper ${className}`}
    >
      {showHeader ? (
        <header className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-3">
            <LMLogo size={34} />
            <LMWordmark className="text-xl" />
          </Link>
          <div className="flex items-center gap-3">
            {showDemoBadge ? (
              <React.Suspense fallback={null}>
                <DemoBadge />
              </React.Suspense>
            ) : null}
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-black/[0.04] text-lm-ink backdrop-blur-xl transition focus:outline-none focus:ring-2 focus:ring-[rgba(245,181,68,0.6)] dark:border-white/10 dark:bg-white/[0.06] dark:text-lm-paper"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </header>
      ) : null}
      {children}
    </main>
  );
}

function DemoBadge() {
  const isDemoUiFlag = useDemoUiFlag();
  const { status } = useSession();
  const isDemoBadgeVisible =
    status === "unauthenticated" && isDemoUiFlag;

  if (!isDemoBadgeVisible) {
    return null;
  }

  return (
    <span className="rounded-full border border-[rgba(245,181,68,0.3)] bg-[rgba(245,181,68,0.1)] px-3 py-1 text-xs font-medium text-lm-amber">
      Demo Mode
    </span>
  );
}
