"use client";

import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { LayoutDashboard } from "lucide-react";

import { DemoSignOutButton } from "@/components/demo-sign-out-button";
import { SignOutButton } from "@/components/auth-buttons";
import { ThemeToggle } from "@/components/theme-toggle";
import { LMLogo } from "@/components/ui/brand";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

type WorkspaceHeaderProps = {
  title?: string;
  isDemo?: boolean;
  user?: {
    image?: string | null;
    name?: string | null;
  } | null;
};

export function WorkspaceHeader({
  title,
  isDemo = false,
  user
}: WorkspaceHeaderProps) {
  const { data: session, status } = useSession();
  const isDemoMode = isDemo;
  const showDemoBadge = isDemoMode;
  const profileImage = session?.user?.image ?? user?.image;
  const profileName = session?.user?.name ?? user?.name;
  const hasProfile = status === "authenticated" || Boolean(user);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-black/10 bg-lm-paper/90 px-4 backdrop-blur-xl dark:border-white/10 dark:bg-lm-ink/90">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/dashboard" className="shrink-0">
          <LMLogo size={28} />
        </Link>
        <h1 className="truncate font-space-grotesk text-base font-semibold">
          {title || "Untitled Chat"}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        {showDemoBadge ? (
          <span className="rounded-full border border-[rgba(245,181,68,0.35)] bg-[rgba(245,181,68,0.12)] px-3 py-1 text-xs font-medium text-lm-indigo dark:text-lm-amber">
            Demo Mode
          </span>
        ) : null}
        <ThemeToggle />
        {isDemoMode ? (
          <DemoSignOutButton className="inline-flex items-center gap-2 rounded-md border border-black/10 px-3 py-2 text-sm font-medium transition hover:border-lm-indigo dark:border-white/10" />
        ) : hasProfile ? (
          <ProfileMenu
            image={profileImage}
            name={profileName}
            signOutMode={status === "authenticated" ? "auth" : "demo"}
          />
        ) : (
          <div className="h-9 w-9 rounded-full border border-black/10 bg-black/[0.04] dark:border-white/10 dark:bg-white/[0.06]" />
        )}
      </div>
    </header>
  );
}

function ProfileMenu({
  image,
  name,
  signOutMode
}: {
  image?: string | null;
  name?: string | null;
  signOutMode: "auth" | "demo";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-lm-indigo/40"
          aria-label="Open profile menu"
        >
          <Avatar image={image} name={name} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link href="/dashboard" className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
        </DropdownMenuItem>
        {signOutMode === "demo" ? (
          <DemoSignOutButton className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground" />
        ) : (
          <SignOutButton />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Avatar({
  image,
  name
}: {
  image?: string | null;
  name?: string | null;
}) {
  if (image) {
    return (
      <Image
        alt={name ?? "User"}
        className="h-9 w-9 rounded-full border border-black/10 dark:border-white/10"
        height={36}
        src={image}
        width={36}
      />
    );
  }

  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-black/[0.04] text-sm font-semibold dark:border-white/10 dark:bg-white/[0.06]">
      {name?.charAt(0) ?? "U"}
    </div>
  );
}
