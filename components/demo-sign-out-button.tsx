"use client";

import { LogOut } from "lucide-react";

import { useDemoStore } from "@/lib/stores/useDemoStore";

type DemoSignOutButtonProps = {
  className?: string;
};

export function DemoSignOutButton({ className }: DemoSignOutButtonProps) {
  const resetDemo = useDemoStore((state) => state.resetDemo);

  function handleSignOut() {
    resetDemo();
    if (typeof window === "undefined") return;

    window.sessionStorage.removeItem("lecturemind_demo");
    window.sessionStorage.removeItem("lecturemind-demo");
    window.location.assign("/demo/logout");
  }

  return (
    <button
      className={
        className ??
        "inline-flex items-center gap-2 rounded-md border border-black/10 px-3 py-2 text-sm font-medium transition hover:border-lm-indigo dark:border-white/10"
      }
      onClick={handleSignOut}
      type="button"
    >
      <LogOut className="h-4 w-4" />
      Sign out
    </button>
  );
}
