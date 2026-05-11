"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { motion } from "motion/react";
import { useSession } from "next-auth/react";

import { NewChatSheet } from "@/components/dashboard/NewChatSheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { LMLogo, LMWordmark } from "@/components/ui/brand";
import { useDemoUiFlag } from "@/components/ui/brand/useDemoUiFlag";
import { useDemoStore } from "@/lib/stores/useDemoStore";
import { formatRelativeTime } from "@/lib/utils/time";

export type ChatCard = {
  id: string;
  title: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  createdAt?: string;
  artifacts?: {
    outline?: boolean;
    summary?: boolean;
    flashcards?: boolean;
    mindMap?: boolean;
    quiz?: boolean;
    report?: boolean;
  };
};

type DashboardClientProps = {
  initialChats: ChatCard[];
  initialIsDemo?: boolean;
  user?: {
    name?: string | null;
    image?: string | null;
  } | null;
};

const spring = { type: "spring" as const, stiffness: 300, damping: 30 };

const artifactLabels = [
  { key: "outline" as const, label: "Outline" },
  { key: "summary" as const, label: "Summary" },
  { key: "flashcards" as const, label: "Flashcards" },
  { key: "quiz" as const, label: "Quiz" },
  { key: "mindMap" as const, label: "Mind Map" },
  { key: "report" as const, label: "Report" }
];

export function DashboardClient({
  initialChats,
  initialIsDemo = false,
  user
}: DashboardClientProps) {
  const { status } = useSession();
  const isDemoUiFlag = useDemoUiFlag();
  const demoChats = useDemoStore((state) => state.chats);
  const startDemo = useDemoStore((state) => state.startDemo);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const isAuthenticated = status === "authenticated" || Boolean(user);
  const isDemo = !isAuthenticated && (initialIsDemo || isDemoUiFlag);

  React.useEffect(() => {
    if (isDemo && demoChats.length === 0) {
      startDemo();
    }
  }, [demoChats.length, isDemo, startDemo]);

  const chats = isDemo ? demoChats : initialChats;
  const filteredChats = chats.filter((chat) =>
    chat.title.toLowerCase().includes(query.toLowerCase())
  );
  const showDemoBadge = status === "unauthenticated" && isDemoUiFlag;

  return (
    <main className="min-h-screen bg-lm-paper text-lm-ink dark:bg-lm-ink dark:text-lm-paper">
      <header className="sticky top-0 z-40 border-b border-black/10 bg-lm-paper/85 backdrop-blur-2xl dark:border-white/10 dark:bg-lm-ink/85">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-3">
            <LMLogo size={30} />
            <LMWordmark className="text-xl" />
          </Link>
          <div className="flex items-center gap-3">
            {showDemoBadge ? (
              <span className="rounded-full border border-[rgba(245,181,68,0.35)] bg-[rgba(245,181,68,0.12)] px-3 py-1 text-xs font-medium text-lm-indigo dark:text-lm-amber">
                Demo Mode
              </span>
            ) : null}
            <ThemeToggle />
            {isAuthenticated ? <Avatar user={user} /> : null}
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-[1200px] px-5 pb-16 pt-12">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="font-space-grotesk text-4xl font-semibold">
            Your chats
          </h1>
          <Button onClick={() => setSheetOpen(true)} type="button">
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </div>

        <div className="relative mt-8 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/45 dark:text-white/45" />
          <input
            className="h-11 w-full rounded-md border border-black/10 bg-black/[0.03] pl-10 pr-3 text-sm outline-none transition placeholder:text-black/45 focus:border-lm-indigo dark:border-white/10 dark:bg-white/[0.06] dark:placeholder:text-white/45"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your chats"
            value={query}
          />
        </div>

        {filteredChats.length === 0 ? (
          <div className="mt-10 flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed border-black/15 bg-black/[0.02] p-8 text-center dark:border-white/15 dark:bg-white/[0.04]">
            <h2 className="font-space-grotesk text-2xl font-semibold">
              Paste your first lecture URL
            </h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-black/65 dark:text-white/65">
              LectureMind will build your study environment in under a minute
            </p>
            <Button className="mt-6" onClick={() => setSheetOpen(true)}>
              New Chat
            </Button>
          </div>
        ) : (
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredChats.map((chat) => (
              <ChatCardView key={chat.id} chat={chat} isDemo={isDemo} />
            ))}
          </div>
        )}
      </section>

      <NewChatSheet
        isDemo={isDemo}
        onOpenChange={setSheetOpen}
        open={sheetOpen}
      />
    </main>
  );
}

function ChatCardView({ chat, isDemo }: { chat: ChatCard; isDemo: boolean }) {
  return (
    <motion.article
      whileHover={{ y: -3 }}
      transition={spring}
      className="overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.06]"
    >
      <Link
        className="block h-full"
        href={`/chats/${chat.id}${isDemo ? "?demo=1" : ""}`}
      >
        <div className="aspect-video bg-black/[0.05] dark:bg-white/[0.06]">
          {chat.thumbnailUrl ? (
            <Image
              alt={chat.title}
              className="h-full w-full object-cover"
              height={360}
              src={chat.thumbnailUrl}
              width={640}
            />
          ) : (
            <div className="h-full w-full bg-[linear-gradient(135deg,rgba(61,59,217,0.2),rgba(245,181,68,0.22))]" />
          )}
        </div>
        <div className="space-y-4 p-4">
          <div>
            <h2 className="line-clamp-2 min-h-12 font-space-grotesk text-lg font-semibold leading-6">
              {chat.title || "Untitled Chat"}
            </h2>
            <p className="mt-2 text-sm text-black/55 dark:text-white/55">
              {formatRelativeTime(chat.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {artifactLabels.map((artifact) => {
              const ready = Boolean(chat.artifacts?.[artifact.key]);
              return (
                <span
                  key={artifact.key}
                  className={
                    ready
                      ? "rounded-full bg-lm-indigo px-3 py-1 text-xs font-medium text-white"
                      : "rounded-full border border-black/15 px-3 py-1 text-xs font-medium text-black/60 dark:border-white/15 dark:text-white/60"
                  }
                >
                  {artifact.label}
                </span>
              );
            })}
          </div>
        </div>
      </Link>
    </motion.article>
  );
}

function Avatar({
  user
}: {
  user?: {
    name?: string | null;
    image?: string | null;
  } | null;
}) {
  if (user?.image) {
    return (
      <Image
        alt={user.name ?? "User"}
        className="h-9 w-9 rounded-full border border-black/10 dark:border-white/10"
        height={36}
        src={user.image}
        width={36}
      />
    );
  }

  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-black/[0.04] text-sm font-semibold dark:border-white/10 dark:bg-white/[0.06]">
      {user?.name?.charAt(0) ?? "U"}
    </div>
  );
}
