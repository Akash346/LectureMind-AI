import Image from "next/image";
import Link from "next/link";
import type { User } from "next-auth";
import { Plus } from "lucide-react";

import { SignOutButton } from "@/components/auth-buttons";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

export function AppTopBar({ user }: { user: User }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
        <Brand />
        <div className="flex items-center gap-2">
          <Button asChild className="hidden sm:inline-flex" size="sm">
            <Link href="/notebooks/new">
              <Plus className="h-4 w-4" />
              New notebook
            </Link>
          </Button>
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Open user menu"
                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border bg-muted"
                type="button"
              >
                {user.image ? (
                  <Image
                    alt={user.name ?? "User"}
                    height={36}
                    src={user.image}
                    width={36}
                  />
                ) : (
                  <span className="text-sm font-semibold">
                    {user.name?.charAt(0) ?? "U"}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href="/dashboard">Dashboard</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/notebooks/new">New notebook</Link>
              </DropdownMenuItem>
              <SignOutButton />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
