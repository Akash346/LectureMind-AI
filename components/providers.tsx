"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <NextThemesProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
        storageKey="lecturemind_theme"
        disableTransitionOnChange
      >
        {children}
      </NextThemesProvider>
    </SessionProvider>
  );
}
