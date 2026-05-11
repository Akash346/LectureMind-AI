"use client";

import * as React from "react";

import { useUIStore } from "@/lib/stores/useUIStore";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const hydrateTheme = useUIStore((state) => state.hydrateTheme);

  React.useEffect(() => {
    hydrateTheme();
  }, [hydrateTheme]);

  return <>{children}</>;
}
