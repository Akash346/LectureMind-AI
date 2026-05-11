"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import { useDemoStore } from "@/lib/stores/useDemoStore";

export function DemoModeBadge() {
  const searchParams = useSearchParams();
  const isDemo = useDemoStore((state) => state.isDemo);
  const startDemo = useDemoStore((state) => state.startDemo);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    if (
      searchParams.get("demo") === "1" ||
      window.sessionStorage.getItem("lecturemind_demo") === "true"
    ) {
      startDemo();
      window.sessionStorage.setItem("lecturemind_demo", "true");
    }
  }, [searchParams, startDemo]);

  if (!isDemo) {
    return null;
  }

  return (
    <span className="rounded-full border border-[rgba(245,181,68,0.3)] bg-[rgba(245,181,68,0.1)] px-3 py-1 text-xs font-medium text-lm-amber">
      Demo Mode
    </span>
  );
}
