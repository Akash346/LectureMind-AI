"use client";

import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useUIStore } from "@/lib/stores/useUIStore";

export function ThemeToggle() {
  const theme = useUIStore((state) => state.theme);
  const toggleTheme = useUIStore((state) => state.toggleTheme);
  const isDark = theme === "dark";

  return (
    <Button
      aria-label="Toggle theme"
      onClick={toggleTheme}
      size="icon"
      type="button"
      variant="ghost"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
